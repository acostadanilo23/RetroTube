# RetroTube Documentation

This document provides a comprehensive overview of the RetroTube application, its architecture, components, and design decisions.

## 1. Architecture

RetroTube follows a standard **Server-Side Rendering (SSR)** architecture using **Node.js** and **Express**. It acts as a proxy/scraper between the client and YouTube.

```mermaid
graph TD
    Client[Browser] <-->|HTTP Requests| Server[Express Server]
    Server <-->|Scraping/Requests| YouTube[YouTube]
    Server <-->|File I/O| Storage[JSON Storage (History/Favorites)]
```

### Flow
1.  **Request**: Client requests a page (e.g., `/watch?v=...`).
2.  **Processing**: Server receives the request.
3.  **Data Fetching**: `YoutubeService` fetches the corresponding YouTube page or API.
4.  **Parsing**: HTML is parsed (using Regex/String manipulation) to extract data (video URL, title, likes, etc.).
5.  **Rendering**: `EJS` templates invoke server-side rendering with the extracted data.
6.  **Response**: HTML is sent back to the Client.

## 2. File Structure

```
├── src
│   ├── app.js              # Entry point, Express setup
│   ├── routes
│   │   └── index.js        # All application routes
│   ├── services
│   │   ├── youtube.js      # Core scraping logic
│   │   ├── history.js      # Watch history management
│   │   ├── favorites.js    # Favorites management
│   │   └── subscriptions.js # Subscription management
│   ├── views               # EJS Templates
│   │   ├── index.ejs
│   │   ├── watch.ejs
│   │   └── ...
│   └── public              # Static assets (CSS, JS, Images)
├── data                    # Persistent storage (JSON files)
└── ...
```

## 3. Routes & Endpoints

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/` | **Homepage**. Fetches trending videos and renders `index.ejs`. |
| `GET` | `/search` | **Search**. Accepts `q` (query) and `type` (video/playlist). Renders `search.ejs`. |
| `GET` | `/watch` | **Watch Page**. Accepts `v` (videoId). Fetches metadata + comments. Renders `watch.ejs`. |
| `GET` | `/channel` | **Channel Page**. Accepts `name` or `id`. Fetches channel info + videos. Renders `channel.ejs`. |
| `GET` | `/proxy-image` | **Image Proxy**. Accepts `url`. Streams images from YouTube/Google to client (no disk write). |
| `GET` | `/history` | **History**. Displays watched videos from `history.json`. |
| `GET` | `/favorites` | **Favorites**. Displays saved videos from `favorites.json`. |
| `GET` | `/subscriptions` | **Subscriptions**. Displays feed from subscribed channels. |

## 4. Core Services

### `YoutubeService` (`src/services/youtube.js`)
The backbone of the application. It bypasses the YouTube Data API (which requires keys and has quotas) by scraping the web interface.

-   **`fetchYouTubePage(url)`**: Fetches HTML and extracts `ytInitialData` and `ytInitialPlayerResponse` JSON blobs using Regex. This is the fastest way to get data without rendering JS.
-   **`search(query)`**: Parses search results from the extracted JSON.
-   **`getVideo(id)`**: Extracts comprehensive video metadata (title, author, stream URL, duration, likes).
    -   *Duration Extraction logic*: Uses `ytInitialPlayerResponse.videoDetails.lengthSeconds`.
    -   *Likes Extraction logic*: traverses the complex `videoPrimaryInfoRenderer` view model.
-   **`getComments(id)`**: Uses the `API_KEY` found in the HTML to call YouTube's internal `next` endpoint for comments.

### Persistence Services (`src/services/*.js`)
Simple JSON-based storage is used to keep the app database-free and portable.

-   **`HistoryService`**: Stores last 100 watched videos.
-   **`FavoritesService`**: Stores favorites indefinitely.
-   **`SubscriptionsService`**: Stores subscribed channels. fetching the feed involves scraping the channel videos page for each subscription (in parallel chunks).

## 5. Design Decisions

1.  **No Database**: used simple JSON files.
    -   *Why?* Zero configuration. The app can be run anywhere with just `npm start`.
    -   *Trade-off*: Not suitable for thousands of users on a single instance (file locking/concurrency issues). Perfect for personal/single-user use.

2.  **Scraping vs API**:
    -   *Why?* Google's API has strict quotas and requires an API key. Scraping is anonymous (mostly) and unlimited for personal use.
    -   *Trade-off*: YouTube changes their DOM/JSON structure often, requiring maintenance updates (like we detailed in the "Likes" fix).

3.  **Server-Side Rendering (SSR)**:
    -   *Why?* Delivers HTML ready to render. Works without client-side JS (except for the player). Lightweight on the client device.

4.  **Lite YouTube Embed**:
    -   *Why?* The standard YouTube iframe is heavy (~1MB+ JS). We use a lightweight wrapper (`lite-youtube-embed`) that loads the iframe only on interaction, saving massive bandwidth.

## 6. Security Strategy

1.  **Image Proxy (`/proxy-image`)**:
    -   *Risk*: SSRF and Disk Exhaustion.
    -   *Mitigation*: Strict whitelist of allowed domains (`ytimg.com`, `ggpht.com`). Response is streamed directly to client without writing to disk.

2.  **Sanitization**:
    -   *Risk*: XSS in descriptions/comments.
    -   *Mitigation*: `sanitize-html` strips dangerous tags.

3.  **Security Headers (Helmet)**:
    -   *Implementation*: comprehensive Content Security Policy (CSP) configured to allow YouTube embeds while blocking malicious scripts.

4.  **Rate Limiting**:
    -   *Implementation*: Global limit of 100 requests per 15 minutes per IP to prevent DoS.

5.  **No User Tracking**:
    -   The app does not use cookies for tracking, only for basic preferences (theme).
    -   Requests to YouTube are made from the Server IP.

## 7. Performance Optimization

1.  **Caching**:
    -   `node-cache` is used to cache scrape results (SearchResults: 10m, VideoDetails: 10m, Channel: 1hr).
    -   This drastically reduces latency and the chance of being rate-limited by YouTube.

2.  **Parallel Fetching**:
    -   The Subscriptions feed scrapes multiple channels in parallel batches (Chunk size: 5) to minimize load times.
