import { characters, music, terms, verifiedAt } from './cosmicKaguyaWiki';

const OFFICIAL_SITE = 'https://www.cho-kaguyahime.com/';
const OFFICIAL_CHARACTER = 'https://www.cho-kaguyahime.com/character/';
const OFFICIAL_MUSIC = 'https://www.cho-kaguyahime.com/music/';
const MOEGIRL_WORK = 'https://zh.moegirl.org.cn/%E8%B6%85%E6%97%B6%E7%A9%BA%E8%BE%89%E5%A4%9C%E5%A7%AC%EF%BC%81';
const MOEGIRL_CHARACTER_SECTION = `${MOEGIRL_WORK}#%E4%B8%BB%E8%A6%81%E8%A7%92%E8%89%B2`;
const moegirlCharacterEntries = {
  kaguya: { url: 'https://zh.moegirl.org.cn/%E8%BE%89%E5%A4%9C(%E8%B6%85%E6%97%B6%E7%A9%BA%E8%BE%89%E5%A4%9C%E5%A7%AC%EF%BC%81)', standalone: true },
  iroha: { url: 'https://zh.moegirl.org.cn/%E9%85%92%E5%AF%84%E5%BD%A9%E5%8F%B6', standalone: true },
  yachiyo: { url: 'https://zh.moegirl.org.cn/%E6%9C%88%E8%A7%81%E5%85%AB%E5%8D%83%E4%BB%A3', standalone: true },
  roka: { url: 'https://zh.moegirl.org.cn/%E7%BB%AB%E4%8C%B7%E8%8A%A6%E8%8A%B1', standalone: true },
  mami: { url: 'https://zh.moegirl.org.cn/%E8%B0%8F%E5%B1%B1%E7%9C%9F%E5%AE%9E', standalone: true },
  akira: { url: 'https://zh.moegirl.org.cn/%E5%B8%9D%E6%98%8E', standalone: true },
  noi: { url: 'https://zh.moegirl.org.cn/%E9%A9%B9%E6%B3%BD%E4%B9%83%E4%BE%9D', standalone: true },
  rai: { url: 'https://zh.moegirl.org.cn/%E9%A9%B9%E6%B3%BD%E9%9B%B7', standalone: true },
  fushi: { url: MOEGIRL_CHARACTER_SECTION, standalone: false },
  doge: { url: MOEGIRL_CHARACTER_SECTION, standalone: false },
  otako: { url: MOEGIRL_CHARACTER_SECTION, standalone: false },
  terukoto: { url: MOEGIRL_CHARACTER_SECTION, standalone: false }
};

const GUIDE_TITLE = '《超かぐや姫！ 公式ガイドブック ハッピーエンドのその先へ！》';
const guideAsset = (kind, slug, extension, width, height, page, mode = 'subject', position = 'center center') => ({
  image: `/assets/images/wiki/entries/${kind}/${slug}.${extension}`,
  imageLayout: {
    ratio: `${width} / ${height}`,
    fit: mode === 'subject' || mode === 'collage' ? 'contain' : 'cover',
    position,
    mode
  },
  imageSource: { title: GUIDE_TITLE, page }
});

const characterGuideAssets = {
  kaguya: guideAsset('characters', 'kaguya', 'png', 910, 1560, 14, 'subject', 'center bottom'),
  iroha: guideAsset('characters', 'iroha', 'png', 930, 1560, 16, 'subject', 'center bottom'),
  yachiyo: guideAsset('characters', 'yachiyo', 'png', 1190, 1635, 20, 'subject', 'center bottom'),
  mami: guideAsset('characters', 'mami', 'png', 422, 770, 24, 'subject', 'center bottom'),
  roka: guideAsset('characters', 'roka', 'png', 400, 750, 25, 'subject', 'center bottom'),
  akira: guideAsset('characters', 'akira', 'webp', 1225, 760, 26, 'card'),
  rai: guideAsset('characters', 'rai', 'webp', 1190, 585, 27, 'card'),
  noi: guideAsset('characters', 'noi', 'webp', 1200, 675, 27, 'card'),
  terukoto: guideAsset('characters', 'terukoto', 'png', 369, 733, 28, 'subject', 'center bottom'),
  otako: guideAsset('characters', 'otako', 'webp', 865, 695, 28, 'card'),
  doge: guideAsset('characters', 'doge', 'webp', 495, 425, 30, 'card'),
  fushi: guideAsset('characters', 'fushi', 'webp', 495, 435, 30, 'card')
};

