const db = require('../database');

const SubscriptionsService = {
    /**
     * Subscribe to a channel.
     * @param {string} userId
     * @param {{ name: string, id: string, avatar?: string }} channel
     */
    add(userId, channel) {
        if (!userId) return;
        try {
            // Uses name as part of PK, ensuring unique subscription per user per channel name
            const stmt = db.prepare(`
                INSERT OR IGNORE INTO subscriptions (user_id, channel_id, name, avatar)
                VALUES (?, ?, ?, ?)
            `);
            // channel.id might be empty in some legacy calls, but we try to persist it if available
            stmt.run(userId, channel.id || '', channel.name, channel.avatar || '');
        } catch (error) {
            console.error('[Subscriptions] Add failed:', error);
        }
    },

    /**
     * Unsubscribe from a channel by name.
     */
    remove(userId, channelName) {
        if (!userId) return;
        try {
            const stmt = db.prepare('DELETE FROM subscriptions WHERE user_id = ? AND name = ?');
            stmt.run(userId, channelName);
        } catch (error) {
            console.error('[Subscriptions] Remove failed:', error);
        }
    },

    /**
     * Get all subscribed channels.
     */
    getAll(userId) {
        if (!userId) return [];
        try {
            return db.prepare('SELECT user_id, channel_id as id, name, avatar, added_at FROM subscriptions WHERE user_id = ? ORDER BY added_at ASC').all(userId);
        } catch (error) {
            console.error('[Subscriptions] Get all failed:', error);
            return [];
        }
    },

    /**
     * Check if subscribed to a channel.
     */
    isSubscribed(userId, channelName) {
        if (!userId) return false;
        try {
            const stmt = db.prepare('SELECT 1 FROM subscriptions WHERE user_id = ? AND name = ?');
            return !!stmt.get(userId, channelName);
        } catch (error) {
            console.error('[Subscriptions] Check failed:', error);
            return false;
        }
    }
};

module.exports = SubscriptionsService;
