const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '../data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'database.sqlite');
const db = new Database(DB_PATH); // { verbose: console.log } for debugging

// Enable WAL for better concurrency
db.pragma('journal_mode = WAL');

// Initialize Schema
function init() {
    // Users table
    db.prepare(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `).run();

    // Favorites table
    db.prepare(`
        CREATE TABLE IF NOT EXISTS favorites (
            user_id TEXT,
            video_id TEXT,
            title TEXT,
            thumbnail TEXT,
            author TEXT,
            duration TEXT,
            added_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, video_id),
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `).run();

    // History table
    db.prepare(`
        CREATE TABLE IF NOT EXISTS history (
            user_id TEXT,
            video_id TEXT,
            title TEXT,
            thumbnail TEXT,
            author TEXT,
            duration TEXT,
            watched_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `).run();

    // Subscriptions table
    db.prepare(`
        CREATE TABLE IF NOT EXISTS subscriptions (
            user_id TEXT,
            channel_id TEXT,
            name TEXT,
            avatar TEXT,
            added_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, name),
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `).run();
}

init();

module.exports = db;
