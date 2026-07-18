import { findSourceMedia } from './sourceMediaAssets';

export const verifiedAt = '2026-07-18';

export const tocEntries = [
  { id: 'overview', label: '本作介绍', index: '01' },
  { id: 'story', label: '故事简介', index: '02' },
  { id: 'characters', label: '登场人物', index: '03' },
  { id: 'world', label: '世界观与术语', index: '04' },
  { id: 'music', label: '相关音乐', index: '05' },
  { id: 'staff-cast', label: '制作与配音', index: '06' },
  { id: 'release', label: '发行与衍生', index: '07' },
  { id: 'references', label: '资料与版权', index: '08' }
];

export const infoRows = [
  ['日文原名', '超かぐや姫！'],
  ['英文名', 'Cosmic Princess Kaguya!'],
  ['常见译名', '超时空辉耀姬！／超时空辉夜姬！'],
  ['作品形态', '日本原创长篇动画电影'],
  ['类型', '音乐／科幻／奇幻／青春'],
  ['主演', '夏吉优子、永濑安奈'],
  ['导演', '山下清悟'],
  ['编剧', '夏生さえり、山下清悟'],
  ['角色设计', 'へちま（月读）、永江彰浩（现实）'],
  ['配乐', 'Conisch（コーニッシュ）'],
  ['动画制作', 'STUDIO COLORIDO、STUDIO CHROMATO'],
  ['片长', '142 分钟'],
  ['Netflix 上线', '2026-01-22'],
  ['日本院线', '2026-02-20 限定上映／2026-03-13 全国上映'],
  ['动画 BD', '2026-09-09']
];

export const timeline = [
  { date: '2025-11-05', label: '首次公开', detail: '预告 PV 与预告视觉图正式发布。' },
  { date: '2026-01-22', label: '全球上线', detail: 'Netflix 全球独家上线。' },
  { date: '2026-02-20', label: '日本限定上映', detail: '原计划上映一周，随后延长放映时间。' },
  { date: '2026-03-13', label: '日本全国上映', detail: '上映规模扩展至日本全国院线。' },
  { date: '2026-09-09', label: '动画 BD', detail: '动画电影 Blu-ray Disc 预定发售。' }
];

export const characterGroups = [
  { id: 'all', label: '全部' },
  { id: 'main', label: '主角' },
  { id: 'tsukuyomi', label: '月读' },
  { id: 'reality', label: '现实' }
];

