// New replies share a thread parent; also recover older nested replies.
export function messageThreads(messages = []) {
  const byId = new Map(messages.map(item => [String(item.id), item]));
  const roots = new Map();
  function rootId(id) {
    const path = [];
    const seen = new Set();
    let current = byId.get(String(id));
    while (current?.parent_id && !roots.has(String(current.id))) {
      if (seen.has(String(current.id))) return null;
      seen.add(String(current.id));
      path.push(String(current.id));
      current = byId.get(String(current.parent_id));
    }
    const root = current ? (roots.has(String(current.id)) ? roots.get(String(current.id)) : String(current.id)) : null;
    for (const key of path) roots.set(key, root);
    return root;
  }
  const replies = new Map();
  for (const item of messages) {
    if (!item.parent_id) continue;
    const root = rootId(item.id);
    if (!root) continue;
    if (!replies.has(root)) replies.set(root, []);
    replies.get(root).push(item);
  }
  function target(item) {
    const id = item.reply_to_author ? item.reply_to_id : item.reply_to_id || item.parent_id;
    const recipient = byId.get(String(id));
    return { id: recipient?.id || null, name: recipient?.author || item.reply_to_author || '' };
  }
  return { rootId, target, replies, top: messages.filter(item => !item.parent_id) };
}

export function replyCopy(lang = 'zh') {
  return ({
    zh: { to: '回复', unknown: '原留言作者', cancel: '取消回复', comments: '跳转评论', top: '回到顶部', navigation: '文章快捷导航' },
    ja: { to: '返信先', unknown: '元の投稿者', cancel: '返信をキャンセル', comments: 'コメントへ', top: 'トップへ', navigation: '記事のクイックナビ' },
    en: { to: 'Reply to', unknown: 'original author', cancel: 'Cancel reply', comments: 'Jump to comments', top: 'Back to top', navigation: 'Article shortcuts' }
  })[lang] || replyCopy('zh');
}
