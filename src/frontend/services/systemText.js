import { translateFeedback, uiText } from '../i18n/runtime';

// Only recognized application templates are localized. Names, titles, message
// bodies and unrecognized notifications remain data, passed as parameters once.
export function notificationTitle(item) {
  const title = String(item?.title || '');
  const patterns = {
    follow: [[/^(.+) 关注了你$/, '{0} 关注了你']],
    like: [
      [/^(.+) 点赞了你的文章$/, '{0} 点赞了你的文章'],
      [/^(.+) 点赞了你的评论$/, '{0} 点赞了你的评论'],
      [/^(.+) 点赞了你的留言$/, '{0} 点赞了你的留言'],
      [/^(.+) 点赞了你的图库图片《([\s\S]+)》$/, '{0} 点赞了你的图库图片《{1}》']
    ],
    pixel_art_like: [[/^(.+) 点赞了你的像素画$/, '{0} 点赞了你的像素画']],
    bookmark: [[/^(.+) 收藏了你的文章$/, '{0} 收藏了你的文章']],
    reply: [
      [/^(.+) 回复了你的评论$/, '{0} 回复了你的评论'],
      [/^(.+) 回复了你的留言$/, '{0} 回复了你的留言'],
      [/^(.+) 评论了你的文章《([\s\S]+)》$/, '{0} 评论了你的文章《{1}》']
    ],
    mention: [[/^(.+) 在评论中提到了你$/, '{0} 在评论中提到了你'], [/^(.+) 在留言中提到了你$/, '{0} 在留言中提到了你']],
    moderation: [[/^有(回复|评论|留言)需要审核 #(\d+)$/, '有{0}需要审核 #{1}']]
  };
  for (const [pattern, template] of patterns[item?.type] || []) {
    const match = pattern.exec(title);
    if (match) return uiText(template, match.slice(1).map((value, index) => item.type === 'moderation' && index === 0 ? uiText(value) : value));
  }
  return title;
}

export function moderationReason(reason) {
  const message = String(reason?.message || '');
  const details = value => value.endsWith('等') ? value.slice(0, -1) + uiText('以及其他项') : value;
  if (reason?.code === 'keyword') {
    const match = /^包含需人工确认的关键词：([\s\S]+)。命中关键词不代表内容违规。$/.exec(message);
    if (match) return uiText('包含需人工确认的关键词：{0}。命中关键词不代表内容违规。', [details(match[1])]);
  }
  if (reason?.code === 'external_link') {
    const match = /^包含需核实的站外链接：([\s\S]+)。确认链接安全后才能公开。$/.exec(message);
    if (match) return uiText('包含需核实的站外链接：{0}。确认链接安全后才能公开。', [details(match[1])]);
  }
  return translateFeedback(message);
}

export function notificationContent(item) {
  if (item?.type === 'follow' && /^(.+) 关注了你$/.test(item.title || '') && item.content === '新的访客正在关注你的创作动态。') return uiText(item.content);
  if (item?.type === 'like' && item.metadata?.kind === 'gallery' && item.content === '你的图库图片收到了一个赞。') return uiText(item.content);
  if (item?.type !== 'moderation') return String(item?.content || '');
  const content = String(item.content || '');
  const match = /^审核原因：([\s\S]+)。内容尚未公开，请登录后台核对完整内容。$/.exec(content);
  if (!match) return content;
  const reasons = match[1].split(/；(?=包含需人工确认的关键词：|包含需核实的站外链接：)/).map(message => moderationReason({ code: message.startsWith('包含需人工确认') ? 'keyword' : message.startsWith('包含需核实') ? 'external_link' : '', message }));
  return uiText('审核原因：{0}。内容尚未公开，请登录后台核对完整内容。', [reasons.join('; ').replace(/[。.]+$/, '')]);
}