const characterImageVariants = {
  kaguya: [
    {
      id: 'reality',
      label: '现实',
      image: '/assets/images/wiki/entries/characters/kaguya-reality.webp',
      imageAlt: '辉夜现实形象透明立绘',
      imageLayout: { ratio: '1200 / 1620', fit: 'contain', position: 'center bottom', mode: 'subject' },
      imageSource: { title: '用户提供的萌娘百科清晰角色图（现实形象）' }
    },
    {
      id: 'tsukuyomi',
      label: '月夜见',
      image: '/assets/images/wiki/entries/characters/kaguya-tsukuyomi.webp',
      imageAlt: '辉夜月夜见形象透明立绘',
      imageLayout: { ratio: '1200 / 1620', fit: 'contain', position: 'center bottom', mode: 'subject' },
      imageSource: { title: '用户提供的萌娘百科清晰角色图（月夜见形象）' }
    }
  ],
  iroha: [
    { id: 'reality', label: '现实', image: '/assets/images/wiki/entries/characters/iroha-reality.webp', imageAlt: '酒寄彩叶现实形象清晰设定图', imageLayout: { ratio: '3 / 4', fit: 'contain', position: 'center bottom', mode: 'subject' }, imageSource: { title: '用户提供的清晰角色设定图（现实形象）' } },
    { id: 'tsukuyomi', label: '月夜见', image: '/assets/images/wiki/entries/characters/iroha-tsukuyomi.webp', imageAlt: '酒寄彩叶月夜见形象清晰设定图', imageLayout: { ratio: '3 / 4', fit: 'contain', position: 'center bottom', mode: 'subject' }, imageSource: { title: '用户提供的清晰角色设定图（月夜见形象）' } }
  ],
  yachiyo: [
    { id: 'tsukuyomi', label: '月夜见', image: '/assets/images/wiki/entries/characters/yachiyo-tsukuyomi.webp', imageAlt: '月见八千代清晰角色设定图', imageLayout: { ratio: '3 / 4', fit: 'contain', position: 'center bottom', mode: 'subject' }, imageSource: { title: '用户提供的清晰角色设定图' } }
  ],
  akira: [
    { id: 'tsukuyomi', label: '月夜见', image: '/assets/images/wiki/entries/characters/akira-tsukuyomi.webp', imageAlt: '酒寄朝日月夜见形象清晰设定图', imageLayout: { ratio: '3 / 4', fit: 'contain', position: 'center bottom', mode: 'subject' }, imageSource: { title: '用户提供的清晰角色设定图' } }
  ],
  rai: [
    { id: 'tsukuyomi', label: '月夜见', image: '/assets/images/wiki/entries/characters/rai-tsukuyomi.webp', imageAlt: '驹泽雷月夜见形象清晰设定图', imageLayout: { ratio: '3 / 4', fit: 'contain', position: 'center bottom', mode: 'subject' }, imageSource: { title: '用户提供的清晰角色设定图' } }
  ],
  noi: [
    { id: 'tsukuyomi', label: '月夜见', image: '/assets/images/wiki/entries/characters/noi-tsukuyomi.webp', imageAlt: '驹泽乃依月夜见形象清晰设定图', imageLayout: { ratio: '3 / 4', fit: 'contain', position: 'center bottom', mode: 'subject' }, imageSource: { title: '用户提供的清晰角色设定图' } }
  ],
  roka: [
    { id: 'reality', label: '现实', image: '/assets/images/wiki/entries/characters/roka-reality.webp', imageAlt: '绫䌷芦花现实形象清晰设定图', imageLayout: { ratio: '3 / 4', fit: 'contain', position: 'center bottom', mode: 'subject' }, imageSource: { title: '用户提供的清晰角色设定图（现实形象）' } },
    { id: 'tsukuyomi', label: '月夜见', image: '/assets/images/wiki/entries/characters/roka-tsukuyomi.webp', imageAlt: '绫䌷芦花月夜见形象清晰设定图', imageLayout: { ratio: '3 / 4', fit: 'contain', position: 'center bottom', mode: 'subject' }, imageSource: { title: '用户提供的清晰角色设定图（月夜见形象）' } }
  ],
  mami: [
    { id: 'reality', label: '现实', image: '/assets/images/wiki/entries/characters/mami-reality.webp', imageAlt: '谏山真实现实形象清晰设定图', imageLayout: { ratio: '3 / 4', fit: 'contain', position: 'center bottom', mode: 'subject' }, imageSource: { title: '用户提供的清晰角色设定图（现实形象）' } },
    { id: 'tsukuyomi', label: '月夜见', image: '/assets/images/wiki/entries/characters/mami-tsukuyomi.webp', imageAlt: '谏山真实月夜见形象清晰设定图', imageLayout: { ratio: '3 / 4', fit: 'contain', position: 'center bottom', mode: 'subject' }, imageSource: { title: '用户提供的清晰角色设定图（月夜见形象）' } }
  ]
};

const termGuideAssets = {
  tsukuyomi: guideAsset('terms', 'tsukuyomi', 'webp', 1095, 620, 41, 'scene'),
  'yachiyo-cup': guideAsset('terms', 'yachiyo-cup', 'webp', 730, 445, 10, 'scene'),
  kassen: guideAsset('terms', 'kassen', 'webp', 730, 455, 8, 'scene'),
  'black-onyx': guideAsset('terms', 'black-onyx', 'webp', 450, 285, 56, 'scene'),
  remember: guideAsset('terms', 'remember', 'webp', 495, 1150, 54, 'collage'),
  reply: guideAsset('terms', 'reply', 'webp', 490, 1505, 62, 'collage'),
  taketori: guideAsset('terms', 'taketori', 'webp', 1200, 1760, 3, 'scene')
};

const characterSlugs = {
  'entry-kaguya': 'kaguya',
  'entry-iroha': 'iroha',
  'entry-yachiyo': 'yachiyo',
  'entry-akira': 'akira',
  'entry-rai': 'rai',
  'entry-noi': 'noi',
  'entry-roka': 'roka',
  'entry-mami': 'mami',
  'entry-fushi': 'fushi',
  'entry-doge': 'doge',
  'entry-otako': 'otako',
  'entry-terukoto': 'terukoto'
};

