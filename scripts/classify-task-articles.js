#!/usr/bin/env node
// Explicit database path required; default operation only produces a review plan.
const fs=require('node:fs'),crypto=require('node:crypto');
const Database=require('better-sqlite3');
const {routineReason,TASK_CATEGORY}=require('../backend/services/article-content-policy');
const args=process.argv.slice(2), value=flag=>args[args.indexOf(flag)+1];
if(!args.includes('--database')||!value('--database')||(!args.includes('--plan')&&!args.includes('--apply')))throw Error('Use --database PATH --plan PLAN.json (read-only), or --database PATH --apply PLAN.json --receipt RECEIPT.json');
const applying=args.includes('--apply');
if(applying&&!args.includes('--receipt'))throw Error('A recovery receipt path is required');
const db=new Database(value('--database'),{readonly:!applying,fileMustExist:true});db.pragma('busy_timeout = 10000');
const fingerprint=row=>crypto.createHash('sha256').update(JSON.stringify([row.title,row.content,row.content_format,row.status])).digest('hex');
const rows=()=>db.prepare("SELECT id,title,category,content,content_format,status,slug,published_at,created_at,updated_at FROM articles WHERE COALESCE(status,'published')='published' ORDER BY id").all();
if(!applying){
 const items=rows().filter(row=>row.category!==TASK_CATEGORY).map(row=>({row,reason:routineReason(row)})).filter(item=>item.reason)
  .map(({row,reason})=>({id:row.id,title:row.title,from:row.category,to:TASK_CATEGORY,reason,fingerprint:fingerprint(row)}));
 const plan={version:1,createdAt:new Date().toISOString(),items};
 fs.writeFileSync(value('--plan'),JSON.stringify(plan,null,2),{flag:'wx',mode:0o600});
 console.log(JSON.stringify({mode:'dry-run',count:items.length,items:items.map(({fingerprint,...item})=>item)}));
}else{
 const plan=JSON.parse(fs.readFileSync(value('--apply'),'utf8'));if(plan.version!==1||!Array.isArray(plan.items))throw Error('Invalid plan');
 if(fs.existsSync(value('--receipt')))throw Error('Receipt already exists; inspect it before applying again');
 const apply=db.transaction(()=>{
  const changes=[];for(const item of plan.items){
   const row=db.prepare('SELECT * FROM articles WHERE id=?').get(item.id);
   if(!row||fingerprint(row)!==item.fingerprint)throw Error(`Article ${item.id} changed since review; regenerate the plan`);
   if(row.category===TASK_CATEGORY)continue;
   if(row.category!==item.from||item.to!==TASK_CATEGORY||!routineReason(row))throw Error(`Article ${item.id} no longer matches the plan`);
   changes.push(item);
  }
  const added=db.prepare('INSERT OR IGNORE INTO article_categories(name) VALUES (?)').run(TASK_CATEGORY);
  if(added.changes)db.prepare('UPDATE article_category_revision SET version=version+1 WHERE id=1').run();
  const update=db.prepare('UPDATE articles SET category=? WHERE id=? AND category=?');
  for(const item of changes)update.run(TASK_CATEGORY,item.id,item.from);
  if(changes.length)db.prepare('UPDATE article_discovery_state SET revision=revision+1 WHERE id=1').run();
  return changes;
 });
 const changes=apply.immediate();
 fs.writeFileSync(value('--receipt'),JSON.stringify({appliedAt:new Date().toISOString(),changes},null,2),{flag:'wx',mode:0o600});
 console.log(JSON.stringify({mode:'applied',count:changes.length,receipt:value('--receipt')}));
}
db.close();
