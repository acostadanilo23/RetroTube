const express = require('express');
const router = express.Router();
const YoutubeService = require('../services/youtube');
const HistoryService = require('../services/history');
const FavoritesService = require('../services/favorites');
const SubscriptionsService = require('../services/subscriptions');
const sanitizeHtml = require('sanitize-html');

// Helper to sanitize description
function cleanText(text) {
    if (!text) return '';
    // Allow basic formatting but strip dangerous tags
    return sanitizeHtml(text.replace(/\n/g, '<br>'), {
        allowedTags: ['b', 'i', 'em', 'strong', 'br', 'p', 'a'],
        allowedAttributes: {
            'a': ['href']
        }
    });
}

// Secure Image Proxy
router.get('/proxy-image', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(404).send('No URL provided');

    try {
        const fetch = require('node-fetch');
        const parsedUrl = new URL(url);

        // Security: Whitelist allowed domains to prevent SSRF
        const allowedDomains = ['i.ytimg.com', 'yt3.ggpht.com', 'lh3.googleusercontent.com'];
        if (!allowedDomains.includes(parsedUrl.hostname)) {
            return res.status(403).send('Domain not allowed');
        }

        // Security: Only allow https
        if (parsedUrl.protocol !== 'https:') {
            return res.status(403).send('Protocol not allowed');
        }

        const response = await fetch(url, {
            headers: { 'User-Agent': 'RetroTube/1.0' }
        });

        if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);

        // Forward Content-Type
        const contentType = response.headers.get('content-type');
        if (contentType) res.setHeader('Content-Type', contentType);

        // Cache control for browser
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year

        // Stream directly to client (No disk write)
        response.body.pipe(res);

    } catch (error) {
        console.error(`[Proxy Error] ${error.message}`);
        res.status(500).send('Image load failed');
    }
});

router.get('/', async (req, res) => {
    try {
        const trending = await YoutubeService.getTrending();
        res.render('index', { trending });
    } catch (error) {
        res.render('index', { trending: [] });
    }
});

router.get('/search', async (req, res) => {
    const query = req.query.q;
    const type = req.query.type || 'video';
    const page = parseInt(req.query.page) || 1;
    if (!query) return res.redirect('/');

    try {
        const data = await YoutubeService.search(query, page, type);
        res.render('search', {
            query,
            type, // Pass type to view for filter UI
            results: data.results,
            page,
            hasMore: false,
            totalResults: data.results.length,
            detectedChannel: null, detectedChannelId: null
        });
    } catch (error) {
        res.render('search', { query, type: 'video', results: [], error: error.message, page, hasMore: false, totalResults: 0, detectedChannel: null });
    }
});

router.get('/watch', async (req, res, next) => {
    try {
        const videoId = req.query.v;

        if (!videoId) {
            return res.redirect('/');
        }



        // Prepare promises: always get video & comments.
        const promises = [
            YoutubeService.getVideo(videoId),
            YoutubeService.getComments(videoId, 20)
        ];

        const [video, comments] = await Promise.all(promises);

        video.description = cleanText(video.description);


        // Save to watch history
        HistoryService.add(req.userId, video);

        const isFavorite = FavoritesService.isFavorite(req.userId, videoId);
        res.render('watch', {
            video,
            isFavorite,
            comments
        });
    } catch (error) {
        console.error(`[Route Error] /watch failed: ${error.message}`);
        console.error(error.stack);
        next(error);
    }
});

// History
router.get('/history', (req, res) => {
    const history = HistoryService.getAll(req.userId);
    res.render('history', { history });
});

router.post('/history/clear', (req, res) => {
    HistoryService.clear(req.userId);
    res.redirect('/history');
});

// Favorites
router.get('/favorites', (req, res) => {
    const favorites = FavoritesService.getAll(req.userId);
    res.render('favorites', { favorites });
});

router.post('/favorites/add', (req, res) => {
    const { id, title, thumbnail, author, duration } = req.body;
    FavoritesService.add(req.userId, { id, title, thumbnail, author, duration });
    res.redirect('/watch?v=' + id);
});

router.post('/favorites/remove', (req, res) => {
    const { id } = req.body;
    FavoritesService.remove(req.userId, id);
    const returnTo = req.body.returnTo || '/favorites';
    res.redirect(returnTo);
});