const sourceSectionLinks = [
  { id: 'source-profile', label: '基本资料' },
  { id: 'source-lead', label: '条目引言' },
  { id: 'source-intro', label: '简介' },
  { id: 'source-experience', label: '经历' },
  { id: 'source-trivia', label: '角色相关逸事' }
];

const characterProfiles = {
  kaguya: {
    aliases: ['辉夜姬', 'かぐや', '月球少女', '外星人'],
    headline: '从月球闯入东京日常，以歌声、行动力和跨越时间的约定追寻 Happy End 的少女。',
    sourceArticle: 'kaguya',
    sourceSectionLinks,
    facts: [
      ['年龄', '初登场约 10 个月（外观快速成长）'],
      ['生日', '7 月 12 日'],
      ['声优', '夏吉优子'],
      ['出身', '月球'],
      ['身份', '月人公主／主播／歌手'],
      ['活动组合', '辉夜×彩P'],
      ['活动范围', '现实东京、虚拟空间“月读”'],
      ['能力', '快速成长、改变外观、料理与高速学习'],
      ['喜好', '甜食、零食与有趣的新鲜事物'],
      ['代表歌曲', 'Reply、瞬間、シンフォニー。']
    ],
    sections: [
      ['人物简介', [
        '辉夜是从月球来到地球的少女。她搭乘的飞船意外落在酒寄彩叶居所附近，最初以婴儿形态出现，又在短短数日内迅速成长。彩叶根据《竹取物语》为她取名“辉夜”，两人的共同生活也由此开始。',
        '她不喜欢月球上重复而乏味的生活，把地球视为寻找乐趣和自由的新舞台。接触电脑后，她以惊人的速度掌握语言、互联网和现代生活知识，并很快对虚拟空间“月读”产生兴趣。',
        '辉夜在现实中保留金色长发和宽松黑色上衣的轻快形象；进入月读后，则使用带兔耳、和服轮廓和月牙装饰的“月夜见”形象。页面顶部可以在两种形态之间切换。'
      ]],
      ['性格、能力与爱好', [
        '辉夜开朗、调皮、爱撒娇，而且几乎没有面对陌生环境的拘谨感。她想到什么便立刻尝试，常常先行动再考虑后果；这种冒失既制造了许多麻烦，也是她不断突破困境的动力。',
        '月人的身体让她拥有远超常人的成长速度和适应能力。她能够改变发色、肤色等外观特征，运动能力也十分突出；配合高速学习，她可以在很短时间内掌握设备、网络文化和直播流程。',
        '她喜欢甜食、零食和热闹的活动，同时有出色的料理天赋。初次认真下厨便做出令彩叶印象深刻的料理，但她购买高级食材和直播设备时缺少金钱观念，也经常让生活拮据的彩叶措手不及。'
      ]],
      ['与酒寄彩叶', [
        '彩叶起初只是无法放任来历不明的孩子，随后逐渐承担起监护人与家人的角色。辉夜从彩叶的哼唱中获得最早的安全感，而彩叶也因为辉夜毫无保留的需要与信任，第一次拥有了能够共同生活的“家”。',
        '辉夜发现彩叶隐藏起来的音乐才能后，主动邀请她成为搭档。彩叶以“彩P”的身份负责作曲、编曲、设备和运营，辉夜则承担演唱、直播与镜头前的表演，两人组成“辉夜×彩P”。',
        '两人的关系贯穿照顾、创作和相互拯救。辉夜把彩叶带回音乐之中，彩叶则不断拒绝接受命运安排的离别；她们共同追求的 Happy End，不是被动等待的结局，而是需要亲手创造的未来。'
      ]],
      ['组合活动与八千代杯', [
        '辉夜第一次进入月读便遇见管理员兼顶级主播月见八千代，并观看了她的演唱会。八千代宣布“八千代杯”后，辉夜为了赢得与偶像同台合唱的机会，当场决定参加主播涨粉竞赛。',
        '她最初的直播缺乏规划，甚至在出道视频中暴露现实身份；彩叶加入后，两人把即兴企划、音乐创作和精细运营结合起来，粉丝增长逐渐加速。辉夜还向芦花和真实请教直播经验，让原本私人的日常发展成完整的舞台活动。',
        '面对顶流组合“黑玛瑙”，辉夜和彩叶接受《合战》3V3挑战。虽然比赛由黑玛瑙获胜，但辉夜×彩P凭借活动期间积累的人气，以微弱优势夺得八千代杯冠军，并取得与八千代举办联动演唱会的资格。'
      ]],
      ['角色意象与生活细节', [
        '松饼是辉夜和彩叶共同生活的重要记忆。彩叶最初用面粉和水做出的简陋食物并不好吃，却成为辉夜在漫长岁月中反复怀念的味道；它代表的并非料理本身，而是两人刚刚成为家人的时刻。',
        '旧居漱口杯中牙刷数量的变化记录了辉夜进入彩叶生活的过程：从一支变成两支，意味着两人的物品与日常逐渐交叠；在八千代复原的记忆房间里，它又回到一支，暗示她对过去既眷恋又不敢靠近。',
        '彩叶的黑色旧 T 恤也贯穿辉夜的不同成长阶段。同一件衣服在不同年龄外观以及八千代身上呈现出不同效果，将婴儿般的依赖、少女时期的亲密和八千年后的记忆连接在一起。'
      ]],
      ['歌曲与核心主题', [
        '《Reply》由彩叶为辉夜创作，其旋律与八千代的《Remember》彼此呼应。两首歌分别承载“回应”与“记忆”，歌声最终成为穿越月球、现实与时间的通讯方式。',
        '辉夜的故事重新解释了《竹取物语》的离别结局：她知道自己可能被月人带走，却始终相信结局可以被重新书写。角色的行动、直播和歌声都围绕同一个愿望展开——不把失去当作终点，而是把所有重要的人一起带向幸福。'
      ]]
    ],
    spoiler: [
      '辉夜与彩叶赢得八千代杯后搬入新居，并迎来与八千代的联动演唱会。演出期间出现月人发出的异常讯号，辉夜随后向彩叶坦白：她是逃离月球的公主，必须在 2030 年 9 月 12 日的满月之夜返回。',
      '辉夜发布隐退声明，并把毕业演唱会作为告别舞台。彩叶联合八千代、黑玛瑙、芦花和真实尝试阻止月人，但最终仍未能留下她；现实中的辉夜在与彩叶告别后消失，月读中的形象也如《竹取物语》中的辉夜姬般升向月面。',
      '彩叶拒绝把离别包装成一个勉强的好结局，完成新歌并借辉夜留下的手环向月球传递歌声。她发现《Reply》与《Remember》拥有相同的旋律，也因此意识到失踪的八千代与辉夜存在直接联系。',
      '返回月球后的辉夜为了再次见到彩叶，制造了能够穿越时间的飞船，却因事故落入约八千年前的地球。她只能依靠 FUSHI 与外界交流，并在漫长历史中等待互联网出现，最终利用月人科技建立虚拟空间“月读”，以“月见八千代”的身份继续守望彩叶。',
      '八千代认为经历八千年后的自己已经不能再作为昔日的辉夜面对彩叶，甚至想删除对方的悲伤记忆。彩叶通过 FUSHI 接收她漫长岁月中的记忆，理解了欢笑、战争、孤独与等待怎样让“辉夜”逐渐成为“八千代”，并明确表示仍然希望与她在一起。',
      '由于八千代在月读中无法感受体温和味觉，彩叶转向相关科学领域，用十年时间推进感知系统与合成人躯体研究。最终，拥有熟悉金发与面容的新身体苏醒，辉夜／八千代获得重新进入现实生活的机会，作品所追求的 Happy End 至此真正完成。'
    ],
    relatedCharacters: ['iroha', 'yachiyo', 'fushi', 'doge'],
    relatedTerms: ['tsukuyomi', 'yachiyo-cup', 'reply', 'taketori'],
    sourceLinks: [{ label: '作品官网角色页', url: OFFICIAL_CHARACTER }, { label: '萌娘百科：辉夜（本页资料参考）', url: moegirlCharacterEntries.kaguya.url }]
  },
  iroha: {
    sourceArticle: 'iroha',
    sourceSectionLinks,
    aliases: ['酒寄彩葉', '彩P', 'Iroha'],
    headline: '把过载的生活重新写成音乐，并负责让舞台真正运转的人。',
    facts: [['年龄', '17 岁'], ['生日', '5 月 11 日（社区资料）'], ['身份', '高中生／制作人／作曲者'], ['活动名', '彩P'], ['声优', '永濑安奈']],
    sections: [
      ['人物简介', ['酒寄彩叶是故事的现实侧主人公。她独自在东京承担学业、打工和生活支出，表面可靠到近乎无所不能，实际长期处在严重透支状态。', '她曾经写歌，却因家庭与生活压力把音乐搁置。辉夜的出现打破了她精密而封闭的日程，也让“再次创作”变成无法回避的选择。']],
      ['能力与创作', ['彩叶兼具作曲、演奏、游戏与运营能力。在“辉夜×彩P”组合中，她不仅写歌，也负责直播策划、资源安排和危机处理。', '月读中的虚拟形象强调狐耳、和风与制作人属性，和现实中的学生形象形成对照。']],
      ['人物关系', ['辉夜是彩叶重新拥抱音乐的契机，也是她第一次主动争取的未来。八千代起初是她仰慕的主播，后来则成为理解整段时间闭环的关键。']]
    ],
    spoiler: ['辉夜离开后，彩叶没有接受“就此结束”的结局，而是完成《Reply》并继续追查八千代。', '理解八千代经历的漫长时间后，她转向相关科学领域，希望赋予对方能够感受现实的身体。十年后的成果构成作品的 Happy End。'],
    relatedCharacters: ['kaguya', 'yachiyo', 'akira', 'roka', 'mami'],
    relatedTerms: ['tsukuyomi', 'kassen', 'yachiyo-cup', 'reply'],
    sourceLinks: [{ label: '作品官网角色页', url: OFFICIAL_CHARACTER }, { label: '萌娘百科：酒寄彩叶', url: 'https://zh.moegirl.org.cn/%E9%85%92%E5%AF%84%E5%BD%A9%E5%8F%B6' }]
  },
  yachiyo: {
    sourceArticle: 'yachiyo',
    sourceSectionLinks,
    aliases: ['月見ヤチヨ', 'Runami Yachiyo', 'ycy'],
    headline: '月读的管理员、顶级主播，以及一场跨越八千年的等待。',
    facts: [['自称年龄', '8000 岁以上'], ['身份', '月读管理员／虚拟歌手／主播'], ['活动范围', '虚拟空间“月读”'], ['代表歌曲', 'Remember、星降る海'], ['声优', '早见沙织']],
    sections: [
      ['人物简介', ['月见八千代与月读几乎同时进入公众视野。她能歌善舞，也能以分身承担管理员、新手引导与导航等职责，因此被包装为“8000 岁神秘 AI”。', '她真心享受创作者在月读中分享快乐的状态，并把维持这个空间视为自己的责任。']],
      ['舞台与管理者身份', ['八千代既是偶像，也是平台本身的象征。她举办八千代杯、参与联动演出，并在辉夜和彩叶的成长中保持若即若离的关注。', '《Remember》代表等待与记忆；当《Reply》出现后，两首歌共同承担了跨越时间的叙事功能。']],
      ['与彩叶、辉夜', ['彩叶是八千代的重要观众，辉夜则让两人的关系从单向仰慕变成复杂的时间回环。无剧透阅读时，可以把三人的关系理解为“歌手—制作人—平台守望者”。']]
    ],
    spoiler: ['八千代实际上是经历漫长时间后的辉夜。返航后的辉夜试图回到彩叶身边，却误入约八千年前，只能借助新的身体与网络逐步建立月读。', '她长期以“八千代”身份守望彩叶，既来自责任，也来自对自己已经不再是昔日辉夜的自卑。彩叶的选择最终打破这种自我否定。'],
    relatedCharacters: ['kaguya', 'iroha', 'fushi', 'doge'],
    relatedTerms: ['tsukuyomi', 'yachiyo-cup', 'remember', 'reply'],
    sourceLinks: [{ label: '官方角色 PV（X）', url: 'https://x.com/Cho_KaguyaHime/status/1987490353709043948' }, { label: '萌娘百科：月见八千代', url: 'https://zh.moegirl.org.cn/%E6%9C%88%E8%A7%81%E5%85%AB%E5%8D%83%E4%BB%A3' }]
  },
  akira: {
    sourceArticle: 'akira',
    sourceSectionLinks,
    aliases: ['帝アキラ', 'Mikado Akira'],
    headline: '把竞技对局变成大型表演的 Black onyX 领队。',
    facts: [['身份', '职业玩家／主播'], ['所属', 'Black onyX'], ['擅长', 'KASSEN、现场调度'], ['声优', '入野自由']],
    sections: [['人物简介', ['帝アキラ是 Black onyX 的领队，公开形象张扬、擅长制造话题，也懂得如何让一场比赛成为观众愿意参与的直播事件。']], ['剧情作用', ['他向辉夜与彩叶发起 KASSEN 合作赛／挑战，使八千代杯从单纯涨粉竞赛转入正面对决。']], ['团队关系', ['雷与乃依是其固定队友。三人的风格共同构成 Black onyX 的完整舞台形象。']]],
    spoiler: ['帝アキラ与彩叶的现实关系属于剧情揭示。本页只在剧透区说明：他实际一直关注彩叶的处境，挑战也包含主动为她们创造曝光机会的用意。'],
    relatedCharacters: ['iroha', 'rai', 'noi'], relatedTerms: ['black-onyx', 'kassen', 'yachiyo-cup']
  },
  rai: {
    sourceArticle: 'rai',
    sourceSectionLinks,
    aliases: ['駒沢雷'], headline: 'Black onyX 中冷静寡言、兼具竞技与演唱能力的成员。',
    facts: [['身份', '职业玩家／主播'], ['所属', 'Black onyX'], ['关系', '驹泽乃依的哥哥'], ['声优', '内田雄马']],
    sections: [['人物简介', ['驹泽雷话不多，常以冷静表现平衡团队的张扬气氛。除竞技实力外，他也具备出色的演唱能力。']], ['团队位置', ['在 Black onyX 的三人配置中，雷负责提供稳定感，并与乃依形成鲜明的兄弟组合。']]],
    relatedCharacters: ['akira', 'noi'], relatedTerms: ['black-onyx', 'kassen']
  },
  noi: {
    sourceArticle: 'noi',
    sourceSectionLinks,
    aliases: ['駒沢乃依'], headline: '认真回应粉丝、偏爱可爱装扮的 Black onyX 成员。',
    facts: [['身份', '职业玩家／主播'], ['所属', 'Black onyX'], ['关系', '驹泽雷的弟弟'], ['声优', '松冈祯丞']],
    sections: [['人物简介', ['驹泽乃依使用男性虚拟形象，却偏爱可爱的服装与营业方式。认真活动时，他很擅长回应粉丝。']], ['团队位置', ['乃依为 Black onyX 增加轻快和亲近感，与雷的沉稳、アキラ的张扬形成互补。']]],
    relatedCharacters: ['akira', 'rai'], relatedTerms: ['black-onyx', 'kassen']
  },
  roka: {
    sourceArticle: 'roka',
    sourceSectionLinks,
    aliases: ['綾紬芦花'], headline: '能够看穿彩叶逞强的朋友与美妆创作者。',
    facts: [['身份', '高中生／美妆创作者'], ['关系', '彩叶、真实的朋友'], ['活动范围', '现实、月读'], ['声优', '青山吉能']],
    sections: [['人物简介', ['绫䌷芦花是彩叶在学校与现实生活中的重要朋友。她经营美妆类内容，对形象和他人状态都很敏锐。']], ['与彩叶', ['芦花能察觉彩叶把疲惫藏在“什么都能处理”的外表下。辉夜出现后，她也很快发现彩叶的生活正在发生变化。']]],
    relatedCharacters: ['iroha', 'mami', 'kaguya'], relatedTerms: ['tsukuyomi']
  },
  mami: {
    sourceArticle: 'mami',
    sourceSectionLinks,
    aliases: ['諌山真実'], headline: '性格随和、连接日常与主播文化的美食创作者。',
    facts: [['身份', '高中生／美食创作者'], ['关系', '彩叶、芦花的朋友'], ['喜好', '帝アキラ的活动'], ['声优', '小原好美']],
    sections: [['人物简介', ['谏山真实是彩叶的朋友与美食类创作者。她性格随和，对热门主播和月读文化保持强烈兴趣。']], ['剧情作用', ['真实让彩叶的现实朋友圈与月读活动自然连接，也在多人行动中承担气氛调节者。']]],
    relatedCharacters: ['iroha', 'roka', 'akira'], relatedTerms: ['tsukuyomi', 'kassen'],
    sourceLinks: [{ label: '萌娘百科：谏山真实', url: 'https://zh.moegirl.org.cn/%E8%B0%8F%E5%B1%B1%E7%9C%9F%E5%AE%9E' }]
  },
  fushi: {
    aliases: ['不死', 'FUSHI'], headline: '跟随八千代的海兔形向导，也是漫长时间的见证者。',
    facts: [['身份', '月读向导／八千代搭档'], ['外形', '海兔状虚拟生物'], ['活动范围', '月读与现实设施'], ['声优', '钉宫理惠']],
    sections: [['人物简介', ['FUSHI 以毛茸茸的海兔形象活动，是八千代身边最稳定的搭档。它能引导用户，也负责处理部分空间事务。']], ['谜团', ['FUSHI 对辉夜和犬DOGE表现出的警惕提示它掌握更多信息，但公开资料并未解释所有机制。']]],
    spoiler: ['FUSHI 与辉夜经历的漫长时间有关，也保存或见证了八千代的重要记忆。其与犬DOGE的连续关系应以作品最终呈现为准。'],
    relatedCharacters: ['yachiyo', 'doge', 'iroha'], relatedTerms: ['tsukuyomi']
  },
  doge: {
    aliases: ['犬DOGE', '狗狗DOGE'], headline: '陪伴辉夜、又与 FUSHI 谜团相连的月读向导。',
    facts: [['身份', '月读向导／辉夜搭档'], ['外形', '犬形虚拟生物'], ['关联', 'FUSHI'], ['声优', '庄司更纱']],
    sections: [['人物简介', ['犬DOGE 与辉夜一同行动，以更接近电子宠物和引导角色的方式参与月读活动。']], ['资料边界', ['DOGE 与 FUSHI 的关系涉及结局信息。无剧透区不把社区推测写成官方机制。']]],
    spoiler: ['二者的连续性与辉夜／八千代的时间经历有关；具体的身体、数据与记忆机制仍需以官方导览书等资料进一步核对。'],
    relatedCharacters: ['kaguya', 'yachiyo', 'fushi'], relatedTerms: ['tsukuyomi']
  },
  otako: {
    aliases: ['忠犬オタ公'], headline: '以新闻节目连接观众与月读热点的资讯主播。',
    facts: [['身份', '资讯主播'], ['节目', 'NEWS TSUKUYOMI!!'], ['活动范围', '月读'], ['声优', '菲鲁兹·蓝']],
    sections: [['人物简介', ['忠犬宅公主持月读资讯节目，负责将平台事件、主播活动和新鲜话题整理给观众。']], ['世界观作用', ['该角色让月读显得不只是舞台，也拥有自己的媒体生态和信息流。']]],
    relatedCharacters: ['terukoto'], relatedTerms: ['tsukuyomi', 'yachiyo-cup']
  },
  terukoto: {
    aliases: ['乙事照琴'], headline: '从职业玩家转向大型活动解说的月读主播。',
    facts: [['身份', '赛事解说／前职业玩家'], ['擅长', '现场实况、竞技分析'], ['活动范围', '月读'], ['声优', '花江夏树']],
    sections: [['人物简介', ['乙事照琴曾是职业玩家，后来以主播和赛事解说身份活跃。他擅长临场谈话和梳理复杂对局。']], ['剧情作用', ['在 KASSEN 与八千代杯等活动中，照琴让比赛结果更易被观众理解，也强化了直播赛事感。']]],
    relatedCharacters: ['otako', 'akira'], relatedTerms: ['kassen', 'yachiyo-cup', 'tsukuyomi']
  }
};

