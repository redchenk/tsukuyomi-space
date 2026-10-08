const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parse, compileScript, compileTemplate, babelParse } = require('@vue/compiler-sfc');
const { transformInterface } = require('../scripts/i18n-transform.cjs');
const catalog = require('../src/frontend/i18n/interface-catalog.json');
const files = require('node:child_process').execFileSync('rg', ['--files', 'src/frontend'], { encoding: 'utf8' }).trim().split('\n')
 .filter(file => /\.(?:vue|js|mjs)$/.test(file) && !/\/(?:i18n|runtime|constants|data)\//.test(file));
const normalize = text => text.trim().replace(/\s+/g,' ');
const slots = text => [...text.matchAll(/\{\d+\}/g)].map(match=>match[0]).sort();
test('all authored interface entries have English/Japanese translations with the same parameters',()=>{
 for(const file of files) {
  const result=transformInterface(fs.readFileSync(file,'utf8'), file);
  for(const source of result.entries) for(const language of ['en','ja']) {
   assert.ok(catalog[normalize(source)]?.[language], `${file}: missing ${language}: ${source}`);
   assert.deepEqual(slots(catalog[normalize(source)][language]),slots(source), `${file}: ${source}`);
  }
  if(file.endsWith('.vue')) {
   const {descriptor,errors}=parse(result.code,{filename:file});assert.deepEqual(errors,[],file);
   if(descriptor.scriptSetup)compileScript(descriptor,{id:file});
   if(descriptor.template) assert.deepEqual(compileTemplate({source:descriptor.template.content,filename:file,id:file}).errors,[],file);
  }
  else babelParse(result.code, { sourceType: 'module', plugins: ['typescript'] });
 }
});
test('compiler preserves user bindings, form values, protocol identities and prompts',()=>{
 const source=`<script setup>
 const userText = ref('未翻译的用户数据');
 const buildPrompt = () => '未翻译的指令';
 const createPersona = () => ({ description: '原始角色指令' });
 const payload = { message: '保持原文', model: '模型ID', content: '用户正文' };
 const entry = { id: '标签ID', label: '保存' };
 const command = '/Fushi确认';
 const status = ref(''); function fail(){status.value='失败';}
 </script><template><input v-model="userText" value="原值" placeholder="搜索" :title="'删除'" />
 <span>{{ user.content }}</span><span>{{ user.name }}</span><code>技术代码</code><button>保存</button>
 <span>{{ count ? '已保存' : '失败' }}</span><span>{{ \`已更新 \${count} 个聊天模型\${done ? '已保存' : '失败'}\` }}</span>
 <span>{{ mode === '协议ID' ? '保存' : '删除' }}</span><span>{{ user['昵称'] }}</span>
 <span>{{ \`状态：\${mode === '协议ID' ? '保存' : '删除'} \${buildPrompt('原始指令')}\` }}</span></template>`;
 const result=transformInterface(source,'Safety.vue');
 assert.match(result.code,/ref\('未翻译的用户数据'\)/);assert.match(result.code,/=> '未翻译的指令'/);
 assert.match(result.code,/description: '原始角色指令'/);
 assert.match(result.code,/message: '保持原文'/);assert.match(result.code,/model: '模型ID'/);assert.match(result.code,/id: '标签ID'/);
 assert.match(result.code,/value="原值"/);assert.match(result.code,/v-model="userText"/);assert.match(result.code,/\{\{ user.content \}\}/);
 assert.match(result.code,/<code>技术代码<\/code>/);assert.match(result.code,/get label\(\)/);assert.match(result.code,/status.value=uiText/);
 assert.ok(result.entries.includes('已更新 {0} 个聊天模型{1}'));assert.ok(result.entries.includes('已保存'));
 assert.match(result.code,/mode === '协议ID'/);assert.match(result.code,/user\['昵称'\]/);assert.match(result.code,/buildPrompt\('原始指令'\)/);
 assert.deepEqual(parse(result.code).errors,[]);
});
function runtime() {
 let code=fs.readFileSync('src/frontend/i18n/runtime.js','utf8').replace(/^import.*;\n/gm,'').replace(/export /g,'');
 code=code.replace(/import\('virtual:tsukuyomi-interface-(en|ja)'\)/g,(_,lang)=>`Promise.resolve({default:locales.${lang}})`);
 const locales=Object.fromEntries(['en','ja'].map(language=>[language,Object.fromEntries(Object.entries(catalog).map(([source,values])=>[source,values[language]]))]));
 const ctx={ref:value=>({value}),forcedSiteLanguage:()=>'',localStorage:{getItem:()=>null},locales};vm.createContext(ctx);
 vm.runInContext(code+'\nthis.api={uiText,setInterfaceLanguage,translateFeedback,prepareInterfaceLanguage,interfaceLanguage};',ctx);return ctx.api;
}
test('local formatting preserves user parameters, whitespace and unknown feedback',async()=>{
 const api=runtime();assert.equal(api.uiText(' 保存 '),' 保存 ');
 await api.setInterfaceLanguage('en');assert.equal(api.uiText(' 保存 '),' Save ');
 const privateValue='保存 {1} <script>你好</script>';
 assert.equal(api.uiText('模型：{0} 回复：{1}',['my-model',privateValue]),`Model: my-model Reply: ${privateValue}`);
 assert.equal(api.uiText(privateValue),privateValue);assert.equal(api.translateFeedback('unknown provider error'), 'unknown provider error');
 await api.setInterfaceLanguage('ja');assert.equal(api.uiText('保存'),'保存');assert.equal(api.uiText('搜索'),'検索');
 await api.setInterfaceLanguage('zh');assert.equal(api.uiText('搜索'),'搜索');
});
test('core dictionaries have complete keys and matching positional fields',()=>{
 const ctx={};const en=fs.readFileSync('src/frontend/i18n/messages.en.js','utf8').replace('export const en','const en');
 const core=fs.readFileSync('src/frontend/i18n/messages.js','utf8').replace(/^import[^\n]*\n/m,'').replace('export const i18n','const i18n');
 vm.runInNewContext(en+'\n'+core+'\nthis.messages=i18n',ctx);
 for(const language of ['en','ja']) {assert.deepEqual(Object.keys(ctx.messages[language]).sort(),Object.keys(ctx.messages.zh).sort());
  for(const key of Object.keys(ctx.messages.zh)){assert.ok(ctx.messages[language][key],`${language}.${key}`);assert.deepEqual(slots(ctx.messages[language][key]),slots(ctx.messages.zh[key]));}
 }
 assert.match(ctx.messages.ja.ucNewPasswordPh,/8/);assert.match(ctx.messages.ja.ucPasswordTooShort,/8/);
});
test('Wiki navigation imported from editorial data has localized labels without changing IDs',()=>{
 const data=fs.readFileSync('src/frontend/data/cosmicKaguyaWiki.js','utf8').replace(/^import[^\n]*\n/,'').replace(/export /g,'');
 const ctx={findSourceMedia:()=>''};vm.runInNewContext(data+'\nthis.keys=[...tocEntries,...characterGroups,...musicGroups].map(item=>item.label).concat(navigationGroups.map(item=>item.title),infoRows.map(item=>item[0]));',ctx);
 for(const key of ctx.keys)for(const lang of ['en','ja'])assert.ok(catalog[key]?.[lang],`Wiki control: ${lang}: ${key}`);
 for(const file of ['src/frontend/pages/WikiPage.vue','src/frontend/pages/WikiEntryPage.vue'])assert.match(fs.readFileSync(file,'utf8'),/\$ui\(/);
});