export const characters = [
  {
    id: 'entry-kaguya',
    name: '辉夜',
    original: 'かぐや',
    cv: '夏吉优子',
    image: '/assets/images/wiki/entries/characters/kaguya-tsukuyomi.webp',
    imageAlt: '辉夜月夜见形象',
    groups: ['main', 'tsukuyomi'],
    tags: ['月球少女', '歌手', '主播'],
    description: '从月球来到地球的神秘少女。她外向、自由，对地球上一切有趣之物充满好奇；在彩叶的帮助下走进月读，成为负责演唱与直播的表演者。',
    relatedTerms: ['tsukuyomi', 'yachiyo-cup', 'reply']
  },
  {
    id: 'entry-iroha',
    name: '酒寄彩叶',
    original: '酒寄彩葉',
    cv: '永濑安奈',
    image: '/assets/images/wiki/entries/characters/iroha-reality.webp',
    imageAlt: '酒寄彩叶现实形象',
    groups: ['main', 'reality', 'tsukuyomi'],
    tags: ['彩P', '制作人', '高中生'],
    description: '17 岁高中生，独自承担学业与生活压力。她曾经写歌，却把音乐搁置；与辉夜相遇后以“彩P”的身份重拾创作，成为舞台背后的制作人。',
    relatedTerms: ['tsukuyomi', 'kassen', 'reply']
  },
  {
    id: 'entry-yachiyo',
    name: '月见八千代',
    original: '月見ヤチヨ',
    cv: '早见沙织',
    image: '/assets/images/wiki/entries/characters/yachiyo-tsukuyomi.webp',
    imageAlt: '月见八千代角色形象',
    groups: ['main', 'tsukuyomi'],
    tags: ['空间管理者', '顶级主播', '神秘 AI'],
    description: '月读的管理者与顶级主播，被称作“能唱、能跳、还能分身的 8000 岁神秘 AI”。她的歌曾深深影响彩叶，也守望着空间里的创作者。',
    relatedTerms: ['tsukuyomi', 'yachiyo-cup', 'remember']
  },
  {
    id: 'entry-akira',
    name: '帝アキラ',
    original: 'Mikado Akira',
    cv: '入野自由',
    image: '/assets/images/wiki/entries/characters/akira-tsukuyomi.webp',
    imageAlt: '帝アキラ月夜见形象',
    groups: ['tsukuyomi'],
    tags: ['Black onyX', '职业玩家'],
    description: '职业游戏主播团队 Black onyX 的领队。公开形象张扬自信，擅长把竞技对局变成观众参与的华丽表演。',
    relatedTerms: ['black-onyx', 'kassen']
  },
  {
    id: 'entry-rai',
    name: '驹泽雷',
    original: '駒沢雷',
    cv: '内田雄马',
    image: '/assets/images/wiki/entries/characters/rai-tsukuyomi.webp',
    imageAlt: '驹泽雷月夜见形象',
    groups: ['tsukuyomi'],
    tags: ['Black onyX', '主播'],
    description: 'Black onyX 成员，驹泽乃依的哥哥。话不多、性格冷静，同时拥有出色的演唱能力。',
    relatedTerms: ['black-onyx']
  },
  {
    id: 'entry-noi',
    name: '驹泽乃依',
    original: '駒沢乃依',
    cv: '松冈祯丞',
    image: '/assets/images/wiki/entries/characters/noi-tsukuyomi.webp',
    imageAlt: '驹泽乃依月夜见形象',
    groups: ['tsukuyomi'],
    tags: ['Black onyX', '主播'],
    description: 'Black onyX 成员，雷的弟弟。使用男性虚拟形象，偏爱可爱服装，认真营业时很会回应粉丝。',
    relatedTerms: ['black-onyx']
  },
  {
    id: 'entry-roka',
    name: '绫䌷芦花',
    original: '綾紬芦花',
    cv: '青山吉能',
    image: '/assets/images/wiki/entries/characters/roka-reality.webp',
    imageAlt: '绫䌷芦花现实形象',
    groups: ['reality'],
    tags: ['彩叶的朋友', '美妆创作者'],
    description: '彩叶的朋友与美妆类创作者。她能察觉彩叶的逞强，并持续关心朋友的生活状况。',
    relatedTerms: []
  },
  {
    id: 'entry-mami',
    name: '谏山真实',
    original: '諌山真実',
    cv: '小原好美',
    image: '/assets/images/wiki/entries/characters/mami-reality.webp',
    imageAlt: '谏山真实现实形象',
    groups: ['reality'],
    tags: ['彩叶的朋友', '美食创作者'],
    description: '彩叶的朋友与美食类创作者，也是帝アキラ的粉丝。性格随和，是可靠的同行者。',
    relatedTerms: []
  },
  {
    id: 'entry-fushi',
    name: 'FUSHI',
    original: '不死',
    cv: '钉宫理惠',
    image: findSourceMedia('超时空辉夜姬FUSHI.webp'),
    imageAlt: 'FUSHI 角色形象',
    groups: ['tsukuyomi'],
    tags: ['月读向导', '八千代搭档'],
    description: '外形像毛茸茸海蛞蝓的月读向导，是八千代的搭档；它对辉夜和犬DOGE抱有难以解释的戒心。',
    relatedTerms: ['tsukuyomi']
  },
  {
    id: 'entry-doge',
    name: '犬DOGE',
    original: '犬DOGE',
    cv: '庄司更纱',
    image: findSourceMedia('超时空辉夜姬犬DOGE.webp'),
    imageAlt: '犬DOGE 角色形象',
    groups: ['tsukuyomi'],
    tags: ['月读向导', '辉夜搭档'],
    description: '与辉夜一同行动的月读向导。它和 FUSHI 的关系为故事增添了不少谜团，但具体机制不在本页作无来源推断。',
    relatedTerms: ['tsukuyomi']
  },
  {
    id: 'entry-otako',
    name: '忠犬宅公',
    original: '忠犬オタ公',
    cv: '菲鲁兹·蓝',
    image: findSourceMedia('超时空辉夜姬忠犬宅公.webp'),
    imageAlt: '忠犬宅公角色形象',
    groups: ['tsukuyomi'],
    tags: ['资讯主播'],
    description: '主持《NEWS TSUKUYOMI!!》的月读主播，为观众介绍虚拟空间中的新鲜话题。',
    relatedTerms: ['tsukuyomi']
  },
  {
    id: 'entry-terukoto',
    name: '乙事照琴',
    original: '乙事照琴',
    cv: '花江夏树',
    image: findSourceMedia('超时空辉夜姬乙事照琴.webp'),
    imageAlt: '乙事照琴角色形象',
    groups: ['tsukuyomi'],
    tags: ['赛事解说', '前职业玩家'],
    description: '曾是职业玩家的月读主播，临场谈话能力优秀，负责大型活动的实况与解说。',
    relatedTerms: ['kassen', 'yachiyo-cup']
  }
];

