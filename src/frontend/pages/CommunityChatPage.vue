<script setup>
import { dismissMenu } from '../runtime/menuMotion';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import TsIcon from '../components/TsIcon.vue';
import MobileSheet from '../components/MobileSheet.vue';
import shared from '../../../shared/community-chat.cjs';
import { chatCopy } from '../data/communityChatCopy';
import { chatRequest, connectChannel } from '../services/communityChat';
import { applyGrowthResult, loadGrowth } from '../services/userGrowth';
import { useMediaQuery } from '../composables/useMediaQuery';
import { useModalDialog } from '../composables/useModalDialog';
import brandLogo from '../assets/sakura/sakura-moon-logo.webp';
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
const compact = useMediaQuery('(max-width: 760px)');
const membersOpen = computed(() => sheet.value === 'members');
const drawer = useModalDialog(() => compact.value && ['channels', 'members'].includes(sheet.value));
watch(compact, () => { sheet.value = ''; });
watch([draft, input], () => {
  if (!input.value) return;
  input.value.style.height = 'auto';
  input.value.style.height = input.value.scrollHeight + 'px';
}, { flush: 'post' });

function closeChannelMenu() { dismissMenu(drawer.value, () => { sheet.value = ''; }); }
function closeOnBackdrop(event) {
  if (event.target !== drawer.value) return;
  const bounds = drawer.value.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom) closeChannelMenu();
}