const termProfiles = {
  tsukuyomi: {
    headline: '现实身份、虚拟人格与创作活动交汇的网络空间。',
    facts: [['日文表记', 'ツクヨミ'], ['类型', '综合虚拟空间'], ['管理者', '月见八千代'], ['主要活动', '直播、游戏、演唱、社交、创作']],
    sections: [['定义', ['月读是作品近未来社会中的大型网络虚拟空间。用户以自定义分身进入，在其中直播、游戏、购物、社交和创作。']], ['空间功能', ['它既是演唱会舞台和竞技场，也是新闻、导航、货币和日常服务并存的平台。八千代的分身承担大量管理与引导工作。']], ['叙事意义', ['月读把“现实中无法相见”改写为“仍能共享舞台”。角色在其中选择身份、建立关系，也留下现实身体无法完成的感受。']]],
    relatedCharacters: ['yachiyo', 'iroha', 'kaguya', 'otako'], relatedTerms: ['yachiyo-cup', 'kassen', 'black-onyx']
  },
  'yachiyo-cup': {
    headline: '以涨粉和舞台机会为目标，将新人推向公众视野的竞赛。',
    facts: [['类型', '月读平台竞赛'], ['核心目标', '获得与八千代同台机会'], ['主要参赛方', '辉夜×彩P、Black onyX'], ['关联活动', 'KASSEN 对决']],
    sections: [['规则概览', ['八千代杯以主播成长和关注度为核心指标。对辉夜和彩叶而言，它既是出道目标，也是获得稳定住处和继续活动机会的现实手段。']], ['剧情作用', ['竞赛让两人的私人创作进入公众视野，并把 Black onyX、八千代和多位朋友纳入同一事件链。']]],
    relatedCharacters: ['kaguya', 'iroha', 'yachiyo', 'akira'], relatedTerms: ['tsukuyomi', 'kassen', 'black-onyx']
  },
  kassen: {
    headline: '月读中的竞技游戏，也是直播时代“难题挑战”的舞台。',
    facts: [['表记', 'KASSEN／合战'], ['类型', '团队竞技游戏'], ['主要队伍', '辉夜一方、Black onyX'], ['叙事位置', '八千代杯中段']],
    sections: [['游戏定位', ['KASSEN 是月读中流行的团队竞技游戏。彩叶具备准职业级理解，Black onyX 则以职业玩家团队身份占据明显优势。']], ['直播与表演', ['作品并不只把对局处理为胜负，而是强调挑战书、组队、临场替补、解说和观众反应。']], ['考察', ['本页将 KASSEN 视为对《竹取物语》求婚难题的现代化呼应，但这是结构解读，不是官方设定原文。']]],
    relatedCharacters: ['iroha', 'akira', 'rai', 'noi', 'terukoto'], relatedTerms: ['tsukuyomi', 'yachiyo-cup', 'black-onyx', 'taketori']
  },
  'black-onyx': {
    headline: '兼具职业竞技实力和主播表现力的三人团队。',
    facts: [['成员', '帝アキラ、驹泽雷、驹泽乃依'], ['类型', '职业玩家／主播团队'], ['主要项目', 'KASSEN'], ['对手', '辉夜×彩P']],
    sections: [['团队概览', ['Black onyX 是月读中的高人气职业玩家与主播组合。アキラ负责领队和话题，雷与乃依提供竞技、演唱和粉丝互动上的互补。']], ['与主角组', ['他们是八千代杯中最直接的竞争者，却不只是反派。挑战使辉夜和彩叶获得更大曝光，也促成若干现实关系的揭示。']]],
    relatedCharacters: ['akira', 'rai', 'noi', 'iroha', 'kaguya'], relatedTerms: ['kassen', 'yachiyo-cup', 'tsukuyomi']
  },
  remember: {
    headline: '关于记忆、等待与漫长时间的核心歌曲。',
    facts: [['演唱', '月见八千代（早见沙织）'], ['作词', '真崎エリカ'], ['作曲／编曲', 'yuigot'], ['分类', '插入歌／角色歌曲']],
    sections: [['歌曲定位', ['《Remember》是八千代的重要歌曲，也是彩叶最熟悉的精神寄托之一。她曾把这首歌唱给刚出现的辉夜。']], ['叙事功能', ['歌曲名“记住”与长期等待、跨越时代的记忆直接相连，并在后半段与《Reply》形成问答关系。']], ['版权说明', ['本页只整理歌曲信息与叙事位置，不提供歌词全文或音频。试听请前往官方 Music 页面。']]],
    relatedCharacters: ['yachiyo', 'iroha', 'kaguya'], relatedTerms: ['reply', 'tsukuyomi'], sourceLinks: [{ label: '官方 Music', url: OFFICIAL_MUSIC }]
  },
  reply: {
    headline: '彩叶和辉夜对等待作出的音乐回应。',
    facts: [['演唱', '辉夜（夏吉优子）'], ['作词', '真崎エリカ'], ['作曲／编曲', 'kz (livetune)'], ['分类', '原创插入歌']],
    sections: [['歌曲定位', ['《Reply》由彩叶的创作意志推动，是辉夜故事线的重要原创歌曲。']], ['与 Remember', ['两首歌在旋律和标题上形成“记住／回应”的镜像，也把无法当面说完的话转化为可以穿越距离与时间的声音。']], ['版权说明', ['本页不提供歌词全文、下载或未经授权的音频。试听与 MV 入口以官方 Music 页面为准。']]],
    spoiler: ['《Reply》成为彩叶跨越距离寻找辉夜／八千代的媒介，并帮助她理解两位角色之间的身份连续性。'],
    relatedCharacters: ['kaguya', 'iroha', 'yachiyo'], relatedTerms: ['remember', 'tsukuyomi'], sourceLinks: [{ label: '官方 Music', url: OFFICIAL_MUSIC }]
  },
  taketori: {
    headline: '被重新翻译为电线杆、直播竞赛和虚拟空间的古典母题。',
    facts: [['原典', '《竹取物语》'], ['核心母题', '竹中诞生、快速成长、难题、回月'], ['作品改写', '近未来东京与虚拟空间'], ['性质', '文学原典／结构参照']],
    sections: [['原典关联', ['动画保留了辉夜姬突然出现、快速成长、引发关注并最终被月亮召回的基本骨架。']], ['现代化改写', ['竹子被虹光电线杆替代，求婚难题转化为直播与竞技挑战，羽衣与月之迎接则进入现实和虚拟舞台的双重演出。']], ['考察边界', ['作品并非逐项机械改编原典。本页只记录明显结构呼应，并把进一步对应标为考察。']]],
    relatedCharacters: ['kaguya', 'iroha'], relatedTerms: ['kassen', 'yachiyo-cup']
  }
};

