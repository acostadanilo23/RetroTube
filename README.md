# RetroTube

**Simple. Light. Functional.**

RetroTube is a lightweight, privacy-focused YouTube client designed to bring back the simplicity of video consumption. It is built to be fast, efficient, and distraction-free.

![RetroTube Logo](src/public/icon-192.png)

## Features

- **Lightweight**: fast loading times and minimal resource usage.
- **Privacy-Focused**: Proxied requests with no disk caching to minimize tracking.
- **Security Hardened**: Protected with CSP, Rate Limiting, and SSRF prevention.
- **PWA Support**: Installable on mobile and desktop devices.
- **Distraction-Free**: No algorithmic feeds, just what you want to watch.
- **Themes**: Includes Dark Mode and Terminal themes.
- **Functional**: Search, Favorites, History, and Subscriptions.

## Installation

### Prerequisites

- Node.js (v14 or higher)
- NPM

### Steps

1.  Clone the repository:
    ```bash
    git clone https://github.com/user/retrotube.git
    cd retrotube
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Start the server:
    ```bash
    npm start
    ```

4.  Open your browser at `http://localhost:3000`.

## Usage

- **Search**: Use the search bar to find videos or channels.
- **Watch**: Click on any video to watch it without interruptions.
- **Favorites/Subscriptions**: Save your favorite content locally (browser-based).

## Configuration

The application runs on port `3000` by default. You can change this by setting the `PORT` environment variable.

```bash
PORT=8080 npm start
```

## License

ISC

---

**Disclaimer**: RetroTube is an independent, open-source hobby project. It is not affiliated with, endorsed by, or associated with YouTube or Google. RetroTube does not host, upload, or modify any video content. All video content is delivered directly from YouTube’s official player.