const drafts = new Map();
let disconnect, epoch = 0, pending = null, hasSnapshot = false;
const speaker = m => m.userId ? m.nickname : copy.value.yachiyo;
const time = value => new Date(value).toLocaleTimeString(props.lang || 'zh', {hour:'2-digit',minute:'2-digit'});
const date = value => new Date(value).toLocaleDateString(props.lang || 'zh',{month:'short',day:'numeric'});
function bottom() { if (feed.value) feed.value.scrollTop = feed.value.scrollHeight; newBelow.value=false; }
function nearBottom() { const e=feed.value; return !e || e.scrollHeight-e.scrollTop-e.clientHeight < 85; }
function upsert(message) {
  const index = messages.value.findIndex(m => m.id === message.id);
  if (index >= 0) messages.value[index] = message;
  else if (!messages.value.length || messages.value.at(-1).id < message.id) messages.value.push(message);
  else messages.value.splice(messages.value.findIndex(m => m.id > message.id), 0, message);
  if (message.removed) {
    for (const m of messages.value) if (m.replyTo === message.id) m.quote=null;
    if (reply.value?.id === message.id) reply.value=null;
  }
  return index < 0;
}
function handle(packet) {
  if (packet.type === 'snapshot') {
    const firstId = packet.messages[0]?.id;
    if (!hasSnapshot || (packet.hasOlder && messages.value.at(-1)?.id < firstId)) {
      const lastId = packet.messages.at(-1)?.id || 0;
      // A POST can finish while the initial GET is still in flight.
      messages.value = packet.messages.concat(messages.value.filter(m => m.id > lastId));
      older.value = packet.hasOlder;
      hasSnapshot = true;
      nextTick(bottom);
    } else {
      // A stream can take over after HTTP has rendered. Keep older pages and
      // the reader's scroll position while reconciling the overlapping window.
      const follow = nearBottom();
      let added = false;
      for (const message of packet.messages) {
        if (upsert(message)) added = true;
      }
      if (added && follow) nextTick(bottom);
      else if (added) newBelow.value = true;
    }
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
  hasSnapshot = false;
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
function select(c) {
  sheet.value = '';
  router.replace({path:'/chatroom',query:{channel:c.id}});
}
function login() { emit('go','/login?redirect='+encodeURIComponent(route.fullPath)); }
function callYachiyo() {
  if (compact.value) sheet.value = '';
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
  <main data-ui-layout="workspace" class="moon-chat">
    <dialog data-menu-surface ref="drawer" class="mc-drawer" :class="{ 'mc-drawer-right': membersOpen }"
      :aria-label="membersOpen ? copy.online : copy.channels"
      @cancel.prevent="closeChannelMenu" @click="closeOnBackdrop"></dialog>

    <Teleport v-if="!compact || (drawer && sheet === 'channels')" :to="drawer" :disabled="!compact">
      <aside class="mc-sidebar">
        <header class="mc-server">
          <img class="mc-server-art" :src="plazaArt" alt="">
          <a class="mc-hub" href="/hub" :title="copy.hub" :aria-label="copy.hub"><img :src="brandLogo" alt="" width="34" height="34"></a>
          <h1>{{ copy.title }}</h1>
          <button data-ui="icon" v-if="compact" type="button" class="mc-icon" data-modal-close :aria-label="copy.close" @click="closeChannelMenu"><TsIcon name="x"/></button>
        </header>
        <nav class="mc-channels" :aria-label="copy.channels">
          <h2 class="mc-label">{{ copy.channels }}</h2>
          <button data-ui-part="row" v-for="c in shared.channels" :key="c.id" type="button" :aria-current="c.id === channel.id ? 'page' : undefined" @click="select(c)">
            <span class="mc-hash" aria-hidden="true">#</span><span>{{ label(c) }}</span>
            <i v-if="unread[c.id]" class="mc-unread" :aria-label="copy.jump"></i>
          </button>
        </nav>
        <div class="mc-sidebar-bottom">
          <div class="mc-connection"><i :class="{on:status==='live'}"></i>{{ copy[status] }}</div>
          <div class="mc-xp">
            <span class="mc-xp-icon"><TsIcon :name="rewarded?'check':'sparkles'" :size="18"/></span>
            <span><strong>{{ copy.growth }}</strong><small>{{ rewarded ? copy.awarded : copy.xp+' +'+shared.dailyXp+' XP' }}</small></span>
            <button data-ui="icon" v-if="moderator" type="button" class="mc-icon" :title="copy.manage" :aria-label="copy.manage" @click="moderate"><TsIcon name="shield" :size="19"/></button>
          </div>
        </div>
      </aside>
    </Teleport>

    <section class="mc-main" :aria-label="label(channel)">
      <header class="mc-heading">
        <a v-if="compact" class="mc-hub" href="/hub" :title="copy.hub" :aria-label="copy.hub"><img :src="brandLogo" alt="" width="32" height="32"></a>
        <h2>
          <button data-ui-part="disclosure" v-if="compact" type="button" class="mc-picker" :aria-label="copy.choose+' · '+label(channel)" aria-haspopup="dialog" :aria-expanded="sheet==='channels'" @click="sheet='channels'">
            <span class="mc-hash" aria-hidden="true">#</span>{{ label(channel) }}<TsIcon name="chevronDown" :size="15"/>
          </button>
          <template v-else><span class="mc-hash" aria-hidden="true">#</span>{{ label(channel) }}</template>
        </h2>
        <p v-if="!compact" class="mc-topic">{{ copy.topics[channel.id] }}</p>
        <button data-ui="quiet" class="mc-icon mc-presence-trigger" type="button" :title="copy.online" :aria-label="copy.online" :aria-expanded="membersOpen" @click="sheet=membersOpen?'':'members'">
          <TsIcon name="users" :size="20"/><span>{{ members.length }}</span>
        </button>
      </header>

      <div ref="feed" class="mc-feed" role="log" :aria-label="label(channel)" aria-live="polite" @scroll="nearBottom() && (newBelow=false)">
        <div class="mc-timeline">
          <button data-ui="secondary" v-if="older" class="mc-older" type="button" :disabled="loadingOlder" @click="earlier">{{ copy.older }}</button>
          <div v-else-if="!messages.length" class="mc-intro">
            <span class="mc-intro-mark"><TsIcon :name="channel.icon" :size="29"/></span>
            <h3>{{ status === 'live' ? copy.first : copy[status] }}</h3>
            <p>{{ status === 'live' ? copy.invite : label(channel) }}</p>
          </div>
          <template v-for="(m,index) in messages" :key="m.id">
            <div v-if="!index || date(messages[index-1].createdAt)!==date(m.createdAt)" class="mc-day"><span>{{ date(m.createdAt) }}</span></div>
            <article class="mc-message" :class="{'mc-bot':!m.userId}" :data-id="m.id">
              <span class="mc-avatar"><img v-if="!m.userId||m.avatar" :src="m.userId?m.avatar:portrait" alt="" loading="lazy"><template v-else>{{ [...(speaker(m)||'?')][0] }}</template></span>
              <div class="mc-message-body">
                <header><strong>{{ speaker(m) }}</strong><small class="mc-badge">{{ m.userId?'Lv.'+m.level:'AI' }}</small><time :datetime="new Date(m.createdAt).toISOString()">{{ time(m.createdAt) }}</time></header>
                <blockquote v-if="m.replyTo && !m.removed">↳ {{ m.quote || copy.removed }}</blockquote>
                <p :class="{quiet:m.removed}">{{ m.removed?copy.removed:m.content }}</p>
                <small v-if="m.aiStatus==='pending'||m.aiStatus==='failed'" class="mc-ai-status">{{ m.aiStatus==='pending'?copy.waiting:copy.failed }}</small>
              </div>
              <button data-ui="icon" v-if="!m.removed && user" type="button" class="mc-icon mc-more" :aria-label="copy.actions" @click="showActions(m)"><TsIcon name="ellipsis" :size="18"/></button>
            </article>
          </template>
        </div>
      </div>

      <div class="mc-compose-wrap">
        <button data-ui="secondary" v-if="newBelow" type="button" class="mc-new" @click="bottom">{{ copy.jump }} ↓</button>
        <p v-if="feedback" class="mc-feedback" role="status">{{ feedback }}</p>
        <form v-if="user" class="mc-compose" @submit.prevent="send">
          <div v-if="reply" class="mc-quote">{{ copy.reply }} · {{ speaker(reply) }} <button data-ui="secondary" type="button" :aria-label="copy.cancel" @click="reply=null"><TsIcon name="x" :size="16"/></button></div>
          <div class="mc-input-row">
            <button data-ui-part="tool" type="button" class="mc-mention" :title="mention+' · '+copy.free" :aria-label="mention+' · '+copy.free" @click="callYachiyo">
              <img :src="portrait" alt="" width="26" height="26"><span>{{ mention }}</span><small>{{ copy.free }}</small>
            </button>
            <textarea ref="input" v-model="draft" rows="1" maxlength="4000" :disabled="working" :aria-label="copy.placeholder+' #'+label(channel)" :placeholder="copy.placeholder+' #'+label(channel)+'…'" @keydown="keydown"></textarea>
            <button data-ui="icon" type="submit" class="mc-icon mc-send" :title="copy.send" :aria-label="copy.send" :disabled="working||!draft.trim()"><TsIcon name="send" :size="20"/></button>
          </div>
        </form>
        <div v-else class="mc-guest"><p>{{ copy.guest }}</p><button data-ui="secondary" type="button" @click="login">{{ copy.login }} <TsIcon name="arrowRight" :size="16"/></button></div>
      </div>
    </section>

    <Teleport v-if="!compact || drawer" :to="drawer" :disabled="!compact">
      <MenuTransition :enabled="!compact"><aside v-if="membersOpen" class="mc-roster">
        <header><h2>{{ copy.online }} <small>{{ members.length }}</small></h2>
          <button data-ui="icon" class="mc-icon" type="button" data-modal-close :aria-label="copy.close" @click="closeChannelMenu"><TsIcon name="x" :size="18"/></button></header>
        <div class="mc-roster-scroll">
          <button data-ui-part="tool" type="button" class="mc-assistant" :title="copy.ask" @click="callYachiyo">
            <img :src="portrait" alt="" width="36" height="36"><span><strong>{{ copy.yachiyo }}</strong><small>{{ copy.ai }} · {{ copy.free }}</small></span><TsIcon name="sparkles" :size="16"/>
          </button>
          <h3 class="mc-label">{{ members.length }} {{ copy.here }}</h3>
          <p v-if="!members.length">{{ copy.noMembers }}</p>
          <div v-for="member in members" :key="member.id" class="mc-member"><i></i>{{ member.name }}</div>
        </div>
      </aside></MenuTransition>
    </Teleport>
    <MobileSheet :open="sheet==='manage' || sheet==='actions'" :title="sheet==='manage'?copy.manage:copy.actions" :close-label="copy.close" @close="sheet=''">
      <div class="mc-sheet">
        <template v-if="sheet==='actions'&&action"><p>{{ speaker(action) }} · {{ action.content.slice(0,96) }}</p>
          <button data-ui="secondary" @click="chooseReply(action)">{{ copy.reply }}</button><button data-ui="secondary" v-if="action.userId===user?.id||moderator" @click="command(action,'remove')">{{ copy.withdraw }}</button><button data-ui="secondary" v-if="action.userId!==user?.id" @click="command(action,'report')">{{ copy.report }}</button></template>
        <template v-if="sheet==='manage'"><p>{{ copy.active }} · {{ activeToday }}</p><p v-if="!reports.length">{{ copy.noReports }}</p><div v-for="m in reports" :key="m.id"><strong>{{ speaker(m) }} · {{ m.reports }}</strong><p>{{ m.content }}</p>
          <button data-ui="secondary" @click="command(m,'dismiss')">{{ copy.dismiss }}</button><button data-ui="secondary" @click="command(m,'remove')">{{ copy.withdraw }}</button><button data-ui="secondary" v-if="m.userId" @click="command(m,'mute')">{{ copy.mute }}</button></div></template>
      </div>
    </MobileSheet>
  </main>
</template>