// Subscriptions
router.get('/subscriptions', async (req, res) => {
    const channels = SubscriptionsService.getAll(req.userId);

    // Fetch latest videos from each subscribed channel in parallel
    let feed = [];
    if (channels.length > 0) {
        try {
            // Fetch in chunks to avoid rate limits
            const CHUNK_SIZE = 5;
            const results = [];

            for (let i = 0; i < channels.length; i += CHUNK_SIZE) {
                const chunk = channels.slice(i, i + CHUNK_SIZE);
                const chunkResults = await Promise.all(
                    chunk.map(ch =>
                        YoutubeService.getChannelVideos(ch.id, ch.name, 1)
                            .then(data => data.videos.slice(0, 5))
                            .catch(() => [])
                    )
                );
                results.push(...chunkResults);
            }
            feed = results.flat();
            // Sort by recency (parse relative dates)
            feed.sort((a, b) => {
                return parseAge(a.publishedText) - parseAge(b.publishedText);
            });
        } catch (e) {
            console.error('[Subscriptions] Feed error:', e.message);
        }
    }

    res.render('subscriptions', { channels, feed });
});

// Helper: parse relative time for sorting
function parseAge(text) {
    if (!text) return Infinity;
    const t = text.toLowerCase().replace('streamed ', '');
    const m = t.match(/(\d+)\s*(second|minute|hour|day|week|month|year)/);
    if (!m) return Infinity;
    const n = parseInt(m[1]);
    const units = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 };
    return n * (units[m[2]] || Infinity);
}

router.post('/subscriptions/add', (req, res) => {
    const { name, id, avatar } = req.body;
    SubscriptionsService.add(req.userId, { name, id, avatar });
    res.redirect('/channel?name=' + encodeURIComponent(name));
});

// Subscription Manager Routes
router.get('/subscriptions/manager', (req, res) => {
    res.render('manager');
});

router.post('/subscriptions/export', (req, res) => {
    const data = SubscriptionsService.getAll(req.userId);
    res.setHeader('Content-Disposition', 'attachment; filename="subscriptions.json"');
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(data, null, 2));
});

router.post('/subscriptions/import', async (req, res) => {
    const rawData = req.body.data || '';
    let count = 0;

    try {
        // 1. Try JSON
        try {
            const json = JSON.parse(rawData);
            if (Array.isArray(json)) {
                json.forEach(ch => {
                    if (ch.name || ch.id) {
                        SubscriptionsService.add(req.userId, ch);
                        count++;
                    }
                });
            }
        } catch (e) {
            // 2. CSV / Text Lines
            const lines = rawData.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                // Google Takeout CSV: "Channel Id,Channel Url,Channel Title"
                // Header line usually starts with "Channel Id"
                if (trimmed.startsWith('Channel Id')) continue;

                const parts = trimmed.split(',');
                if (parts.length >= 3 && parts[0].startsWith('UC')) {
                    // CSV format
                    const id = parts[0];
                    const name = parts[2] || parts[1]; // Title or URL
                    SubscriptionsService.add(req.userId, { id, name: name.replace(/"/g, ''), avatar: '' }); // Clean quotes
                    count++;
                } else if (trimmed.includes('youtube.com/')) {
                    // URL format
                    // Extract handle or ID? 
                    // Need to resolve. For now, try to extract handle
                    const m = trimmed.match(/@([\w.-]+)/);
                    if (m) {
                        SubscriptionsService.add(req.userId, { name: m[1], avatar: '' });
                        count++;
                    }
                }
            }
        }
        res.redirect('/subscriptions?msg=Imported+' + count + '+channels');
    } catch (error) {
        console.error('Import failed:', error);
        res.redirect('/subscriptions/manager?error=Import+Failed');
    }
});

router.post('/subscriptions/remove', (req, res) => {
    const { name } = req.body;
    SubscriptionsService.remove(req.userId, name);
    const returnTo = req.body.returnTo || '/subscriptions';
    res.redirect(returnTo);
});

// Channel
router.get('/channel', async (req, res, next) => {
    const channelName = req.query.name;
    const channelId = req.query.id || null;
    const page = parseInt(req.query.page) || 1;
    if (!channelName && !channelId) return res.redirect('/');

    try {
        // Call getChannelVideos first — it scrapes and caches the channel page.
        // Then getChannelInfo hits the cache (no extra HTTP request).
        const data = await YoutubeService.getChannelVideos(channelId, channelName, page);
        const channelInfo = await YoutubeService.getChannelInfo(channelName || channelId);

        const isSubscribed = SubscriptionsService.isSubscribed(req.userId, channelInfo.name || channelName);

        res.render('channel', {
            channelName: channelInfo.name || data.channelName || channelName,
            channelId: channelId,
            channelAvatar: channelInfo.avatar,
            channelSubscribers: channelInfo.subscribers,
            isSubscribed: isSubscribed,
            videos: data.videos,
            page,
            hasMore: data.hasMore
        });
    } catch (error) {
        next(error);
    }
});

// Auth / Identity Management
router.post('/auth/restore', (req, res) => {
    const { userId } = req.body;
    if (!userId || userId.length < 10) {
        return res.redirect('/subscriptions/manager?error=Invalid+ID');
    }

    res.cookie('userId', userId.trim(), {
        maxAge: 365 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax'
    });
    res.redirect('/subscriptions/manager?msg=ID+Restored');
});

module.exports = router;