function relationLabel(slug, kind) {
  if (kind === 'character') return characterProfiles[slug] ? characters.find((item) => characterSlugs[item.id] === slug)?.name : slug;
  return terms.find((item) => item.id === slug)?.label || slug;
}

export const characterEntries = characters.map((character) => {
  const slug = characterSlugs[character.id];
  const profile = characterProfiles[slug] || {};
  const guide = characterGuideAssets[slug];
  const imageVariants = characterImageVariants[slug] || [];
  const primaryImage = imageVariants[0];
  return {
    kind: 'character',
    kindLabel: '角色词条',
    slug,
    title: character.name,
    original: character.original,
    headline: profile.headline || character.description,
    summary: character.description,
    aliases: profile.aliases || [character.original],
    tags: character.tags,
    facts: profile.facts || [['声优', character.cv], ['身份', character.tags.join('／')]],
    sections: profile.sections || [['人物简介', [character.description]]],
    spoiler: profile.spoiler || [],
    relatedCharacters: profile.relatedCharacters || [],
    relatedTerms: profile.relatedTerms || character.relatedTerms,
    image: primaryImage?.image || guide?.image || null,
    imageLayout: primaryImage?.imageLayout || guide?.imageLayout,
    imageSource: primaryImage?.imageSource || guide?.imageSource,
    imageAlt: primaryImage?.imageAlt || `${character.name}角色立绘`,
    imageVariants,
    imageTarget: (primaryImage?.image || guide?.image)?.replace(/^\//, '') || `assets/images/wiki/entries/characters/${slug}.webp`,
    imageSuggestion: primaryImage ? '已使用用户提供的清晰透明立绘' : guide ? `已从公式书第 ${guide.imageSource.page} 页按角色构图处理` : '请按角色构图补充清晰图片',
    sourceArticle: profile.sourceArticle,
    sourceSectionLinks: profile.sourceSectionLinks,
    moegirl: moegirlCharacterEntries[slug],
    sourceLinks: profile.sourceLinks || [{ label: '作品官网角色页', url: OFFICIAL_CHARACTER }, { label: '萌娘百科作品条目', url: MOEGIRL_WORK }],
    verifiedAt
  };
});

export const termEntries = terms.map((term) => {
  const profile = termProfiles[term.id] || {};
  const guide = termGuideAssets[term.id];
  return {
    kind: 'term',
    kindLabel: term.id === 'remember' || term.id === 'reply' ? '音乐词条' : '设定词条',
    slug: term.id,
    title: term.label,
    original: term.aliases[0] || '',
    headline: profile.headline || term.summary,
    summary: term.summary,
    aliases: term.aliases,
    tags: profile.facts?.slice(0, 3).map(([label]) => label) || ['设定'],
    facts: profile.facts || [['分类', '作品设定']],
    sections: profile.sections || [['词条说明', [term.summary]]],
    spoiler: profile.spoiler || [],
    relatedCharacters: profile.relatedCharacters || [],
    relatedTerms: profile.relatedTerms || [],
    image: guide?.image || '/assets/images/wiki/wiki-hero-original.webp',
    imageLayout: guide?.imageLayout,
    imageSource: guide?.imageSource,
    imageAlt: guide ? `${term.label}：公式书场景裁图` : `${term.label}概念背景：原创月夜虚拟舞台插画`,
    imageTarget: guide?.image?.replace(/^\//, '') || `assets/images/wiki/entries/terms/${term.id}.webp`,
    imageSuggestion: guide ? `已从公式书第 ${guide.imageSource.page} 页按场景构图处理` : '请按场景构图补充清晰图片',
    gallerySlots: [
      { label: '设定结构／场景图', suggestion: '建议 1600×900' },
      { label: '剧情或界面示例', suggestion: '建议 1600×900' }
    ],
    sourceLinks: profile.sourceLinks || [{ label: '作品官方网站', url: OFFICIAL_SITE }, { label: '萌娘百科作品条目', url: MOEGIRL_WORK }],
    verifiedAt
  };
});

export const allWikiEntries = [...characterEntries, ...termEntries];

export function getWikiEntry(kind, slug) {
  const source = kind === 'character' ? characterEntries : kind === 'term' ? termEntries : [];
  return source.find((entry) => entry.slug === String(slug || '')) || null;
}

export function wikiEntryPath(kind, slug) {
  return `/wiki/${kind === 'character' ? 'characters' : 'terms'}/${slug}`;
}

export function relatedWikiEntries(entry) {
  if (!entry) return [];
  return [
    ...entry.relatedCharacters.map((slug) => ({ kind: 'character', slug, label: relationLabel(slug, 'character') })),
    ...entry.relatedTerms.map((slug) => ({ kind: 'term', slug, label: relationLabel(slug, 'term') }))
  ].filter((item) => item.label);
}

export function entrySongs(entry) {
  if (!entry) return [];
  const haystack = [entry.title, entry.original, ...entry.aliases].join(' ').toLocaleLowerCase();
  return music.filter((song) => haystack.includes(song.performer.split('（')[0].toLocaleLowerCase()) || song.performer.includes(entry.title)).slice(0, 6);
}
