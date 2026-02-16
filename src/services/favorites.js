const db = require('../database');

const FavoritesService = {
    add(userId, video) {
        if (!userId) return;
        try {
            const stmt = db.prepare(`
                INSERT OR IGNORE INTO favorites (user_id, video_id, title, thumbnail, author, duration)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            stmt.run(userId, video.id, video.title, video.thumbnail, video.author, video.duration || '');
        } catch (error) {
            console.error('[Favorites] Add failed:', error);
        }
    },

    remove(userId, videoId) {
        if (!userId) return;
        try {
            const stmt = db.prepare('DELETE FROM favorites WHERE user_id = ? AND video_id = ?');
            stmt.run(userId, videoId);
        } catch (error) {
            console.error('[Favorites] Remove failed:', error);
        }
    },

    getAll(userId) {
        if (!userId) return [];
        try {
            // Newest first
            return db.prepare('SELECT user_id, video_id as id, title, thumbnail, author, duration, added_at FROM favorites WHERE user_id = ? ORDER BY added_at DESC').all(userId);
        } catch (error) {
            console.error('[Favorites] Get all failed:', error);
            return [];
        }
    },

    isFavorite(userId, videoId) {
        if (!userId) return false;
        try {
            const stmt = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND video_id = ?');
            return !!stmt.get(userId, videoId);
        } catch (error) {
            console.error('[Favorites] Check failed:', error);
            return false;
        }
    }
};

module.exports = FavoritesService;
