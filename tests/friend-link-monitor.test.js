const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
    checkFriendLink,
    htmlContainsBacklink,
    nextFailCount,
    responseStatus
} = require('../backend/services/friend-link-monitor');
const {
    loadSource,
    loadSourceCandidates
} = require('../scripts/check-friend-links');

function sourceResponse(status = 200) {
    return new Response(status === 200
        ? JSON.stringify({ success: true, data: { length: 0, link_list: [], author_hosts: ['yachiyo.hk'] } })
        : 'upstream unavailable', {
        status,
        headers: { 'Content-Type': status === 200 ? 'application/json' : 'text/plain' }
    });
}

describe('friend link monitoring', () => {
    it('retries transient source failures with bounded exponential backoff', async () => {
        const requestedUrls = [];
        const delays = [];
        const source = await loadSource('https://yachiyo.hk/api/friend-links/source?run=test', {
            fetchUrl: async (url) => {
                requestedUrls.push(url);
                return sourceResponse(requestedUrls.length < 3 ? 503 : 200);
            },
            sleep: async delay => delays.push(delay),
            log: () => {}
        });

        assert.deepEqual(source.link_list, []);
        assert.deepEqual(delays, [1000, 2000]);
        assert.match(requestedUrls[0], /_monitor_attempt=1/);
        assert.match(requestedUrls[2], /_monitor_attempt=3/);
    });

    it('falls back to the overseas source without hiding total source failure', async () => {
        const requestedHosts = [];
        const options = {
            attempts: 2,
            fetchUrl: async (url) => {
                requestedHosts.push(new URL(url).hostname);
                return sourceResponse(url.includes('tsukuyomi-space.com') ? 200 : 504);
            },
            sleep: async () => {},
            log: () => {}
        };
        const loaded = await loadSourceCandidates([
            'https://yachiyo.hk/api/friend-links/source',
            'https://tsukuyomi-space.com/api/friend-links/source'
        ], options);

        assert.equal(loaded.sourceUrl, 'https://tsukuyomi-space.com/api/friend-links/source');
        assert.deepEqual(requestedHosts, ['yachiyo.hk', 'yachiyo.hk', 'tsukuyomi-space.com']);
        await assert.rejects(
            loadSourceCandidates(['https://yachiyo.hk/api/friend-links/source'], {
                ...options,
                fetchUrl: async () => sourceResponse(503)
            }),
            /所有友链数据源均不可用/
        );
    });

    it('accepts only real anchors to an author host', () => {
        assert.equal(htmlContainsBacklink(
            '<p>Visit https://yachiyo.hk someday</p>',
            'https://friend.example/links',
            ['yachiyo.hk']
        ), false);
        assert.equal(htmlContainsBacklink(
            '<a data-name="friend" href="https://www.yachiyo.hk/friend-links">月读空间</a>',
            'https://friend.example/links',
            ['yachiyo.hk']
        ), true);
        assert.equal(htmlContainsBacklink(
            '<a href="https://yachiyo.hk.attacker.example/">lookalike</a>',
            'https://friend.example/links',
            ['yachiyo.hk']
        ), false);
    });

    it('checks reachability and a dedicated backlink page without network access', async () => {
        const calls = [];
        const fetchUrl = async (url) => {
            calls.push(url);
            if (url === 'https://friend.example/') {
                return new Response('<h1>Friend</h1>', {
                    status: 200,
                    headers: { 'Content-Type': 'text/html' }
                });
            }
            return new Response('<a href="https://yachiyo.hk/">月读空间</a>', {
                status: 200,
                headers: { 'Content-Type': 'text/html' }
            });
        };
        let timestamp = Date.parse('2026-08-01T00:00:00Z');
        const result = await checkFriendLink({
            id: 7,
            url: 'https://friend.example/',
            backlink_url: 'https://friend.example/links',
            fail_count: 3
        }, {
            authorHosts: ['yachiyo.hk'],
            fetchUrl,
            now: () => (timestamp += 120)
        });

        assert.equal(result.status, 'online');
        assert.equal(result.httpStatus, 200);
        assert.equal(result.failCount, 0);
        assert.equal(result.hasBacklink, true);
        assert.deepEqual(calls, ['https://friend.example/', 'https://friend.example/links']);
    });

    it('tracks failures without treating protected sites as dead', () => {
        assert.equal(responseStatus(200, 1800), 'online');
        assert.equal(responseStatus(200, 1801), 'slow');
        assert.equal(responseStatus(403, 100), 'restricted');
        assert.equal(responseStatus(503, 100), 'offline');
        assert.equal(nextFailCount(4, 'restricted'), 4);
        assert.equal(nextFailCount(4, 'offline'), 5);
        assert.equal(nextFailCount(4, 'online'), 0);
    });

    it('keeps a reachable site online when its page is too large to inspect', async () => {
        const result = await checkFriendLink({
            id: 8,
            url: 'https://large.example/',
            fail_count: 2
        }, {
            fetchUrl: async () => new Response('ok', {
                status: 200,
                headers: {
                    'Content-Type': 'text/html',
                    'Content-Length': String(1024 * 1024)
                }
            })
        });

        assert.equal(result.status, 'online');
        assert.equal(result.failCount, 0);
        assert.equal(result.hasBacklink, false);
    });
});
