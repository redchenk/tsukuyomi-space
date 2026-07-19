const WIKI_VERIFIED_AT = '2026-07-18';

const WIKI_CHARACTERS = [
    {
        kind: 'character', slug: 'kaguya', title: '辉夜', original: 'かぐや',
        description: '从月球来到地球的神秘少女。她在彩叶的帮助下进入月读，成为负责演唱与直播的表演者。',
        image: '/assets/images/wiki/entries/characters/kaguya-reality.webp',
        keywords: ['辉夜', 'かぐや', '辉夜姬', '月球少女', '超时空辉夜姬角色']
    },
    {
        kind: 'character', slug: 'iroha', title: '酒寄彩叶', original: '酒寄彩葉',
        description: '17 岁高中生，以“彩P”的身份重拾创作，成为辉夜舞台背后的制作人与作曲者。',
        image: '/assets/images/wiki/entries/characters/iroha-reality.webp',
        keywords: ['酒寄彩叶', '酒寄彩葉', '彩P', '超时空辉夜姬角色', '制作人']
    },
    {
        kind: 'character', slug: 'yachiyo', title: '月见八千代', original: '月見ヤチヨ',
        description: '月读的管理者与顶级主播，被称作能唱、能跳、还能分身的 8000 岁神秘 AI。',
        image: '/assets/images/wiki/entries/characters/yachiyo-tsukuyomi.webp',
        keywords: ['月见八千代', '月見ヤチヨ', '八千代', '超时空辉夜姬角色', '月读管理者']
    },
    {
        kind: 'character', slug: 'akira', title: '帝アキラ', original: 'Mikado Akira',
        description: '职业游戏主播团队 Black onyX 的领队，擅长把竞技对局变成观众参与的华丽表演。',
        image: '/assets/images/wiki/entries/characters/akira-tsukuyomi.webp',
        keywords: ['帝アキラ', '帝明', '酒寄朝日', 'Black onyX', '超时空辉夜姬角色']
    },
    {
        kind: 'character', slug: 'rai', title: '驹泽雷', original: '駒沢雷',
        description: 'Black onyX 成员，驹泽乃依的哥哥，性格冷静并拥有出色的演唱与竞技能力。',
        image: '/assets/images/wiki/entries/characters/rai-tsukuyomi.webp',
        keywords: ['驹泽雷', '駒沢雷', 'Black onyX', '主播', '超时空辉夜姬角色']
    },
    {
        kind: 'character', slug: 'noi', title: '驹泽乃依', original: '駒沢乃依',
        description: 'Black onyX 成员，使用男性虚拟形象，偏爱可爱服装并擅长回应粉丝。',
        image: '/assets/images/wiki/entries/characters/noi-tsukuyomi.webp',
        keywords: ['驹泽乃依', '駒沢乃依', 'Black onyX', '主播', '超时空辉夜姬角色']
    },
    {
        kind: 'character', slug: 'roka', title: '绫䌷芦花', original: '綾紬芦花',
        description: '彩叶的朋友与美妆类创作者，能够察觉彩叶的逞强并持续关心她的生活。',
        image: '/assets/images/wiki/entries/characters/roka-reality.webp',
        keywords: ['绫䌷芦花', '綾紬芦花', '美妆创作者', '彩叶的朋友', '超时空辉夜姬角色']
    },
    {
        kind: 'character', slug: 'mami', title: '谏山真实', original: '諌山真実',
        description: '彩叶的朋友与美食类创作者，也是帝アキラ的粉丝，性格随和而可靠。',
        image: '/assets/images/wiki/entries/characters/mami-reality.webp',
        keywords: ['谏山真实', '諌山真実', '美食创作者', '彩叶的朋友', '超时空辉夜姬角色']
    },
    {
        kind: 'character', slug: 'fushi', title: 'FUSHI', original: '不死',
        description: '外形像海蛞蝓的月读向导，是八千代的搭档，并对辉夜和犬DOGE抱有戒心。',
        image: '/assets/images/wiki/entries/characters/fushi.webp',
        keywords: ['FUSHI', '不死', '月读向导', '八千代搭档', '超时空辉夜姬角色']
    },
    {
        kind: 'character', slug: 'doge', title: '犬DOGE', original: '犬DOGE',
        description: '与辉夜一同行动的月读向导，它与 FUSHI 的关系为故事留下了重要谜团。',
        image: '/assets/images/wiki/entries/characters/doge.webp',
        keywords: ['犬DOGE', '月读向导', '辉夜搭档', 'FUSHI', '超时空辉夜姬角色']
    },
    {
        kind: 'character', slug: 'otako', title: '忠犬宅公', original: '忠犬オタ公',
        description: '主持《NEWS TSUKUYOMI!!》的月读资讯主播，为观众介绍虚拟空间中的新鲜话题。',
        image: '/assets/images/wiki/entries/characters/otako.webp',
        keywords: ['忠犬宅公', '忠犬オタ公', 'NEWS TSUKUYOMI', '月读主播', '超时空辉夜姬角色']
    },
    {
        kind: 'character', slug: 'terukoto', title: '乙事照琴', original: '乙事照琴',
        description: '曾是职业玩家的月读主播，负责大型活动的现场实况、竞技分析与赛事解说。',
        image: '/assets/images/wiki/entries/characters/terukoto.png',
        keywords: ['乙事照琴', '赛事解说', '职业玩家', '月读主播', '超时空辉夜姬角色']
    }
];

