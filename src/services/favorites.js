const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const FAVORITES_FILE = path.join(DATA_DIR, 'favorites.json');

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function readFavorites() {
    ensureDataDir();
    try {
        if (fs.existsSync(FAVORITES_FILE)) {
            const data = fs.readFileSync(FAVORITES_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('[Favorites] Error reading:', e.message);
    }
    return [];
}

function writeFavorites(entries) {
    ensureDataDir();
    fs.writeFileSync(FAVORITES_FILE, JSON.stringify(entries, null, 2));
}

const FavoritesService = {
    add(video) {
        const entries = readFavorites();
        // Don't add duplicates
        if (entries.some(e => e.id === video.id)) return;

        entries.unshift({
            id: video.id,
            title: video.title,
            thumbnail: video.thumbnail,
            author: video.author,
            duration: video.duration || '',
            addedAt: new Date().toISOString()
        });

        writeFavorites(entries);
    },

    remove(videoId) {
        const entries = readFavorites();
        writeFavorites(entries.filter(e => e.id !== videoId));
    },

    getAll() {
        return readFavorites();
    },

    isFavorite(videoId) {
        return readFavorites().some(e => e.id === videoId);
    }
};

module.exports = FavoritesService;
