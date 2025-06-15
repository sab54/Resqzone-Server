const Config = require('../config');
const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const favicon = require('serve-favicon');
const passport = require('passport');
const flash = require('connect-flash');
const session = require('express-session');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// Config values
const {
    enableSession,
    sessionSecret,
    trustProxy,
    caseSensitiveRouting,
    rateLimitWindowMs,
    rateLimitMaxRequests,
} = Config.domains.resqzone_api;

module.exports = (db, io = null) => {
    const app = express();

    // ✅ Make socket.io instance accessible to routes if provided
    if (io) app.set('io', io);

    // EJS View Engine Setup
    app.set('views', path.join(__dirname, 'www/views'));
    app.set('view engine', 'ejs');
    app.set('case sensitive routing', caseSensitiveRouting);
    app.set('trust proxy', trustProxy);

    // Compress all HTTP responses
    app.use(compression());
    //Use this to show log Get output:- app.use(logger("dev"));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Decrypt any encrypted requests (must come AFTER body parsers)
    app.use(require('./middleware/decryptMiddleware'));

    // Encrypt responses if needed (optional use case)
    app.use(require('./middleware/encryptMiddleware'));

    // Express body parser
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());
    app.use(express.static(path.join(__dirname, 'www/static')));
    app.use(favicon(path.join(__dirname, 'www/static/Home/images/logo.png')));

    // Optional session support
    if (enableSession) {
        app.use(
            session({
                secret: sessionSecret,
                resave: false,
                saveUninitialized: true,
            })
        );
        app.use(passport.initialize());
        app.use(passport.session());
        app.use(flash());
    }

    // ✅ CORS Support
    app.use((req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader(
            'Access-Control-Allow-Methods',
            'GET, POST, OPTIONS, PUT, PATCH, DELETE'
        );
        res.setHeader(
            'Access-Control-Allow-Headers',
            'X-Requested-With,content-type'
        );
        res.setHeader('Access-Control-Allow-Credentials', true);
        next();
    });

    // ✅ Rate Limiting
    const limiter = rateLimit({
        windowMs: rateLimitWindowMs,
        max: rateLimitMaxRequests,
        message: { error: 'Too many API requests' },
    });
    app.use(limiter);

    // only apply to requests that begin with /api/
    /* app.use('/all/', limiter);
    app.use('/user/', limiter);
    app.use('/ads/', limiter); */
    app.options('*', (req, res) => res.sendStatus(200));

    // ⬇️ Pass db to routes that need it
    app.use('/v0.0/users', require('./routes/v0.0/users')(db));
    app.use('/v0.0/news', require('./routes/v0.0/news')(db));
    app.use('/v0.0/chat', require('./routes/v0.0/chat')(db, io));
    app.use('/v0.0/quizzes', require('./routes/v0.0/Games/quizzes')(db));
    app.use('/v0.0/tasks', require('./routes/v0.0/Games/tasks')(db));
    app.use('/v0.0/badges', require('./routes/v0.0/Games/badges')(db));
    app.use('/v0.0/dashboard', require('./routes/v0.0/Games/dashboard')(db));
    app.use(
        '/v0.0/leaderboard',
        require('./routes/v0.0/Games/leaderboard')(db)
    );
    app.use('/v0.0/alerts', require('./routes/v0.0/alerts')(db));

    // 404 Not Found
    app.use((req, res, next) => next(createError(404)));

    // General Error Handler
    app.use((err, req, res, next) => {
        res.locals.message = err.message;
        res.locals.error = req.app.get('env') === 'development' ? err : {};
        res.status(err.status || 500);
        res.render('Error/error');
    });

    return app;
};