export const terms = [
  {
    id: 'tsukuyomi',
    target: 'term-tsukuyomi',
    label: '月读／TSUKUYOMI',
    aliases: ['月夜见', 'ツクヨミ', '虚拟空间'],
    summary: '稍近未来的网络虚拟空间。用户可以制作分身，在其中创作、直播、游戏和社交；它既是舞台，也是现实身份与虚拟人格的交汇处。'
  },
  {
    id: 'yachiyo-cup',
    target: 'term-yachiyo-cup',
    label: '八千代杯',
    aliases: ['ヤチヨカップ', '竞赛'],
    summary: '以获得和月见八千代同台机会为目标的竞赛。辉夜与彩叶借此走到大众视野中央。'
  },
  {
    id: 'kassen',
    target: 'term-kassen',
    label: 'KASSEN',
    aliases: ['对战游戏', '合战'],
    summary: '月读中的对战游戏。本页考察认为，公开合作赛可被视作对《竹取物语》“难题”的直播时代改写；这并非官方设定原文。'
  },
  {
    id: 'black-onyx',
    target: 'term-black-onyx',
    label: 'Black onyX',
    aliases: ['职业玩家', '帝アキラ'],
    summary: '由帝アキラ、驹泽雷与驹泽乃依组成的热门职业玩家／主播团队，是辉夜一方的重要对手。'
  },
  {
    id: 'remember',
    target: 'song-remember',
    label: 'Remember',
    aliases: ['月见八千代', 'yuigot'],
    summary: '由月见八千代演唱、yuigot 作编曲的歌曲，与等待、记忆和跨越时间的呼唤紧密相连。'
  },
  {
    id: 'reply',
    target: 'song-reply',
    label: 'Reply',
    aliases: ['辉夜', 'kz', 'livetune'],
    summary: '由真崎エリカ作词、kz (livetune) 作编曲的歌曲，在叙事中与《Remember》形成“记住／回应”的镜像。'
  },
  {
    id: 'taketori',
    target: 'term-taketori',
    label: '《竹取物语》',
    aliases: ['辉夜姬传说', '竹中婴儿', '月之使者'],
    summary: '作品的古典母题。动画把竹中婴儿、快速成长、求婚难题与月之迎接，重新翻译为电线杆、直播竞赛和虚拟空间。'
  }
];

