const fetch = require('node-fetch');
const fs = require('fs');

async function test() {
    // Test oembed
    try {
        const oembedUrl = 'https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=NH8uI4EJ0bo&format=json';
        console.log('Fetching oembed...');
        const res = await fetch(oembedUrl);
        const json = await res.json();
        console.log('Oembed result:', JSON.stringify(json, null, 2));
    } catch (e) {
        console.error('Oembed failed:', e.message);
    }

    // Dump HTML
    try {
        const url = 'https://www.youtube.com/watch?v=NH8uI4EJ0bo';
        console.log(`Fetching ${url} HTML...`);
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            }
        });
        const html = await res.text();
        fs.writeFileSync('debug_youtube.html', html);
        console.log('HTML dumped to debug_youtube.html');
    } catch (e) {
        console.error('HTML dump failed:', e.message);
    }
}

test();
