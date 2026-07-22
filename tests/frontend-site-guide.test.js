const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('global AI guide and visible user levels', () => {
    it('opens an accessible guide and reuses the Room LLM configuration with a fixed fallback', () => {
        const app = source('src/frontend/App.vue');
        const pet = source('src/frontend/components/SitePet.vue');
        const guide = source('src/frontend/services/siteGuideLlm.js');

        assert.match(app, /<SitePet[^>]+@go="go"/);
        assert.match(pet, /role="dialog"/);
        assert.match(pet, /aria-modal="true"/);
        assert.match(pet, /v-if="!llmStatus\.configured"/);
        assert.match(pet, /navigate\('\/room\/settings'\)/);
        assert.doesNotMatch(pet, /v-html/);
        assert.match(guide, /readJson\('roomLLMSettings'/);
        assert.match(guide, /fetchWithLocalOllamaGuidance/);
        assert.match(guide, /settings\.useProxy/);
        assert.match(guide, /Never reveal or ask for API keys/);
        assert.match(guide, /MAX_HISTORY_ITEMS = 8/);
    });

    it('shows tiered, reduced-motion-safe level badges across identity surfaces', () => {
        const badge = source('src/frontend/components/UserLevelBadge.vue');
        const pages = [
            'src/frontend/pages/UserCenterPage.vue',
            'src/frontend/pages/UserProfilePage.vue',
            'src/frontend/pages/StagePage.vue',
            'src/frontend/pages/ArticlePage.vue',
            'src/frontend/pages/PlazaPage.vue',
            'src/frontend/pages/GalleryPage.vue',
            'src/frontend/pages/ArenaPage.vue'
        ];

        assert.match(badge, /user-level-tier-4/);
        assert.match(badge, /@media \(prefers-reduced-motion: reduce\)/);
        assert.match(badge, /data-performance="reduced"/);
        assert.match(badge, /Lv\.\{\{ value \}\}/);
        pages.forEach((page) => assert.match(source(page), /UserLevelBadge/, page));
    });
});
