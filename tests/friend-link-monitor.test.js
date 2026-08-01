const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
    checkFriendLink,
    htmlContainsBacklink,
    nextFailCount,
    responseStatus
} = require('../backend/services/friend-link-monitor');

describe('friend link monitoring', () => {
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
