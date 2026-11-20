import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { publish, sample } from './sample.mjs';

const directory = process.env.STATE_DIRECTORY;
const runtime = pathToFileURL(process.cwd() + '/server/');
await publish(directory, async () => {
  const { Store } = await import(new URL('store.mjs',runtime));
  const { validateChat, officialProvider, boundedText } = await import(new URL('providers.mjs',runtime));
  const { readEgressConfig } = await import(new URL('openai-egress.mjs',runtime));
  const dir = process.env.DATA_DIR;
  const db = new DatabaseSync(join(dir, 'official-api.db'), {readOnly:true});
  try {
    const row = db.prepare('SELECT revision, settings_json, updated_at FROM official_settings WHERE singleton=1').get();
    const settings = JSON.parse(row.settings_json);
    if (!settings.enabled || !settings.published) return {state:'down', evidence:'disabled'};
    const cutoff = new Date(Math.max(Date.now()-900000, Date.parse(row.updated_at))).toISOString();
    const last = db.prepare(`SELECT r.created_at, r.error_code,
      MAX(CASE WHEN r.error_code IS NULL AND b.state='settled' THEN r.created_at END) OVER () AS last_success
      FROM official_requests r JOIN billing_requests b USING(request_id)
      WHERE r.provider_id=? AND r.model=? AND r.created_at>=? AND r.dispatch_state='finished'
      AND (r.error_code IS NOT NULL OR (b.state='settled' AND r.final_usage_json IS NOT NULL))
      ORDER BY r.created_at DESC LIMIT 1`).get(settings.provider,settings.model,cutoff);
    const business = last && {state:last.error_code?'degraded':'up',
      evidence:last.error_code?'request_failed':'completed_request', at:Date.parse(last.created_at)};
    return await sample(directory, String(row.revision), business, async () => {
      const key=Store.prototype.secret.call({
        get:(sql,id)=>db.prepare(sql).get(id), config:{masterKey:readFileSync(join(dir,'master.key'))}
      },settings.provider);
      if (!key) return {state:'down', evidence:'unconfigured'};
      const request = validateChat({model:settings.model,messages:[{role:'user',content:'Reply with just OK.'}],
        max_tokens:Math.min(16,settings.maxOutputTokens),stream:false},settings,{room:true});
      const response=await officialProvider(request.body,{settings,key,egress:readEgressConfig(),signal:AbortSignal.timeout(30000)});
      if (response.status !== 200) { response.body?.destroy?.(); return {state:'down', evidence:'provider_rejected'}; }
      const data=JSON.parse(await boundedText(response.body,65536));
      const choice=data.choices?.[0];
      const ok=typeof data.id==='string' && typeof data.model==='string' && !data.error &&
        typeof choice?.message?.content==='string' && choice.message.content.trim().length>0 &&
        ['stop','length'].includes(choice.finish_reason) && data.usage?.completion_tokens>0;
      return {state:ok?'up':'down',evidence:ok?'generated_text':'invalid_reply'};
    }, Date.parse(last?.last_success));
  } finally { db.close(); }
});
