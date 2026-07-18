const sourceMediaFileNames = [
  '辉夜姬-……一切都是大大的.webp',
  '辉夜姬-……只是在强颜欢笑.webp',
  '辉夜姬-……只是在强颜欢笑2.webp',
  '辉夜姬-颜艺1.webp',
  '辉夜姬-连租房电话也是168.webp',
  '辉夜姬-连收益都是爱你的数字.webp',
  '辉夜姬-这八千年的星压抑…….webp',
  '辉夜姬-要不我和彩叶结婚算了.webp',
  '辉夜姬-爱吃的零食，虽然没味道.webp',
  '辉夜姬-泥鳅2.webp',
  '辉夜姬-泥鳅1.webp',
  '辉夜姬-梦开始的地方.webp',
  '辉夜姬-整的活连自己都看不下去了.webp',
  '辉夜姬-拉橱柜门2.webp',
  '辉夜姬-拉橱柜门1.webp',
  '辉夜姬-我和我的首次相遇.webp',
  '辉夜姬-我本以为就这样也无所谓了.webp',
  '辉夜姬-我勒个.webp',
  '辉夜姬-彩叶上课睡觉差点被抓.webp',
  '辉夜姬-当她离去的时候，向她递出手的人，一个是亲人，而另一个…….webp',
  '辉夜姬-床头上摆的什么？.webp',
  '辉夜姬-孤寡老人偷偷抹泪.webp',
  '辉夜姬-搞砸了1.webp',
  '辉夜姬-搞砸了2.webp',
  '辉夜姬-如果把图中的8910倒过来的话…….webp',
  '辉夜姬-大哥也有不能输的理由！.webp',
  '辉夜姬-喜欢年龄差距大点有什么问题.webp',
  '辉夜姬-想和辉夜在一起.webp',
  '辉夜姬-同一件T恤2.webp',
  '辉夜姬-同一件T恤1.webp',
  '辉夜姬-同一件T恤0.webp',
  '辉夜姬-又变回了一根牙刷.webp',
  '辉夜姬-十七岁的单亲母亲（？）.webp',
  '辉夜姬-八千代向屏幕前的观众-彩叶打招呼.webp',
  '辉夜姬-你挡得住吗？.webp',
  '辉夜姬-你对她施了什么魔法？.webp',
  '辉夜姬-从此我们再也没有听说过邻居的下落.webp',
  '辉夜姬-于是她就这样闯进了她的世界.webp',
  '辉夜姬-两根牙刷.webp',
  '辉夜姬-两束电光.webp',
  '辉夜姬-一般人流的是汗.webp',
  '辉夜姬-一根牙刷.webp',
  '辉夜姬-小小的眼睛里…….webp',
  '辉夜姬-……谢谢你一直来看我.webp',
  '辉夜姬-“那是我的！”.webp',
  '辉夜姬-“再不走的话……就回不去了呀”.webp',
  '辉夜姬-“……最喜欢你了。”.webp',
  '辉夜姬-“……天人拉了这车子，辉夜姬便升天去了”.webp',
  '辉夜姬-她并非冷漠，只是…….webp',
  '辉夜姬-她并非冷漠，只是……2.webp',
  '辉夜姬-网络喷子老八（不是）.webp',
  '超时空辉夜姬犬DOGE.webp',
  '超时空辉夜姬漫画封面1.webp',
  '超时空辉夜姬忠犬宅公.webp',
  '超时空辉夜姬小说封面.webp',
  '超时空辉夜姬公式指南书封面.webp',
  '超时空辉夜姬乙事照琴.webp',
  '超时空辉夜姬FUSHI.webp',
  '辉夜姬-八千年份的思念.webp'
];

const normalizeMediaName = (name = '') => name
  .replace(/\.[^.]+$/, '')
  .normalize('NFKC')
  .toLocaleLowerCase()
  .replace(/[\p{P}\p{S}\s]/gu, '');

const sourceMediaByKey = new Map(sourceMediaFileNames.map((fileName, index) => [
  normalizeMediaName(fileName),
  `source-${String(index + 1).padStart(3, '0')}.webp`
]));

export function findSourceMedia(fileName) {
  const assetFileName = sourceMediaByKey.get(normalizeMediaName(fileName));
  return assetFileName ? `/assets/images/wiki/content/${assetFileName}` : null;
}

export const sourceMediaCount = sourceMediaFileNames.length;
