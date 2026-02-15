const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const MAX_ENTRIES = 100;

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function readHistory() {
    ensureDataDir();
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            const data = fs.readFileSync(HISTORY_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('[History] Error reading history:', e.message);
    }
    return [];
}

function writeHistory(entries) {
    ensureDataDir();
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(entries, null, 2));
}

const HistoryService = {
    add(video) {
        const entries = readHistory();

        // Remove duplicate if exists
        const filtered = entries.filter(e => e.id !== video.id);

        // Add to the beginning (most recent first)
        filtered.unshift({
            id: video.id,
            title: video.title,
            thumbnail: video.thumbnail,
            author: video.author,
            duration: video.duration || '',
            watchedAt: new Date().toISOString()
        });

        // Trim to max
        writeHistory(filtered.slice(0, MAX_ENTRIES));
    },

    getAll() {
        return readHistory();
    },

    clear() {
        writeHistory([]);
    }
};

module.exports = HistoryService;
