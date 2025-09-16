// Server/src/app.js
/**
 * app.js
 *
 * What This File Does:
 *
 * This file defines and configures the core Express application for the ResQZone API.
 * It pulls in global middleware, config values, and routes, and returns a ready-to-use
 * Express `app` instance that can be started by a server entry point.
 *
 * 1. View & Routing Configuration
 *    - Sets EJS as the view engine and resolves view paths.
 *    - Applies `caseSensitiveRouting` and `trustProxy` from config.
 *
 * 2. Middleware Setup
 *    - Compression: Enables gzip/deflate compression for all responses.
 *    - Body Parsers: Parses JSON and URL-encoded request bodies.
 *    - Decryption: Uses `decryptMiddleware` to handle encrypted payloads (after body parsing).
 *    - Encryption: Uses `encryptMiddleware` to wrap outgoing responses.
 *    - Cookie Parser: Reads cookies from incoming requests.
 *    - Static Serving: Serves assets from `/www/static` and attaches favicon.
 *
 * 3. Optional Session Handling
 *    - If `enableSession` is true, configures sessions with `sessionSecret`.
 *    - Initializes Passport.js for authentication.
 *    - Enables flash messaging support.
 *
 * 4. Security & Access Controls
 *    - Sets permissive CORS headers for all origins and methods.
 *    - Adds global rate limiting (`rateLimitWindowMs`, `rateLimitMaxRequests`).
 *    - Returns `{ error: "Too many API requests" }` when limit is exceeded.
 *
 * 5. API Route Mounting
 *    - `/v0.0/users`        → User APIs
 *    - `/v0.0/news`         → News APIs
 *    - `/v0.0/documents`    → Document APIs
 *    - `/v0.0/chat`         → Chat APIs (with optional socket.io integration)
 *    - `/v0.0/quizzes`      → Quiz game APIs
 *    - `/v0.0/tasks`        → Task game APIs
 *    - `/v0.0/badges`       → Badge APIs
 *    - `/v0.0/dashboard`    → Dashboard APIs
 *    - `/v0.0/leaderboard`  → Leaderboard APIs
 *    - `/v0.0/alerts`       → Alert APIs
 *
 * 6. Error Handling
 *    - Adds a 404 handler for unmatched routes.
 *    - Defines a global error handler that renders `Error/error.ejs`.
 *
 * Notes:
 * - The `io` socket.io instance (if provided) is attached via `app.set('io', io)`
 *   so that routes can access it.
 * - Rate limiting is global but could be scoped by uncommenting the prefixed uses.
 * - This file does not itself call `app.listen`; it only returns the configured `app`.
 *
 * Author: Sunidhi Abhange
 */

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

    // Make socket.io instance accessible to routes if provided
    if (io) app.set('io', io);

    // EJS View Engine Setup
    app.set('views', path.join(__dirname, 'www/views'));
    app.set('view engine', 'ejs');
    app.set('case sensitive routing', caseSensitiveRouting);
    app.set('trust proxy', trustProxy);

    // Compress all HTTP responses
    app.use(compression());
    // Use this to show log Get output:- app.use(logger("dev"));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Decrypt any encrypted requests (must come AFTER body parsers)
    app.use(require('./middleware/decryptMiddleware'));

    // Encrypt responses if needed (optional use case)
    app.use(require('./middleware/encryptMiddleware'));

    // Express body parser
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());

    // Static routes
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

    // CORS Support
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

    // Rate Limiting
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

    // Routes
    app.use('/v0.0/users', require('./routes/v0.0/users')(db));
    app.use('/v0.0/news', require('./routes/v0.0/news')(db));
    app.use('/v0.0/documents', require('./routes/v0.0/documents')(db));

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

    // 404 handler
    app.use((req, res, next) => next(createError(404)));

    // Global error handler
    app.use((err, req, res, next) => {
        res.locals.message = err.message;
        res.locals.error = req.app.get('env') === 'development' ? err : {};
        res.status(err.status || 500);
        res.render('Error/error');
    });

    return app;
};
