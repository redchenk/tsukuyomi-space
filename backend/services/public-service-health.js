const fs = require('node:fs/promises');

const services = ['llm','tts'];
const states = new Set(['up','down','degraded','unknown']);
const explanations = {
    generated_text: '官方供应商返回了有效文本和用量。',
    completed_request: '当前模型最近的真实业务请求已完成并结算。',
    generated_audio: '默认官方音源已返回可识别的音频。',
    result_uncertain: '最近一笔实际请求未取得可确认的最终结果，用量仍待核对。',
    egress_unreachable: '真实生成检测未能通过模型出口完成连接或读取回复。',
    request_failed: '最近的实际请求未正常完成。',
    provider_rejected: '供应商拒绝了实际请求。',
    invalid_reply: '供应商响应未包含有效文本或用量。',
    invalid_audio: '合成响应未包含有效音频。',
    voice_offline: '官方音源就绪检查失败。',
    disabled: '服务未启用。', unconfigured: '服务配置不完整。',
    readiness_only: '音源已就绪，实际合成仍待验证。',
    stale: '近期没有收到有效检测数据。',
    pending: '正在等待下一次实际检测。', probe_failed: '实际检测未能完成。',
    collector_error: '采集器暂时无法取得结果。'
};
function sanitize(value, now = Date.now()) {
    const {state,evidence,observedAt,checkedAt} = value || {};
    if (!states.has(state) || !Object.hasOwn(explanations,evidence) ||
        !Number.isSafeInteger(checkedAt) || !Number.isSafeInteger(observedAt) ||
        checkedAt > now+10000 || observedAt > checkedAt+10000 || now-checkedAt > 180000 ||
        now-observedAt > 18*60000) return {state:'unknown',evidence:'stale',observedAt:null,checkedAt:null};
    return {state,evidence,observedAt,checkedAt};
}
async function snapshot() {
    const entries = await Promise.all(services.map(async name => {
        try { return [name,sanitize(JSON.parse(await fs.readFile('/var/lib/yachiyo-status-'+name+'/public.json','utf8')))]; }
        catch { return [name,sanitize(null)]; }
    }));
    let cdnProbe = {state:'unknown',checkedAt:null};
    try {
        const {state,checkedAt} = JSON.parse(await fs.readFile('/var/lib/yachiyo-status-cdn/public.json','utf8'));
        const age = Date.now()-checkedAt;
        if (states.has(state) && Number.isSafeInteger(checkedAt) && age>=-10000 && age<=180000) cdnProbe = {state,checkedAt};
    } catch { /* A missing regional sample is reported as unknown. */ }
    return {version:1,services:Object.fromEntries(entries),cdnProbe,now:Date.now()};
}
function render(result) {
    const labels={up:'正常',down:'不可用',degraded:'部分异常',unknown:'待验证'};
    const date = time => time ? new Date(time).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}) : '暂无';
    const cards=services.map(key=>{
        const r=result.services[key];
        return '<section><h2>'+({llm:'官方 LLM 对话',tts:'官方 TTS 语音'})[key]+' · '+labels[r.state]+'</h2><p>'+explanations[r.evidence]+'</p><p>最近实测 '+date(r.observedAt)+'</p><p>采集时间 '+date(r.checkedAt)+'</p></section>';
    });
    return '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="60"><title>官方服务实时检测 | 月读空间</title><style>body{font:1rem/1.65 system-ui,sans-serif;max-width:44rem;margin:3rem auto;padding:0 1.3rem;color:#223642}section{border-top:1px solid #cbd9df}h2{font-size:1.2rem}a{color:#245b75}</style><h1>官方服务实时检测</h1><p>时间为北京时间。页面每分钟刷新。近期没有有效样本时显示待验证。</p>'+cards.join('')+'<p><a href="https://status.yachiyo.hk/">查看站点故障与恢复记录</a></p></html>';
}
module.exports={snapshot,render,sanitize};
