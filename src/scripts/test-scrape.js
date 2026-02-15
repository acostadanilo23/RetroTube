const fetch = require('node-fetch');

async function scrape(videoId) {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`Fetching ${url}...`);
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const html = await res.text();

        // Extract description
        const descMatch = html.match(/<meta property="og:description" content="([^"]*)"/);
        const description = descMatch ? descMatch[1] : 'No description found.';

        console.log('Description:', description);

    } catch (e) {
        console.error('Error:', e);
    }
}

scrape('NH8uI4EJ0bo');