export const quickEntries = [
  ...characters.map((character) => ({
    id: character.id,
    label: character.name,
    meta: `角色 · CV ${character.cv}`,
    target: character.id,
    route: `/wiki/characters/${character.id.replace(/^entry-/, '')}`,
    keywords: [character.original, character.cv, ...character.tags]
  })),
  ...terms.map((term) => ({
    id: `quick-${term.id}`,
    label: term.label,
    meta: '世界观／音乐词条',
    target: term.target,
    route: `/wiki/terms/${term.id}`,
    keywords: term.aliases
  }))
];

export const spoilerSteps = [
  ['相遇与共同创作', '彩叶从发光电线杆中遇见迅速长大的辉夜。两人在现实共同生活，也在月读组成由彩叶写歌、辉夜登台的创作搭档。'],
  ['八千代杯与对决', '为了与八千代同台，她们参加八千代杯，并在 KASSEN 活动中与 Black onyX 正面对决。胜负之外，直播让她们获得了真正的关注。'],
  ['回月与《Reply》', '辉夜终究被月之使者带走。彩叶没有再次放弃音乐，而是完成《Reply》，让未能当面说完的回应穿过距离。'],
  ['8000 年的时间闭环', '辉夜返航时落到约 8000 年前。漫长岁月后，她以月见八千代的虚拟形象建立月读、等待彩叶；八千代正是跨越时间而来的辉夜。'],
  ['十年后的重逢', '彩叶选择学习相关技术，并在约十年后为辉夜／八千代打造能够感受现实的身体。实体辉夜、虚拟八千代与彩叶最终同台，完成跨越时间的快乐结局。']
];

export const musicGroups = [
  { id: 'all', label: '全部' },
  { id: 'original', label: '原创／主题' },
  { id: 'cover', label: '翻唱' },
  { id: 'remix', label: '重混音' }
];

export const music = [
  { id: 'song-ex-otogibanashi', title: 'Ex-Otogibanashi', type: '主题曲', creator: 'ryo (supercell)', performer: '辉夜、月见八千代', category: 'original', note: '作品主题曲，标题呼应“超越童话”。' },
  { id: 'song-ray', title: 'ray 超かぐや姫！Version', type: '片尾曲', creator: '藤原基央／TAKU INOUE 编曲', performer: '辉夜、月见八千代', category: 'cover', note: '改编自 BUMP OF CHICKEN《ray》的电影版本。' },
  { id: 'song-melt', title: 'メルト CPK! Remix', type: '特别曲', creator: 'ryo (supercell)', performer: '辉夜', category: 'remix', note: '《Melt》的 CPK! 重混音。' },
  { id: 'song-remember', title: 'Remember', type: '插入歌', creator: '真崎エリカ／yuigot', performer: '月见八千代', category: 'original', note: '关于等待、记忆与时间回声的核心歌曲。' },
  { id: 'song-starry-sea', title: '星降る海', type: '插入歌', creator: 'Aqu3ra', performer: '月见八千代', category: 'original', note: '由 Aqu3ra 作词、作曲及编曲。' },
  { id: 'song-love-myself', title: '私は、わたしの事が好き。', type: '插入歌', creator: 'shito、Gom／HoneyWorks', performer: '辉夜', category: 'original', note: '突出辉夜的自我肯定与舞台个性。' },
  { id: 'song-world-is-mine', title: 'ワールドイズマイン CPK! Remix', type: '插入歌', creator: 'ryo (supercell)', performer: '辉夜、月见八千代', category: 'remix', note: 'VOCALOID 经典曲目的 CPK! 重混音。' },
  { id: 'song-happy-synthesizer', title: 'ハッピーシンセサイザ', type: '插入歌', creator: 'EasyPop／yuigot 编曲', performer: '辉夜', category: 'cover', note: '电影中的翻唱版本。' },
  { id: 'song-symphony', title: '瞬間、シンフォニー。', type: '插入歌', creator: '40mP', performer: '辉夜', category: 'original', note: '由 40mP 作词、作曲及编曲。' },
  { id: 'song-reply', title: 'Reply', type: '插入歌', creator: '真崎エリカ／kz (livetune)', performer: '辉夜', category: 'original', note: '与《Remember》构成叙事上的“回应”。' },
  { id: 'song-onyxxx', title: 'OnyXXX', type: '插入歌', creator: 'Conisch', performer: 'Black onyX', category: 'original', note: '帝明、驹泽雷与驹泽乃依演唱的团队形象曲。' },
  { id: 'song-lonely-universe', title: 'ロンリーユニバース', type: '翻唱曲', creator: 'Aqu3ra', performer: '月见八千代', category: 'cover', note: '月见八千代的官方唱见企划曲。' },
  { id: 'song-taketori-overnight', title: '竹取オーバーナイトセンセーション', type: '翻唱曲', creator: 'Gom／HoneyWorks、MARUMOCHI 编曲', performer: '辉夜', category: 'cover', note: '与《竹取物语》母题呼应的官方唱见企划曲。' },
  { id: 'song-torinoko-city', title: 'トリノコシティ', type: '翻唱曲', creator: '40mP', performer: '月见八千代', category: 'cover', note: '月见八千代的官方唱见企划曲。' },
  { id: 'song-dreaming-island', title: '夢をみる島', type: '翻唱曲', creator: 'yuigot', performer: '辉夜', category: 'cover', note: '辉夜的官方唱见企划曲。' },
  { id: 'song-tell-your-world', title: 'Tell Your World', type: '翻唱曲', creator: 'kz (livetune)', performer: '月见八千代', category: 'cover', note: '月见八千代的官方唱见企划曲。' }
];

