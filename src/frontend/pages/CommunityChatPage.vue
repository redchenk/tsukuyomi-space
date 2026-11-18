<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import TsIcon from '../components/TsIcon.vue';
import MobileSheet from '../components/MobileSheet.vue';
import shared from '../../../shared/community-chat.cjs';
import { chatCopy } from '../data/communityChatCopy';
import { chatRequest, connectChannel } from '../services/communityChat';
import { applyGrowthResult, loadGrowth } from '../services/userGrowth';
import plazaArt from '../assets/navigation/plaza-gathering.webp';
import portrait from '../assets/sakura/yachiyo-portrait.webp';

const props = defineProps({lang:String,user:Object});
const emit = defineEmits(['go']);
const route = useRoute(), router = useRouter();
const copy = computed(() => chatCopy[props.lang] || chatCopy.zh);
const channel = computed(() => shared.channels.find(c => c.id === route.query.channel) || shared.channels[0]);
const label = c => c[props.lang] || c.zh;
const mention = computed(() => ({zh:'@八千代',en:'@Yachiyo',ja:'@ヤチヨ'}[props.lang] || '@八千代'));
const messages = ref([]), members = ref([]), status = ref('connecting'), older = ref(false), loadingOlder = ref(false);
const draft = ref(''), reply = ref(null), working = ref(false), feedback = ref(''), feed = ref(null), input = ref(null);
const sheet = ref(''), action = ref(null), reports = ref([]), activeToday = ref(0), unread = ref({}), newBelow = ref(false);
const rewarded = ref(false), moderator = computed(() => ['admin','super_admin'].includes(props.user?.role));
const drafts = new Map();
let disconnect, epoch = 0, pending = null;
const speaker = m => m.userId ? m.nickname : copy.value.yachiyo;
const time = value => new Date(value).toLocaleTimeString(props.lang || 'zh', {hour:'2-digit',minute:'2-digit'});
const date = value => new Date(value).toLocaleDateString(props.lang || 'zh',{month:'short',day:'numeric'});
function bottom() { if (feed.value) feed.value.scrollTop = feed.value.scrollHeight; newBelow.value=false; }
function nearBottom() { const e=feed.value; return !e || e.scrollHeight-e.scrollTop-e.clientHeight < 85; }
function upsert(message) {
  const index = messages.value.findIndex(m => m.id === message.id);
  if (index >= 0) messages.value[index] = message;
  else messages.value.push(message);
  if (message.removed) {
    for (const m of messages.value) if (m.replyTo === message.id) m.quote=null;
    if (reply.value?.id === message.id) reply.value=null;
  }
  return index < 0;
}
function handle(packet) {
  if (packet.type === 'snapshot') {
    messages.value=packet.messages; older.value=packet.hasOlder; nextTick(bottom);
  } else if (packet.type === 'presence') members.value=packet.members;
  else if (packet.type === 'activity') unread.value[packet.channel]=true;
  else if (packet.type === 'message') {
    const follow = nearBottom();
    if (upsert(packet.message)) {
      if (follow) nextTick(bottom); else newBelow.value=true;
    }
  }
}
watch([() => channel.value.id, () => props.user?.id],([id,userId], previous) => {
  const version = ++epoch;
  if (previous?.[0] && previous[1] === userId) drafts.set(previous[0], {text:draft.value,reply:reply.value,pending});
  else drafts.clear();
  disconnect?.();
  const saved = drafts.get(id);
  draft.value=saved?.text || ''; reply.value=saved?.reply || null; pending=saved?.pending || null;
  messages.value=[]; members.value=[]; older.value=false; unread.value[id]=false; status.value='connecting';
  sheet.value=''; action.value=null; newBelow.value=false; working.value=false; loadingOlder.value=false; feedback.value='';
  disconnect=connectChannel(id,p => { if (version===epoch) handle(p); },s => { if (version===epoch) status.value=s; });
  rewarded.value=false;
  if (userId) loadGrowth().then(s => { if (version===epoch) rewarded.value=!!s?.today.tasks.find(t => t.key==='daily_chatroom')?.completed; }).catch(() => {});
},{immediate:true});
onBeforeUnmount(() => { epoch++; disconnect?.(); });
function select(c) { router.replace({path:'/chatroom',query:{channel:c.id}}); }
function login() { emit('go','/login?redirect='+encodeURIComponent(route.fullPath)); }
function callYachiyo() {
  if (!props.user) return login();
  if (!shared.mentionsYachiyo(draft.value)) draft.value = mention.value + ' ' + draft.value;
  nextTick(() => input.value?.focus());
}
async function earlier() {
  if (loadingOlder.value || !messages.value.length) return;
  const version=epoch, scroll=feed.value, height=scroll.scrollHeight, top=scroll.scrollTop;
  loadingOlder.value=true;
  try {
    const data=await chatRequest(channel.value.id+'/history?before='+messages.value[0].id);
    if (version!==epoch) return;
    const seen=new Set(messages.value.map(m=>m.id));
    messages.value.unshift(...data.messages.filter(m=>!seen.has(m.id))); older.value=data.hasOlder;
    await nextTick(); scroll.scrollTop=top+scroll.scrollHeight-height;
  } catch (e) { if (version===epoch) feedback.value=e.message; }
  finally { if (version===epoch) loadingOlder.value=false; }
}
async function send() {
  if (!props.user) return login();
  const content=draft.value.trim(), replyTo=reply.value?.id || null;
  if (working.value || !content) return;
  const version=epoch, id=channel.value.id, user=props.user.id;
  if (!pending || pending.content !== content || pending.replyTo !== replyTo) {
    const bytes=crypto.getRandomValues(new Uint8Array(16));
    const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    pending={content,replyTo,requestId:[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-')};
  }
  const submission=pending;
  working.value=true; feedback.value='';
  try {
    const result=await chatRequest(id+'/messages','POST',submission);
    if (props.user?.id !== user) return;
    if (result.growth) applyGrowthResult(result.growth);
    if (version!==epoch) { if (drafts.get(id)?.pending === submission) drafts.delete(id); return; }
    if (!messages.value.some(m=>m.id===result.message.id)) upsert(result.message);
    draft.value=''; reply.value=null; pending=null;
    if (result.growth?.award.awarded) { rewarded.value=true; feedback.value=copy.value.earned+' +'+result.growth.award.xp+' XP'; }
    await nextTick(); bottom();
  } catch (e) { if (version===epoch) feedback.value=e.message; }
  finally { if (version===epoch) working.value=false; }
}
function keydown(e) {
  if (e.key==='Enter' && !e.shiftKey && !e.isComposing && e.keyCode!==229 && !matchMedia('(pointer:coarse)').matches) {
    e.preventDefault(); send();
  }
}
function chooseReply(m) {
  action.value=null; sheet.value='';
  reply.value=m; if (props.user) nextTick(()=>input.value?.focus()); else login();
}
function showActions(m) { action.value=m; sheet.value='actions'; }
async function moderate() {
  sheet.value='manage';
  try { const data=await chatRequest('reports'); reports.value=data.items; activeToday.value=data.activeToday; }
  catch(e) {feedback.value=e.message;}
}
async function command(m, name) {
  try {
    const suffix={report:'/report',dismiss:'/report',mute:'/mute',remove:''}[name];
    const response=await chatRequest('messages/'+m.id+suffix,['remove','dismiss'].includes(name)?'DELETE':'POST');
    if (name==='remove' && response.channel===channel.value.id) upsert(response);
    if (name==='report') feedback.value=copy.value.reported;
    if (name==='mute') feedback.value=copy.value.muted;
    if (sheet.value==='manage') await moderate(); else sheet.value='';
  } catch(e) { sheet.value=''; feedback.value=e.message; }
}
</script>

<template>
  <main class="page moon-chat">
    <div class="mc-layout">
      <aside class="mc-sidebar">
        <div class="mc-cover"><img :src="plazaArt" alt=""><div><TsIcon name="moonStar" :size="25"/><h1>{{ copy.title }}</h1></div></div>
        <h2 class="mc-label">{{ copy.channels }}</h2>
        <nav class="mc-channels" :aria-label="copy.channels">
          <button v-for="c in shared.channels" :key="c.id" type="button" :class="{selected:c.id===channel.id}" :aria-current="c.id===channel.id?'page':undefined" @click="select(c)">
            <TsIcon :name="c.icon" :size="19"/><span>{{ label(c) }}</span><i v-if="unread[c.id]" class="mc-unread" :aria-label="copy.jump"></i>
          </button>
        </nav>
        <a href="/growth" class="mc-xp" @click.prevent="emit('go',user?'/growth':'/login?redirect=%2Fgrowth')">
          <TsIcon :name="rewarded?'check':'sparkles'" :size="20"/><span><strong>{{ copy.growth }}</strong><small>{{ rewarded?copy.awarded:copy.xp+' +'+shared.dailyXp+' XP' }}</small></span><TsIcon name="chevronRight" :size="15"/>
        </a>
      </aside>
      <section class="mc-main" :aria-label="label(channel)">
        <header class="mc-heading">
          <div class="mc-channel-mark"><TsIcon :name="channel.icon" :size="26"/></div>
          <div><h2><span>#</span> {{ label(channel) }}</h2><p>{{ copy.topics[channel.id] }}</p></div>
          <button type="button" class="mc-presence-trigger" @click="sheet='members'"><TsIcon name="users" :size="17"/>{{ members.length }}</button>
        </header>
        <div ref="feed" class="mc-feed" role="log" :aria-label="label(channel)" aria-live="polite" @scroll="nearBottom() && (newBelow=false)">
          <button v-if="older" class="mc-older" type="button" :disabled="loadingOlder" @click="earlier">{{ copy.older }}</button>
          <div v-if="!messages.length" class="mc-empty"><span><TsIcon :name="channel.icon" :size="32"/></span><h3>{{ status==='live'?copy.first:copy[status] }}</h3><p>{{ status==='live'?copy.invite:label(channel) }}</p></div>
          <template v-for="(m,index) in messages" :key="m.id">
            <div v-if="!index || date(messages[index-1].createdAt)!==date(m.createdAt)" class="mc-day"><span>{{ date(m.createdAt) }}</span></div>
            <article class="mc-message" :class="{'mc-bot':!m.userId}" :data-id="m.id">
              <span class="mc-avatar"><img v-if="!m.userId||m.avatar" :src="m.userId?m.avatar:portrait" alt="" loading="lazy"><template v-else>{{ [...(speaker(m)||'?')][0] }}</template></span>
              <div class="mc-message-body"><header><strong>{{ speaker(m) }}</strong><small class="mc-badge">{{ m.userId?'Lv.'+m.level:'AI' }}</small><time :datetime="new Date(m.createdAt).toISOString()">{{ time(m.createdAt) }}</time></header>
                <blockquote v-if="m.replyTo && !m.removed">↳ {{ m.quote || copy.removed }}</blockquote>
                <p :class="{quiet:m.removed}">{{ m.removed?copy.removed:m.content }}</p>
                <small v-if="m.aiStatus==='pending'||m.aiStatus==='failed'" class="mc-ai-status">{{ m.aiStatus==='pending'?copy.waiting:copy.failed }}</small>
              </div>
              <button v-if="!m.removed && user" type="button" class="mc-more" :aria-label="copy.actions" @click="showActions(m)"><TsIcon name="ellipsis" :size="17"/></button>
            </article>
          </template>
        </div>
        <button v-if="newBelow" type="button" class="mc-new" @click="bottom">{{ copy.jump }} ↓</button>
        <div class="mc-compose-wrap">
          <p v-if="feedback" class="mc-feedback" role="status">{{ feedback }}</p>
          <form v-if="user" class="mc-compose" @submit.prevent="send">
            <div v-if="reply" class="mc-quote">{{ copy.reply }} · {{ speaker(reply) }} <button type="button" @click="reply=null">{{ copy.cancel }}</button></div>
            <textarea ref="input" v-model="draft" rows="2" maxlength="4000" :disabled="working" :aria-label="copy.placeholder+' #'+label(channel)" :placeholder="copy.placeholder+' #'+label(channel)+'…'" @keydown="keydown"></textarea>
            <div class="mc-compose-tools"><button type="button" class="mc-mention" @click="callYachiyo">{{ mention }} <small>{{ copy.free }}</small></button>
              <button type="submit" class="mc-send" :disabled="working||!draft.trim()"><TsIcon name="send" :size="16"/>{{ copy.send }}</button></div>
          </form>
          <div v-else class="mc-guest"><p>{{ copy.guest }}</p><button type="button" class="mc-send" @click="login">{{ copy.login }} <TsIcon name="arrowRight" :size="15"/></button></div>
        </div>
      </section>
      <aside class="mc-right">
        <div class="mc-assistant-art"><img :src="portrait" alt=""><span>AI · {{ copy.free }}</span></div>
        <div class="mc-assistant-copy"><h2>{{ copy.yachiyo }}</h2><p>{{ copy.aiHint }}</p>
          <button type="button" @click="callYachiyo"><TsIcon name="sparkles" :size="16"/>{{ copy.ask }}</button></div>
        <div class="mc-members"><h2 class="mc-label">{{ copy.online }} <span>{{ members.length }}</span></h2>
          <p v-if="!members.length">{{ copy.noMembers }}</p>
          <div v-for="member in members" :key="member.id" class="mc-member"><i></i>{{ member.name }}</div>
        </div>
        <span class="mc-connection"><i :class="{on:status==='live'}"></i>{{ copy[status] }}</span>
      </aside>
    </div>
    <button v-if="moderator" type="button" class="mc-admin" @click="moderate"><TsIcon name="shield" :size="16"/>{{ copy.manage }}</button>
    <MobileSheet :open="!!sheet" :title="sheet==='members'?copy.online:sheet==='manage'?copy.manage:copy.actions" :close-label="copy.close" @close="sheet=''">
      <div class="mc-sheet">
        <template v-if="sheet==='members'"><p>{{ copy[status] }} · {{ members.length }} {{ copy.here }}</p><div v-for="member in members" :key="member.id" class="mc-member"><i></i>{{ member.name }}</div></template>
        <template v-if="sheet==='actions'&&action"><p>{{ speaker(action) }} · {{ action.content.slice(0,96) }}</p>
          <button @click="chooseReply(action)">{{ copy.reply }}</button><button v-if="action.userId===user?.id||moderator" @click="command(action,'remove')">{{ copy.withdraw }}</button><button v-if="action.userId!==user?.id" @click="command(action,'report')">{{ copy.report }}</button></template>
        <template v-if="sheet==='manage'"><p>{{ copy.active }} · {{ activeToday }}</p><p v-if="!reports.length">{{ copy.noReports }}</p><div v-for="m in reports" :key="m.id"><strong>{{ speaker(m) }} · {{ m.reports }}</strong><p>{{ m.content }}</p>
          <button @click="command(m,'dismiss')">{{ copy.dismiss }}</button><button @click="command(m,'remove')">{{ copy.withdraw }}</button><button v-if="m.userId" @click="command(m,'mute')">{{ copy.mute }}</button></div></template>
      </div>
    </MobileSheet>
  </main>
</template>
