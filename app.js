var cluster = require('cluster');

console.log('New thread launched!');

var MAIN_CONFIG = 'config.json';
var COIN_CONFIGS = 'coins/';
var POOL_CONFIGS = 'pools/';

var allCoins = [];

function processOptions(options) {
    if(fs.existsSync(COIN_CONFIGS + options.coin)) {
        options.coin = JSON.parse(fs.readFileSync(COIN_CONFIGS + options.coin, {encoding: 'utf8'}));
        if(allCoins.indexOf(options.coin.symbol) === -1) allCoins.push({ symbol: options.coin.symbol, daemons: options.daemons });
        if(options.auxes) {
            options.auxes.forEach(processOptions);
            options.auxes.forEach(function(aux) {
                for(var key in aux.coin) aux[key] = aux.coin[key];
                delete aux.coin;
            });
        }
    }
    else {
        console.log('Could not get coin config for ' + JSON.stringify(options));
        // Try to ignore, but it will end in an inevitable failure.
    }
}

if(cluster.isMaster) {
    var fs = require('fs');
    var path = require('path');
    var express = require('express');
    var path = require('path');
    var favicon = require('static-favicon');
    var cookieParser = require('cookie-parser');
    var bodyParser = require('body-parser');
    var logger = require('morgan');

    var routes = require('./routes/index');
    var users = require('./routes/user');

    var poolOptions = [];

    // Read main configuration file
    if(!fs.existsSync(MAIN_CONFIG)) console.log('Main configuration file not found! Please copy the example file and edit it to your liking!');
    var config = JSON.parse(fs.readFileSync(MAIN_CONFIG, {encoding: 'utf8'}));

    // Spawn pool worker instances
    fs.readdirSync(POOL_CONFIGS).forEach(function(file) {
        if(!fs.existsSync(POOL_CONFIGS + file) || path.extname(POOL_CONFIGS + file) !== '.json') return;
        var options = JSON.parse(fs.readFileSync(POOL_CONFIGS + file, {encoding: 'utf8'}));

        processOptions(options);

        poolOptions.push(options);
        // Fork thread
        cluster.fork({ type: 'pool', options: JSON.stringify(options) });
    });

    // Spawn coin payment daemon
    cluster.fork({ type: 'payouts', coins: JSON.stringify(allCoins), payouts: JSON.stringify(config.payouts) });

    // Now start website

    var app = express();

    // view engine setup
    app.set('views', path.join(__dirname, 'views'));
    app.set('view engine', 'jade');

    app.use(favicon());
    app.use(logger('dev'));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded());
    app.use(cookieParser());
    app.use(express.static(path.join(__dirname, 'public')));

    app.use('/', routes);
    app.use('/user', users);

    /// catch 404 and forward to error handler
    app.use(function(req, res, next) {
        var err = new Error('Not Found');
        err.status = 404;
        next(err);
    });

    /// error handlers

    // development error handler
    // will print stacktrace
    if (app.get('env') === 'development') {
        app.use(function(err, req, res, next) {
            res.status(err.status || 500);
            res.render('error', {
                message: err.message,
                error: err
            });
        });
    }

    // production error handler
    // no stacktraces leaked to user
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: {}
        });
    });


    module.exports = app;
}
else {
    var t = null;
    if(process.env.type === 'pool') t = require('./worker');
    else if(process.env.type === 'payouts') t = require('./payouts');
    else {
        console.log('Unknown thread type: ' + process.env.type);
    }
    if(t) t.run();
}