export const staff = [
  ['导演', '山下清悟'],
  ['编剧', '夏生さえり、山下清悟'],
  ['月读角色设计', 'へちま'],
  ['现实角色设计', '永江彰浩'],
  ['Live 演出', '中山直哉'],
  ['美术监督', '宍户太一'],
  ['色彩设计', '广濑泉'],
  ['月读概念设计', '東みずたまり、フジモトゴールド'],
  ['现实概念设计', '刈谷仁美'],
  ['CG 监督', '町田政弥'],
  ['CG 背景', '草间彻也（QUUNPLANT）'],
  ['剪辑', '木南凉太'],
  ['摄影监督', '千叶大辅'],
  ['音响监督', '三好庆一郎'],
  ['配乐', 'Conisch'],
  ['企划、制作', '山本幸治'],
  ['出品', 'Colorido・TWIN ENGINE PARTNERS'],
  ['动画制作', 'STUDIO COLORIDO、STUDIO CHROMATO']
];

export const cast = [
  ['辉夜', '夏吉优子'],
  ['酒寄彩叶', '永濑安奈'],
  ['月见八千代', '早见沙织'],
  ['帝明／酒寄朝日', '入野自由'],
  ['驹泽雷', '内田雄马'],
  ['驹泽乃依', '松冈祯丞'],
  ['绫䌷芦花', '青山吉能'],
  ['谏山真实', '小原好美'],
  ['FUSHI', '钉宫理惠'],
  ['忠犬宅公', '菲鲁兹·蓝'],
  ['乙事照琴', '花江夏树'],
  ['犬DOGE', '庄司更纱'],
  ['酒寄红叶', '坂本真绫'],
  ['酒寄朝久', '铃村健一'],
  ['班主任', '小林亲弘'],
  ['音乐老师', '宫泽清子']
];

export const boxOfficeMilestones = [
  { day: '上映 26 天', gross: '突破 10 亿日元' },
  { day: '上映 44 天', gross: '达到 16.8 亿日元' },
  { day: '上映 59 天', gross: '达到 20 亿日元' },
  { day: '上映 86 天', gross: '达到 25 亿日元' }
];

