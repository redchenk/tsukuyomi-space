const channels = [
    { id: 'lobby', icon: 'moonStar', zh: '月读大厅', en: 'Moon Lobby', ja: '月読ロビー' },
    { id: 'ai', icon: 'sparkles', zh: 'AI 讨论', en: 'AI Lab', ja: 'AI ラボ' },
    { id: 'games', icon: 'gamepad', zh: '游戏组队', en: 'Game Lounge', ja: 'ゲームラウンジ' },
    { id: 'studio', icon: 'palette', zh: '创作交流', en: 'Art Studio', ja: '創作室' },
    { id: 'tech', icon: 'code', zh: '技术交流', en: 'Tech Talk', ja: '技術交流' }
];
const mentionsYachiyo = text => /[@＠](?:月见八千代|月見八千代|八千代|ヤチヨ|yachiyo\b)/iu.test(text);
module.exports = { channels, mentionsYachiyo, dailyXp: 5 };
