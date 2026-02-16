/* public/js/lite-yt-embed.js */
class LiteYTEmbed extends HTMLElement {
    connectedCallback() {
        this.videoId = this.getAttribute('videoid');
        this.playLabel = this.getAttribute('playlabel') || 'Play';

        // Ensure play button exists
        if (!this.querySelector('.lty-playbtn')) {
            const playBtn = document.createElement('button');
            playBtn.type = 'button';
            playBtn.classList.add('lty-playbtn');
            playBtn.setAttribute('aria-label', this.playLabel);
            this.appendChild(playBtn);
        }

        // Warm up connections on hover
        this.addEventListener('pointerover', LiteYTEmbed.warmConnections, { once: true });

        // Load iframe on click
        this.addEventListener('click', this.addIframe);
    }

    static warmConnections() {
        if (LiteYTEmbed.preconnected) return;
        LiteYTEmbed.preconnected = true;

        const domains = [
            'https://www.youtube.com',
            'https://www.google.com'
        ];

        domains.forEach(domain => {
            const link = document.createElement('link');
            link.rel = 'preconnect';
            link.href = domain;
            document.head.append(link);
        });
    }

    addIframe() {
        if (this.classList.contains('lyt-activated')) return;
        this.classList.add('lyt-activated');

        const params = new URLSearchParams(this.getAttribute('params') || []);
        params.append('autoplay', '1');
        params.append('origin', window.location.origin);

        const iframe = document.createElement('iframe');
        iframe.width = 560;
        iframe.height = 315;
        iframe.title = this.playLabel;
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
        iframe.setAttribute('allowfullscreen', '');
        iframe.src = `https://www.youtube-nocookie.com/embed/${this.videoId}?${params.toString()}`;

        this.append(iframe);
    }
}
customElements.define('lite-youtube', LiteYTEmbed);
