<script setup>
import { computed, ref } from 'vue';
import TsIcon from './TsIcon.vue';
const props = defineProps({ music: { type: Object, required: true }, lang: { type: String, default: 'zh' } });
const tr = (zh, en, ja = zh) => props.lang === 'en' ? en : props.lang === 'ja' ? ja : zh;
const tab = ref(props.music.source.value);
const cloud = computed(() => props.music.cloud);
const state = computed(() => cloud.value.library);
const qrLabel = computed(() => ({ waiting: tr('打开网易云 App 扫码登录', 'Scan with the NetEase app', 'NetEase アプリでスキャン'), scanned: tr('已扫码，请在网易云 App 中确认', 'Scanned. Confirm in the NetEase app', 'アプリでログインを確認してください'), expired: tr('二维码已过期，请刷新', 'QR code expired. Refresh to continue', 'QR コードの期限切れ。更新してください') }[state.value.qrStatus] || tr('打开网易云 App 扫码登录', 'Scan with the NetEase app')));
function local() { tab.value = 'local'; props.music.useLocal(); }
</script>

<template>
  <div class="site-music-library">
    <div class="music-source-tabs" role="group" aria-label="音乐来源">
      <button type="button" :aria-pressed="tab === 'local'" @click="local"><TsIcon name="music" :size="14" />{{ tr('网站曲目', 'Site tracks', 'サイトの曲') }}</button>
      <button type="button" :aria-pressed="tab === 'netease'" @click="tab = 'netease'"><TsIcon name="audioLines" :size="14" />{{ tr('网易云', 'NetEase', 'NetEase') }}</button>
    </div>
    <div v-if="tab === 'local'" class="music-local-library">
      <p>{{ tr('未连接账号时，继续听月读空间的固定曲目。', 'Enjoy the site collection without an account.', 'ログインせずにサイトの曲を楽しめます。') }}</p>
      <button v-if="music.source.value !== 'local'" type="button" @click="music.useLocal">{{ tr('切回网站曲目', 'Use site tracks', 'サイトの曲に切り替え') }}</button>
      <select v-else :value="music.trackIndex.value" :aria-label="tr('网站曲目', 'Site tracks', 'サイトの曲')" @change="music.loadTrack(Number($event.target.value), { play: true })">
        <option v-for="(track, index) in music.tracks" :key="track.file || track.id" :value="index">{{ index + 1 }} · {{ track.title }}</option>
      </select>
    </div>
    <div v-else class="music-cloud-library" :aria-busy="state.busy">
      <p v-if="!state.enabled" class="music-library-note">{{ tr('网易云暂未启用，可以继续听网站曲目。', 'NetEase is unavailable. Site tracks are ready.', 'NetEase は現在利用できません。サイトの曲をお楽しみください。') }}</p>
      <template v-else-if="!state.profile">
        <div class="music-login-intro"><strong>{{ tr('把喜欢的歌带到月读空间', 'Bring your favorite music here', 'お気に入りの曲をここへ') }}</strong><p>{{ tr('使用网易云 App 扫码。账号仅用于听歌，可随时退出。', 'Scan with the NetEase app. Your account is used for listening only; disconnect anytime.', 'NetEase アプリでスキャン。視聴専用です。いつでも接続を解除できます。') }}</p></div>
        <div v-if="state.qrImage" class="music-login-qr">
          <img :src="state.qrImage" width="176" height="176" alt="网易云音乐登录二维码" :class="{ 'is-expired': state.qrStatus === 'expired' }">
          <p role="status">{{ qrLabel }}</p>
          <button type="button" :disabled="state.busy" @click="cloud.login">{{ tr('刷新二维码', 'Refresh QR', 'QR を更新') }}</button>
          <button type="button" :disabled="state.busy" @click="cloud.logout">{{ tr('取消登录', 'Cancel login', 'ログインを中止') }}</button>
        </div>
        <button v-else type="button" class="music-library-primary" :disabled="state.busy" @click="cloud.login">
          <TsIcon name="music" :size="16" />{{ state.busy ? tr('正在生成二维码…', 'Creating QR…', 'QR を作成中…') : tr('扫码登录网易云', 'Sign in with QR', 'QR でログイン') }}
        </button>
      </template>
      <template v-else>
        <div class="music-cloud-account">
          <img v-if="state.profile.avatar" :src="state.profile.avatar" width="28" height="28" alt="" referrerpolicy="no-referrer">
          <span><small>{{ tr('已连接网易云', 'Connected to NetEase', 'NetEase に接続中') }}</small><strong>{{ state.profile.nickname }}</strong></span>
          <button type="button" :disabled="state.busy" @click="cloud.logout">{{ tr('退出', 'Disconnect', '接続を解除') }}</button>
        </div>
        <form class="music-search" role="search" @submit.prevent="cloud.browse('search')">
          <input v-model="state.query" type="search" name="music-query" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="100" :placeholder="tr('搜索歌名或歌手', 'Song or artist', '曲名またはアーティスト')" :aria-label="tr('搜索网易云音乐', 'Search NetEase music', 'NetEase の音楽を検索')">
          <button type="submit" :disabled="state.busy || !state.query.trim()" :aria-label="tr('搜索音乐', 'Search music', '音楽を検索')"><TsIcon name="search" :size="16" /></button>
        </form>
        <div class="music-library-heading">
          <strong>{{ state.view === 'playlist' ? state.playlist?.title : state.view === 'playlists' ? tr('我的歌单', 'My playlists', 'マイプレイリスト') : tr('搜索结果', 'Search results', '検索結果') }}</strong>
          <button type="button" :disabled="state.busy" @click="cloud.browse('playlists')">{{ tr('我的歌单', 'My playlists', 'マイプレイリスト') }}</button>
        </div>
        <p v-if="state.busy" class="music-library-note" role="status">{{ tr('正在加载…', 'Loading…', '読み込み中…') }}</p>
        <div v-else-if="state.view === 'playlists'" class="music-result-list">
          <button v-for="playlist in state.playlists" :key="playlist.id" type="button" class="music-result" @click="cloud.browse('playlist', 0, playlist)">
            <img v-if="playlist.cover" :src="playlist.cover" width="34" height="34" alt="" loading="lazy" referrerpolicy="no-referrer">
            <TsIcon v-else name="list" :size="20" />
            <span><strong>{{ playlist.title }}</strong><small>{{ playlist.count }} {{ tr('首', 'tracks', '曲') }}</small></span><TsIcon name="chevronRight" :size="15" />
          </button>
          <p v-if="!state.playlists.length" class="music-library-note">{{ tr('暂无歌单，也可以搜索喜欢的歌。', 'No playlists yet. Search for a song instead.', 'プレイリストがありません。好きな曲を検索できます。') }}</p>
        </div>
        <div v-else class="music-result-list">
          <button v-for="track in state.results" :key="track.id" type="button" class="music-result" :class="{ 'is-current': music.source.value === 'netease' && music.currentTrack.value?.id === track.id }" :disabled="music.loading.value" :aria-label="`${tr('播放', 'Play', '再生')} ${track.title}`" @click="cloud.play(track)">
            <img v-if="track.cover" :src="track.cover" width="34" height="34" alt="" loading="lazy" referrerpolicy="no-referrer">
            <TsIcon v-else name="music" :size="20" />
            <span><strong>{{ track.title }}</strong><small>{{ track.artist || track.album }}</small></span><TsIcon name="play" :size="15" />
          </button>
          <p v-if="!state.results.length" class="music-library-note">{{ tr('输入歌名或歌手，找到想听的音乐。', 'Find music by song title or artist.', '曲名やアーティストで音楽を検索。') }}</p>
        </div>
        <div v-if="state.more || state.offset" class="music-library-pagination">
          <button type="button" :disabled="state.busy || !state.offset" @click="cloud.browse(state.view, Math.max(0, state.offset - 20), state.playlist)">{{ tr('上一页', 'Previous', '前へ') }}</button>
          <span>{{ Math.floor(state.offset / 20) + 1 }}</span>
          <button type="button" :disabled="state.busy || !state.more" @click="cloud.browse(state.view, state.offset + 20, state.playlist)">{{ tr('下一页', 'Next', '次へ') }}</button>
        </div>
        <p class="music-library-note">{{ tr('播放遵循网易云账号的版权、会员与地区权限。', 'Playback follows your NetEase membership, copyright and regional availability.', 'NetEase の会員資格・著作権・地域制限に従って再生します。') }}</p>
      </template>
      <p v-if="state.error" class="music-library-error" role="status">{{ state.error }}</p>
    </div>
  </div>
</template>
