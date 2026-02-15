const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const routes = require('./routes/index');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

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

// Security Headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "www.youtube.com", "s.ytimg.com"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "i.ytimg.com", "yt3.ggpht.com"],
            frameSrc: ["'self'", "www.youtube.com", "www.youtube-nocookie.com"],
            connectSrc: ["'self'", "www.youtube.com"],
            mediaSrc: ["'self'", "googlevideo.com"]
        }
    }
}));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Cookie parser for theme persistence
app.use(cookieParser());

// Inject mode, theme, and currentUrl into all views
app.use((req, res, next) => {
    // Mode from query (?mode=text|audio|normal)
    res.locals.mode = req.query.mode || 'normal';
    res.locals.currentUrl = req.originalUrl;

    // Theme: if specified in query, save to cookie
    const allowedThemes = ['dark', 'light', 'terminal', 'default'];
    if (req.query.theme && allowedThemes.includes(req.query.theme)) {
        res.cookie('theme', req.query.theme, {
            maxAge: 365 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            sameSite: 'lax'
        });
        res.locals.theme = req.query.theme;
    } else {
        const cookieTheme = req.cookies.theme;
        res.locals.theme = allowedThemes.includes(cookieTheme) ? cookieTheme : 'default';
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