const WIKI_TERMS = [
    {
        kind: 'term', slug: 'tsukuyomi', title: '月读／TSUKUYOMI',
        description: '现实身份、虚拟人格与创作活动交汇的网络空间，用户可以在其中直播、游戏、社交与创作。',
        image: '/assets/images/wiki/entries/terms/tsukuyomi.webp',
        keywords: ['月读', 'TSUKUYOMI', '月夜见', 'ツクヨミ', '超时空辉夜姬世界观']
    },
    {
        kind: 'term', slug: 'yachiyo-cup', title: '八千代杯',
        description: '以主播成长、涨粉和获得与月见八千代同台机会为目标的月读平台竞赛。',
        image: '/assets/images/wiki/entries/terms/yachiyo-cup.webp',
        keywords: ['八千代杯', 'ヤチヨカップ', '月读竞赛', '辉夜彩P', '超时空辉夜姬世界观']
    },
    {
        kind: 'term', slug: 'kassen', title: 'KASSEN',
        description: '月读中的团队竞技游戏，也是直播时代“难题挑战”的重要舞台。',
        image: '/assets/images/wiki/entries/terms/kassen.webp',
        keywords: ['KASSEN', '合战', '月读游戏', 'Black onyX', '超时空辉夜姬世界观']
    },
    {
        kind: 'term', slug: 'black-onyx', title: 'Black onyX',
        description: '由帝アキラ、驹泽雷与驹泽乃依组成，兼具职业竞技实力与主播表现力的三人团队。',
        image: '/assets/images/wiki/entries/terms/black-onyx.webp',
        keywords: ['Black onyX', '黑玛瑙', '帝アキラ', '驹泽雷', '驹泽乃依']
    },
    {
        kind: 'term', slug: 'remember', title: 'Remember',
        description: '月见八千代演唱、关于记忆、等待与漫长时间的核心歌曲。',
        image: '/assets/images/wiki/entries/terms/remember.webp',
        keywords: ['Remember', '月见八千代', 'yuigot', '超时空辉夜姬音乐', '插入歌']
    },
    {
        kind: 'term', slug: 'reply', title: 'Reply',
        description: '由辉夜演唱，与《Remember》形成“记住／回应”镜像关系的重要原创插入歌。',
        image: '/assets/images/wiki/entries/terms/reply.webp',
        keywords: ['Reply', '辉夜', 'kz livetune', '超时空辉夜姬音乐', '插入歌']
    },
    {
        kind: 'term', slug: 'taketori', title: '《竹取物语》',
        description: '作品的古典母题，被重新翻译为电线杆、直播竞赛、月之迎接与虚拟空间。',
        image: '/assets/images/wiki/entries/terms/taketori.webp',
        keywords: ['竹取物语', '辉夜姬传说', '月之使者', '超时空辉夜姬考察', '古典母题']
    }
];

const WIKI_ENTRIES = [...WIKI_CHARACTERS, ...WIKI_TERMS];

function wikiEntryPath(entry) {
    return `/wiki/${entry.kind === 'character' ? 'characters' : 'terms'}/${entry.slug}`;
}

function findWikiEntry(kind, slug) {
    return WIKI_ENTRIES.find(entry => entry.kind === kind && entry.slug === String(slug || '')) || null;
}

module.exports = {
    WIKI_VERIFIED_AT,
    WIKI_CHARACTERS,
    WIKI_TERMS,
    WIKI_ENTRIES,
    wikiEntryPath,
    findWikiEntry
};
