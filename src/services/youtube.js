const NodeCache = require('node-cache');
const fetch = require('node-fetch');

const cache = new NodeCache({ stdTTL: 600 });
const inflight = new Map();
const PAGE_SIZE = 10;

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9'
};

// ── Helpers ───────────────────────────────────────────────────────

function parseRelativeAge(text) {
    if (!text) return Infinity;
    const t = text.toLowerCase().replace('streamed ', '');
    const m = t.match(/(\d+)\s*(second|minute|hour|day|week|month|year)/);
    if (!m) return Infinity;
    const n = parseInt(m[1]);
    const units = { second: 1000, minute: 60000, hour: 3600000, day: 86400000, week: 604800000, month: 2592000000, year: 31536000000 };
    return n * (units[m[2]] || Infinity);
}

function formatDuration(seconds) {
    if (!seconds) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Dedup wrapper: if a request for `key` is already in-flight, return the same promise.
 */
async function dedup(key, fn) {
    const cached = cache.get(key);
    if (cached) return cached;
    if (inflight.has(key)) return inflight.get(key);
    const promise = fn();
    inflight.set(key, promise);
    try { return await promise; } finally { inflight.delete(key); }
}

/**
 * Fetch a YouTube page and extract ytInitialData.
 */
async function fetchYouTubePage(url) {

    const res = await fetch(url, { headers: HEADERS, redirect: 'follow', timeout: 15000 });
    const html = await res.text();


    const match = html.match(/var ytInitialData = ({.+?});<\/script>/s);
    const data = match ? JSON.parse(match[1]) : null;

    const playerResponseMatch = html.match(/var ytInitialPlayerResponse = ({.+?});(?:var|const|let|<\/script>)/s);
    let playerResponse = null;
    if (playerResponseMatch) {
        try {
            playerResponse = JSON.parse(playerResponseMatch[1]);

        } catch (e) {
            console.error('[YouTube] playerResponse parse error:', e.message);
        }
    } else {
        console.warn('[YouTube] playerResponse regex match FAILED');
    }

    const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
    const apiKey = apiKeyMatch ? apiKeyMatch[1] : null;
    return { html, data, playerResponse, apiKey };
}

// ── Service ───────────────────────────────────────────────────────
const YoutubeService = {
    /**
     * Search via direct YouTube HTML scraping.
     * Single HTTP request → parse ytInitialData → extract video results.
     */
    async search(query, page = 1, type = 'video') {
        const cacheKey = `search_${query}_${type}_p${page}`;
        let allVideos = cache.get(cacheKey);

        if (!allVideos) {

            let url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

            // Add filters
            if (type === 'playlist') {
                url += '&sp=EgIQAw%3D%3D'; // Type: Playlist
            }

            const { data } = await fetchYouTubePage(url);

            allVideos = [];
            const seen = new Set();

            if (data) {
                const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
                for (const section of contents) {
                    const items = section.itemSectionRenderer?.contents || [];
                    for (const item of items) {
                        // Video Results
                        if (item.videoRenderer && type === 'video') {
                            const v = item.videoRenderer;
                            if (v && v.videoId && !seen.has(v.videoId)) {
                                seen.add(v.videoId);
                                allVideos.push({
                                    id: v.videoId,
                                    title: v.title?.runs?.[0]?.text || '',
                                    thumbnail: v.thumbnail?.thumbnails?.pop()?.url || '',
                                    author: v.ownerText?.runs?.[0]?.text || 'Unknown',
                                    channelId: v.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '',
                                    publishedText: v.publishedTimeText?.simpleText || '',
                                    duration: v.lengthText?.simpleText || '',
                                    views: v.viewCountText?.simpleText || '',
                                    type: 'video'
                                });
                            }
                        }
                        // Playlist Results
                        if (item.playlistRenderer && type === 'playlist') {
                            const p = item.playlistRenderer;
                            if (p && p.playlistId && !seen.has(p.playlistId)) {
                                seen.add(p.playlistId);
                                allVideos.push({
                                    id: p.playlistId,
                                    title: p.title?.simpleText || '',
                                    thumbnail: p.thumbnails?.[0]?.thumbnails?.pop()?.url || '', // Playlist thumbnail is complex
                                    author: p.shortBylineText?.runs?.[0]?.text || 'Unknown',
                                    channelId: p.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '',
                                    videoCount: p.videoCount?.simpleText || '',
                                    type: 'playlist'
                                });
                            }
                        }
                        // New Playlist Results (LockupViewModel)
                        if (item.lockupViewModel && type === 'playlist') {
                            const p = item.lockupViewModel;
                            if (p && p.contentId && !seen.has(p.contentId)) {
                                seen.add(p.contentId);
                                // Extract video count
                                let videoCount = '';
                                const badges = p.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.overlays?.[0]?.thumbnailOverlayBadgeViewModel?.thumbnailBadges;
                                if (badges && badges.length > 0) {
                                    videoCount = badges[0].thumbnailBadgeViewModel?.text || '';
                                }

                                // Extract author
                                const authorText = p.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content || 'Unknown';
                                const authorId = p.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text?.commandRuns?.[0]?.onTap?.innertubeCommand?.browseEndpoint?.browseId || '';

                                allVideos.push({
                                    id: p.contentId,
                                    title: p.metadata?.lockupMetadataViewModel?.title?.content || '',
                                    thumbnail: p.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.image?.sources?.[0]?.url || '',
                                    author: authorText,
                                    channelId: authorId,
                                    videoCount: videoCount,
                                    type: 'playlist'
                                });
                            }
                        }
                    }
                }
            }
            cache.set(cacheKey, allVideos, 600);
        }

        // Paginate (search results are already paginated by YouTube usually, but we scrape one page)
        // If we want real pagination we need continuation token. 
        // For now, simpler to just return what we have (approx 20 results)
        // Our 'page' param in generic search was simulated slicing. 
        // We'll keep slicing for consistency if the cached array is large.

        return {
            results: allVideos,
            hasMore: false, // Simple search doesn't support deep pagination yet
            detectedChannel: null
        };
    },



    /**
     * Scrape the watch page. Extracts EVERYTHING from a single HTTP request:
     * video metadata, description, comment token, apiKey.
     * This replaces both youtube-sr's getVideo AND our old _scrapeWatchPage.
     */
    async _scrapeWatchPage(videoId) {
        // Cache v3 to invalidate potential bad cache
        const cacheKey = `watchpage_v3_${videoId}`;
        return dedup(cacheKey, () => this._doScrapeWatchPage(videoId, cacheKey));
    },

    async _doScrapeWatchPage(videoId, cacheKey) {
        try {
            const { html, data, playerResponse, apiKey } = await fetchYouTubePage(`https://www.youtube.com/watch?v=${videoId}`);
            if (!data) return { video: null, description: '', commentToken: null, apiKey: null };

            let description = '';
            let commentToken = null;
            let title = '', author = '', channelId = '', viewCount = '', uploadedAt = '', likes = null, duration = '';
            let thumbnail = '';

            // Extract duration from playerResponse
            if (playerResponse) {
                if (playerResponse.videoDetails && playerResponse.videoDetails.lengthSeconds) {
                    duration = formatDuration(parseInt(playerResponse.videoDetails.lengthSeconds));
                } else if (playerResponse.microformat && playerResponse.microformat.playerMicroformatRenderer && playerResponse.microformat.playerMicroformatRenderer.lengthSeconds) {
                    duration = formatDuration(parseInt(playerResponse.microformat.playerMicroformatRenderer.lengthSeconds));
                }
            }

            // Fallback: Extract from ytInitialData (microformat)
            if (!duration && data.microformat && data.microformat.playerMicroformatRenderer && data.microformat.playerMicroformatRenderer.lengthSeconds) {
                duration = formatDuration(parseInt(data.microformat.playerMicroformatRenderer.lengthSeconds));
            }

            if (duration) {

            } else {
                console.warn(`[YouTube] Duration NOT found for ${videoId}.`);
            }

            // Extract from playerOverlayVideoDetailsRenderer or meta tags
            const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/);
            const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/);
            title = ogTitle ? ogTitle[1] : '';
            thumbnail = ogImage ? ogImage[1] : '';

            // Extract from twoColumnWatchNextResults
            const results = data.contents?.twoColumnWatchNextResults?.results?.results;
            if (results && results.contents) {
                for (const item of results.contents) {
                    // Video primary info
                    if (item.videoPrimaryInfoRenderer) {
                        const vpi = item.videoPrimaryInfoRenderer;
                        if (!title) title = vpi.title?.runs?.[0]?.text || '';
                        viewCount = vpi.viewCount?.videoViewCountRenderer?.viewCount?.simpleText || '';
                        uploadedAt = vpi.dateText?.simpleText || '';

                        // Likes
                        const likeBtnVM = vpi.videoActions?.menuRenderer?.topLevelButtons;
                        if (likeBtnVM) {
                            for (const btn of likeBtnVM) {
                                const seg = btn.segmentedLikeDislikeButtonViewModel;
                                if (seg) {
                                    // Try nested likeButtonViewModel first (common)
                                    let likeBtn = seg.likeButtonViewModel?.likeButtonViewModel?.toggleButtonViewModel?.toggleButtonViewModel?.defaultButtonViewModel?.buttonViewModel;
                                    // Fallback to simpler path if structure changes
                                    if (!likeBtn) {
                                        likeBtn = seg.likeButtonViewModel?.likeButtonViewModel?.toggleButtonViewModel?.toggleButtonViewModel?.defaultButtonViewModel?.buttonViewModel;
                                    }

                                    if (likeBtn && likeBtn.title) {
                                        likes = likeBtn.title;
                                    }
                                }
                            }
                        }
                    }

                    // Video secondary info (channel + description)
                    if (item.videoSecondaryInfoRenderer) {
                        const vsi = item.videoSecondaryInfoRenderer;
                        author = vsi.owner?.videoOwnerRenderer?.title?.runs?.[0]?.text || author;
                        channelId = vsi.owner?.videoOwnerRenderer?.navigationEndpoint?.browseEndpoint?.browseId || channelId;

                        const ad = vsi.attributedDescription;
                        if (ad && ad.content) description = ad.content;
                    }

                    // Comment continuation token
                    if (item.itemSectionRenderer && item.itemSectionRenderer.contents) {
                        for (const c of item.itemSectionRenderer.contents) {
                            if (c.continuationItemRenderer) {
                                const ep = c.continuationItemRenderer.continuationEndpoint;
                                if (ep && ep.continuationCommand) {
                                    commentToken = ep.continuationCommand.token;
                                }
                            }
                        }
                    }
                }
            }

            const result = {
                video: {
                    id: videoId,
                    title,
                    description: description || 'Description unavailable.',
                    thumbnail,
                    embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
                    author: author || 'Unknown',
                    channelId,
                    viewCount,
                    uploadedAt,
                    viewCount,
                    uploadedAt,
                    duration,
                    likes,
                    dislikes: null
                },
                description,
                commentToken,
                apiKey
            };

            cache.set(cacheKey, result, 600);
            return result;
        } catch (e) {
            console.warn(`[YouTube] Watch page scrape failed: ${e.message}`);
            return { video: null, description: '', commentToken: null, apiKey: null };
        }
    },

    /**
     * Get video data. Now uses a single scrape instead of youtube-sr + fallback scrape.
     */
    async getVideo(id) {
        const cacheKey = `video_${id}`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;


        const pageData = await this._scrapeWatchPage(id);

        if (!pageData.video) {
            throw new Error('Video loading failed.');
        }

        cache.set(cacheKey, pageData.video);
        return pageData.video;
    },

    /**
     * Fetch comments using InnerTube API.
     * Reuses the watch page scrape (cached) for the comment token.
     */
    async getComments(videoId, limit) {
        limit = limit || 20;
        const cacheKey = `comments_${videoId}`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        try {
            const pageData = await this._scrapeWatchPage(videoId);
            if (!pageData.commentToken || !pageData.apiKey) {

                return [];
            }


            const commRes = await fetch(
                'https://www.youtube.com/youtubei/v1/next?key=' + pageData.apiKey,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...HEADERS },
                    body: JSON.stringify({
                        context: { client: { clientName: 'WEB', clientVersion: '2.20240101' } },
                        continuation: pageData.commentToken
                    }),
                    timeout: 10000
                }
            );
            const commData = await commRes.json();

            const comments = [];
            const pinnedIds = new Set();

            // Find pinned comment IDs
            const eps = commData.onResponseReceivedEndpoints || [];
            for (const ep of eps) {
                const items = (ep.reloadContinuationItemsCommand || {}).continuationItems ||
                    (ep.appendContinuationItemsAction || {}).continuationItems || [];
                for (const ci of items) {
                    if (ci.commentThreadRenderer) {
                        const cvm = ci.commentThreadRenderer.commentViewModel;
                        if (cvm && cvm.commentViewModel && cvm.commentViewModel.commentId) {
                            if (ci.commentThreadRenderer.renderingPriority === 'RENDERING_PRIORITY_PINNED_COMMENT') {
                                pinnedIds.add(cvm.commentViewModel.commentId);
                            }
                        }
                    }
                }
            }

            // Extract comment data from frameworkUpdates
            if (commData.frameworkUpdates && commData.frameworkUpdates.entityBatchUpdate) {
                const mutations = commData.frameworkUpdates.entityBatchUpdate.mutations || [];
                for (const mut of mutations) {
                    if (mut.payload && mut.payload.commentEntityPayload) {
                        const cp = mut.payload.commentEntityPayload;
                        const commentAuthor = cp.author ? cp.author.displayName : 'Unknown';
                        const content = (cp.properties && cp.properties.content && cp.properties.content.content) || '';
                        const commentId = (cp.properties && cp.properties.commentId) || '';
                        const isPinned = pinnedIds.has(commentId);

                        if (content) {
                            comments.push({ author: commentAuthor, text: content, isPinned });
                        }
                        if (comments.length >= limit) break;
                    }
                }
            }

            // Sort: pinned first
            comments.sort((a, b) => {
                if (a.isPinned && !b.isPinned) return -1;
                if (!a.isPinned && b.isPinned) return 1;
                return 0;
            });

            cache.set(cacheKey, comments, 600);
            return comments;
        } catch (e) {
            console.warn(`[YouTube] Comments fetch failed: ${e.message}`);
            return [];
        }
    },

    /**
     * Trending: direct scrape of YouTube trending page.
     * Cached for 30 minutes. Pre-fetched on startup.
     */
    async getTrending() {
        const cacheKey = 'trending';
        return dedup(cacheKey, () => this._doGetTrending(cacheKey));
    },

    async _doGetTrending(cacheKey) {
        try {

            // YouTube's trending page requires auth, so we search for recent popular content
            const { data } = await fetchYouTubePage('https://www.youtube.com/results?search_query=trending+today&sp=CAISAhAB');
            // sp=CAISAhAB = filter by upload date "Today" + sort by relevance

            const videos = [];
            const seen = new Set();

            if (data) {
                const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
                for (const section of contents) {
                    const items = section.itemSectionRenderer?.contents || [];
                    for (const item of items) {
                        const v = item.videoRenderer;
                        if (v && v.videoId && !seen.has(v.videoId)) {
                            seen.add(v.videoId);
                            videos.push({
                                id: v.videoId,
                                title: v.title?.runs?.[0]?.text || '',
                                thumbnail: v.thumbnail?.thumbnails?.pop()?.url || '',
                                author: v.ownerText?.runs?.[0]?.text || 'Unknown',
                                channelId: v.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '',
                                publishedText: v.publishedTimeText?.simpleText || '',
                                duration: v.lengthText?.simpleText || '',
                                views: v.viewCountText?.simpleText || ''
                            });
                        }
                        if (videos.length >= 12) break;
                    }
                    if (videos.length >= 12) break;
                }
            }

            cache.set(cacheKey, videos, 1800); // 30 min cache
            return videos;
        } catch (e) {
            console.error('[YouTube] Trending failed:', e.message);
            return [];
        }
    },

    /**
     * Scrape channel page for info + videos.
     * Cached for 1 hour (channels don't update that frequently).
     */
    async _scrapeChannelPage(channelName) {
        const cacheKey = `channelpage_${channelName}`;
        return dedup(cacheKey, () => this._doScrapeChannelPage(channelName, cacheKey));
    },

    async _doScrapeChannelPage(channelIdentifier, cacheKey) {
        try {
            let url;
            // If it looks like a channel ID (starts with UC and is long enough), use /channel/ URL
            if (channelIdentifier.startsWith('UC') && channelIdentifier.length >= 24) {

                url = `https://www.youtube.com/channel/${channelIdentifier}/videos`;
            } else {
                // Otherwise assume it's a handle or name
                const handle = channelIdentifier.replace(/\s+/g, '');

                url = `https://www.youtube.com/@${handle}/videos`;
            }

            const { html, data } = await fetchYouTubePage(url);

            // Extract channel info from meta tags
            const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/);
            const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/);
            const subMatch = html.match(/"content":"([\d.]+[MKBmkb]?\s*subscribers?)"/i);

            const info = {
                name: ogTitle ? ogTitle[1] : channelIdentifier,
                avatar: ogImage ? ogImage[1] : '',
                subscribers: subMatch ? subMatch[1] : ''
            };

            // Extract videos from ytInitialData
            const videos = [];
            if (data) {
                const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
                for (const tab of tabs) {
                    if (tab.tabRenderer?.title === 'Videos' || tab.tabRenderer?.content?.richGridRenderer) {
                        const contents = tab.tabRenderer.content?.richGridRenderer?.contents || [];
                        for (const item of contents) {
                            if (item.richItemRenderer) {
                                const v = item.richItemRenderer.content?.videoRenderer;
                                if (v && v.videoId) {
                                    videos.push({
                                        id: v.videoId,
                                        title: v.title?.runs?.[0]?.text || '',
                                        thumbnail: v.thumbnail?.thumbnails?.[0]?.url || '',
                                        author: info.name,
                                        channelId: channelIdentifier.startsWith('UC') ? channelIdentifier : '',
                                        publishedText: v.publishedTimeText?.simpleText || '',
                                        duration: v.lengthText?.simpleText || '',
                                        views: v.viewCountText?.simpleText || ''
                                    });
                                }
                            }
                        }
                    }
                }
            }

            const result = { info, videos };
            cache.set(cacheKey, result, 3600); // 1 hour cache for channels
            return result;
        } catch (e) {
            console.warn(`[YouTube] Channel page scrape failed: ${e.message}`);
            return {
                info: { name: channelIdentifier, avatar: '', subscribers: '' },
                videos: []
            };
        }
    },

    async getChannelInfo(channelName) {
        const data = await this._scrapeChannelPage(channelName);
        return data.info;
    },

    async _searchChannelId(name) {
        const cacheKey = `resolve_id_${name}`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;


        let channelId = null;

        // 1. Try direct handle/name lookup
        try {
            const handle = name.replace(/\s+/g, '');
            const url = `https://www.youtube.com/@${handle}`;
            const { html, data } = await fetchYouTubePage(url);

            // Extract ID from page content (canonical > browseId > channelId)
            const canonicalMatch = html.match(/<link rel="canonical" href="https:\/\/www.youtube.com\/channel\/(UC[^"]+)">/);
            const idMatch = canonicalMatch || html.match(/"browseId":"(UC[^"]+)"/) || html.match(/"channelId":"(UC[^"]+)"/);
            if (idMatch && data) {
                channelId = idMatch[1];

            }
        } catch (e) {
            // Ignore 404s etc, proceed to search
        }

        // 2. If direct lookup failed, fallback to search
        if (!channelId) {
            const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(name)}&sp=EgIQAg%3D%3D`;
            const { data } = await fetchYouTubePage(url);

            if (data) {
                const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
                for (const section of contents) {
                    const items = section.itemSectionRenderer?.contents || [];
                    for (const item of items) {
                        if (item.channelRenderer && item.channelRenderer.channelId) {
                            channelId = item.channelRenderer.channelId;
                            break;
                        }
                    }
                    if (channelId) break;
                }
            }
        }

        if (channelId) {

            cache.set(cacheKey, channelId, 86400); // Cache resolution for 24h
        } else {
            console.warn(`[YouTube] Could not resolve ID for: ${name}`);
        }
        return channelId;
    },

    async getChannelVideos(channelId, channelName, page = 1) {
        // 1. If we have a valid ID, use it.
        // 2. If no ID, try to resolve name -> ID via search.
        // 3. Fallback to name (handle guessing) if resolution fails.

        let targetId = channelId;
        if ((!targetId || !targetId.startsWith('UC')) && channelName) {
            targetId = await this._searchChannelId(channelName);
        }

        const key = (targetId && targetId.startsWith('UC')) ? targetId : (channelName || channelId);

        const cacheKey = `channelvids_${key}_p${page}`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;


        const data = await this._scrapeChannelPage(key);
        const allVideos = data.videos;

        const pageResults = allVideos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

        const result = {
            videos: pageResults,
            channelName: data.info.name,
            hasMore: allVideos.length > page * PAGE_SIZE
        };

        cache.set(cacheKey, result);
        return result;
    },

    /**
     * Pre-fetch trending and subscribed channels on startup.
     */
    async warmup() {

        this.getTrending().catch(e => {
            console.warn('[YouTube] Trending pre-fetch failed:', e.message);
        });

        // Pre-fetch subscribed channels
        try {
            const SubscriptionsService = require('./subscriptions');
            const channels = SubscriptionsService.getAll();
            if (channels.length > 0) {

                Promise.all(
                    channels.map(ch =>
                        this._scrapeChannelPage(ch.name).catch(e => {
                            console.warn(`[YouTube] Pre-fetch failed for ${ch.name}:`, e.message);
                        })
                    )
                );
            }
        } catch (e) {
            // Subscriptions service may not exist yet
        }
    }
};

module.exports = YoutubeService;
