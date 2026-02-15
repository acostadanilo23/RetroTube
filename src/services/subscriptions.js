const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const SUBS_FILE = path.join(DATA_DIR, 'subscriptions.json');

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function readSubs() {
    ensureDataDir();
    try {
        if (fs.existsSync(SUBS_FILE)) {
            const data = fs.readFileSync(SUBS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('[Subscriptions] Error reading:', e.message);
    }
    return [];
}

function writeSubs(entries) {
    ensureDataDir();
    fs.writeFileSync(SUBS_FILE, JSON.stringify(entries, null, 2));
}

const SubscriptionsService = {
    /**
     * Subscribe to a channel.
     * @param {{ name: string, avatar?: string }} channel
     */
    add(channel) {
        const entries = readSubs();
        if (entries.some(e => e.name === channel.name)) return;

        entries.push({
            name: channel.name,
            id: channel.id || '',
            avatar: channel.avatar || '',
            addedAt: new Date().toISOString()
        });

        writeSubs(entries);
    },

    /**
     * Unsubscribe from a channel by name.
     */
    remove(channelName) {
        const entries = readSubs();
        writeSubs(entries.filter(e => e.name !== channelName));
    },

    /**
     * Get all subscribed channels.
     */
    getAll() {
        return readSubs();
    },

    /**
     * Check if subscribed to a channel.
     */
    isSubscribed(channelName) {
        return readSubs().some(e => e.name === channelName);
    }
};

module.exports = SubscriptionsService;
