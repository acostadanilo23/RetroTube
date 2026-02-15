const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const routes = require('./routes/index');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Body parser for POST forms
app.use(express.urlencoded({ extended: false }));

// Compression for GZIP/Brotli
const compression = require('compression');
app.use(compression());

// Cookie parser for theme persistence
app.use(cookieParser());

// Inject mode, theme, and currentUrl into all views
app.use((req, res, next) => {
    // Mode from query (?mode=text|audio|normal)
    res.locals.mode = req.query.mode || 'normal';
    res.locals.currentUrl = req.originalUrl;

    // Theme: if specified in query, save to cookie
    if (req.query.theme) {
        res.cookie('theme', req.query.theme, { maxAge: 365 * 24 * 60 * 60 * 1000 });
        res.locals.theme = req.query.theme;
    } else {
        res.locals.theme = req.cookies.theme || 'default';
    }

    next();
});

// Routes
app.use('/', routes);

// Error handling
// 404 Handler
app.use((req, res, next) => {
    res.status(404).render('error', { message: 'Page Not Found', error: { status: 404 } });
});

// Global Error Handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).render('error', { message: err.message || 'Something went wrong!', error: err });
});

app.listen(PORT, () => {
    console.log(`RetroTube running on http://localhost:${PORT}`);

    // Pre-fetch trending + subscribed channels in background
    const YoutubeService = require('./services/youtube');
    YoutubeService.warmup();
});
