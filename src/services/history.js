const db = require('../database');

const MAX_ENTRIES = 100;

const HistoryService = {
    add(userId, video) {
        if (!userId) return;
        try {
            const insert = db.transaction(() => {
                // 1. Remove existing entry for this video (so we can re-insert at top)
                db.prepare('DELETE FROM history WHERE user_id = ? AND video_id = ?').run(userId, video.id);

                // 2. Insert new entry
                db.prepare(`
                    INSERT INTO history (user_id, video_id, title, thumbnail, author, duration)
                    VALUES (?, ?, ?, ?, ?, ?)
                `).run(userId, video.id, video.title, video.thumbnail, video.author, video.duration || '');

                // 3. Prune old entries (keep latest 100)
                // Use a subquery to find the IDs to delete
                db.prepare(`
                    DELETE FROM history 
                    WHERE user_id = ? 
                    AND video_id NOT IN (
                        SELECT video_id FROM history 
                        WHERE user_id = ? 
                        ORDER BY watched_at DESC 
                        LIMIT ?
                    )
                `).run(userId, userId, MAX_ENTRIES);
            });

            insert();
        } catch (error) {
            console.error('[History] Add failed:', error);
        }
    },

    getAll(userId) {
        if (!userId) return [];
        try {
            return db.prepare('SELECT user_id, video_id as id, title, thumbnail, author, duration, watched_at FROM history WHERE user_id = ? ORDER BY watched_at DESC').all(userId);
        } catch (error) {
            console.error('[History] Get all failed:', error);
            return [];
        }
    },

    clear(userId) {
        if (!userId) return;
        try {
            db.prepare('DELETE FROM history WHERE user_id = ?').run(userId);
        } catch (error) {
            console.error('[History] Clear failed:', error);
        }
    }
};

module.exports = HistoryService;