export const derivativeWorks = [
  {
    type: '漫画版',
    title: '《超时空辉夜姬！》漫画版',
    image: findSourceMedia('超时空辉夜姬漫画封面1.webp'),
    imageAlt: '《超时空辉夜姬！》漫画版第 1 卷封面',
    credits: '作画：米田タロウ',
    publisher: 'KADOKAWA／Kadokawa Comics A',
    release: '第 1 卷：2026-02-10',
    isbn: '978-4-04-811757-9',
    detail: '于 Comic Comp 连载，将电影故事改编为漫画叙事。'
  },
  {
    type: '小说版',
    title: '《超时空辉夜姬！》小说版',
    image: findSourceMedia('超时空辉夜姬小说封面.webp'),
    imageAlt: '《超时空辉夜姬！》小说版封面',
    credits: '著：桐山なると／插画：うらたあさお',
    publisher: 'KADOKAWA／Fami通文库',
    release: '2026-01-30',
    isbn: '978-4-04-738734-8',
    detail: '以文字形式重新讲述电影中的相遇、创作与离别。'
  },
  {
    type: '公式指南书',
    title: '《超かぐや姫！ 公式ガイドブック ハッピーエンドのその先へ！》',
    image: findSourceMedia('超时空辉夜姬公式指南书封面.webp'),
    imageAlt: '《超时空辉夜姬！》公式指南书封面',
    credits: '官方设定与制作资料集',
    publisher: 'KADOKAWA',
    release: '2026-01-30',
    isbn: '978-4-04-117055-7',
    detail: '收录角色设定、制作资料与 Happy End 之后的补充内容。'
  }
];

export const references = [
  { id: 'ref-official', label: '《超かぐや姫！》作品官方网站', url: 'https://www.cho-kaguyahime.com/', scope: '故事、角色、制作人员与视觉资料' },
  { id: 'ref-music', label: '作品官方网站 Music', url: 'https://www.cho-kaguyahime.com/music/', scope: '歌曲、创作者与官方 MV 入口' },
  { id: 'ref-tudum', label: 'Netflix Tudum 专题', url: 'https://www.netflix.com/tudum/articles/cosmic-princess-kaguya-release-date-news', scope: '上线日期、核心设定与主角配音' },
  { id: 'ref-netflix', label: 'Netflix 中文作品页', url: 'https://www.netflix.com/sg-zh/title/81756595', scope: '平台简介与地区中文片名' },
  { id: 'ref-kadokawa', label: 'KADOKAWA 官方商品页', url: 'https://www.kadokawa.co.jp/product/322510000049/', scope: '官方导览书与出版信息' },
  { id: 'ref-guideline', label: '作品官方网站：二次创作指南', url: 'https://www.cho-kaguyahime.com/special/detail.html?id=1024', scope: '官方素材使用边界；公开素材不等于自由许可' },
  { id: 'ref-moegirl', label: '萌娘百科：《超时空辉夜姬！》源条目', url: 'https://zh.moegirl.org.cn/%E8%B6%85%E6%97%B6%E7%A9%BA%E8%BE%89%E5%A4%9C%E5%A7%AC%EF%BC%81', scope: '上映、主创、配音、曲目、票房与衍生作品的参考目录' },
  { id: 'ref-wikipedia', label: '中文维基百科条目', url: 'https://zh.wikipedia.org/wiki/%E8%B6%85%E6%99%82%E7%A9%BA%E8%BC%9D%E8%80%80%E5%A7%AC%EF%BC%81', scope: '片长、发行与曲目交叉核对；非唯一来源' },
  { id: 'ref-ciatr', label: 'ciatr 剧情解说', url: 'https://ciatr.jp/topics/335940', scope: '结局时间线的二手交叉核对；推测不作为官方设定' }
];

export const navigationGroups = [
  { title: '角色', links: characters.slice(0, 6).map((character) => ({ label: character.name, target: character.id, route: `/wiki/characters/${character.id.replace(/^entry-/, '')}` })) },
  { title: '月读档案', links: terms.slice(0, 4).map((term) => ({ label: term.label, target: term.target, route: `/wiki/terms/${term.id}` })) },
  { title: '音乐', links: music.slice(0, 6).map((song) => ({ label: song.title, target: song.id })) }
];

export function findTerm(id) {
  return terms.find((term) => term.id === id) || null;
}
