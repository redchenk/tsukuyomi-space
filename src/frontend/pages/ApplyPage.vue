<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue';
import { authFetch, parseResponse } from '../api/client';
import TsIcon from '../components/TsIcon.vue';
import appIcon from '../../../assets/icons/icon-512.png';
import policy from '../../../shared/play-testing.json';
const props = defineProps({ lang: { type: String, default: 'zh' } });
const tr = (zh, en) => props.lang === 'zh' ? zh : en;
const form = reactive({ email: '', device: '', androidVersion: '', eligible: false, consent: false, website: '' });
const config = ref(null), loading = ref(true), busy = ref(false), error = ref(''), received = ref(false), receipt = ref(null);
let disposed = false;
const feedback = computed(() => `mailto:${policy.contact}?subject=${encodeURIComponent(tr('月读空间 Google Play 测试反馈', 'Tsukuyomi Space Google Play test feedback'))}`);
async function load() {
  loading.value = true; error.value = '';
  try {
    const response = await authFetch('/api/play-testing', { cache: 'no-store' });
    const result = await parseResponse(response);
    if (!response.ok || !result.success) throw new Error(result.message || tr('报名信息读取失败，请重试。', 'Could not load registration. Please retry.'));
    if (!disposed) config.value = result.data;
  } catch (cause) { if (!disposed) error.value = cause.message; }
  finally { if (!disposed) loading.value = false; }
}
async function submit() {
  if (busy.value || !config.value?.registrationOpen || !form.consent || !form.eligible) return;
  busy.value = true; error.value = '';
  try {
    const response = await authFetch('/api/play-testing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, consentVersion: config.value.consentVersion }) });
    const result = await parseResponse(response);
    if (!response.ok || !result.success) throw new Error(result.message || tr('提交失败，请重试。', 'Could not submit. Please retry.'));
    if (!disposed) { received.value = true; await nextTick(); receipt.value?.focus(); }
  } catch (cause) { if (!disposed) error.value = cause.message; }
  finally { if (!disposed) busy.value = false; }
}
const steps = computed(() => [
  [tr('确认 Google 账号', 'Check your Google account'), tr('打开手机上的 Google Play，点击右上角头像，确认当前邮箱。请用这个邮箱报名；Google 账号不一定是 Gmail 邮箱。', 'Open Google Play on your Android device, tap your profile picture and check the email. Apply with this account; it does not have to be a Gmail address.')],
  [tr('填写申请，等待邀请', 'Apply and wait for an invitation'), tr('提交本页表单后，站长会整理名单。测试版本和名单就绪后，加入链接与使用说明会发到报名邮箱，请留意垃圾邮件。此时还没有开始计算 14 天。', 'Submit the form on this page. Once the release and tester list are ready, the administrator will email your joining link and setup instructions. Check spam too. The 14-day period has not started at this step.')],
  [tr('打开邀请，成为测试者', 'Open the invitation and opt in'), tr('用报名时的同一个 Google 账号打开邀请链接，点击“成为测试者 / Become a tester”。页面显示你已成为测试者后，才算加入封闭测试。若之前加入了内部测试，需要先退出内部测试，再加入此次封闭测试。', 'Open the invitation while signed in to the same Google account and choose “Become a tester”. You have joined only once Google confirms it. If you previously joined internal testing, leave that track before joining this closed test.')],
  [tr('从 Google Play 安装', 'Install through Google Play'), tr('在加入成功页面点击 Google Play 下载入口，确认商店右上角还是同一个账号，再安装或更新月读空间。安装后按应用内引导设置；聊天服务尚未配置时，可以先测试页面、阅读和 Live2D。', 'Follow the Google Play download link on the confirmation page, check the account again, then install or update Tsukuyomi Space. Follow the in-app setup guide. You can test navigation, reading and Live2D before configuring a chat service.')],
  [tr('实际体验，持续参与 14 天', 'Use the app and stay opted in for 14 days'), tr('从成功加入封闭测试起，连续保持测试资格至少 14 天，期间在不同日期实际体验并反馈。没有固定每日打卡或好评任务。可以随时退出；退出再加入后，连续参与时间需要重新累计。', 'Remain opted in continuously for at least 14 days from joining. Use the app on different days and share real feedback. There is no fixed daily check-in or positive-review task. You may leave at any time; leaving and rejoining restarts the continuous period.')]
]);
const faqs = computed(() => [
  [tr('报名后没有收到邀请？', 'No invitation yet?'), tr('提交表单只是登记申请。站长需要把邮箱加入测试名单，并确认版本可用；名单和链接的更改也可能需要数小时生效。请先检查邮箱拼写和垃圾邮件，再联系下方邮箱。', 'The form registers your application. Your email still needs to be added to the tester list and the release made available. Google changes can take several hours. Check your email spelling and spam folder, then contact us below.')],
  [tr('提示“不符合资格”或找不到应用？', 'Not eligible or app not found?'), tr('先核对浏览器和 Play 商店是否都登录报名邮箱。封闭测试通常不能直接搜索到，请从邀请链接进入；仍无法加入时，将页面提示、设备型号和所在国家/地区告知站长。不要提交密码、验证码或 API 密钥。', 'Check that the browser and Play Store both use your registered email. Enter through the invitation instead of searching. If it still fails, send the error, device model and country/region. Never send passwords, verification codes or API keys.')],
  [tr('已经安装官网 APK，可以参加吗？', 'Already installed the website APK?'), tr('可以申请，但仍需通过 Google Play 链接成为测试者并从商店安装测试版本。仅安装 APK 不计入封闭测试。如果提示签名或安装冲突，先备份本地数据并联系站长，不要贸然卸载。', 'You can apply, but must still opt in through the Google Play link and install the test version from the store. Sideloading alone does not count. If there is a signing or installation conflict, back up local data and contact us before uninstalling.')],
  [tr('聊天没有回复，或需要配置模型？', 'Chat needs configuration or does not reply?'), tr('按应用内首次使用引导配置你选择的聊天服务；服务是否收费以提供方为准。遇到配置问题也可以反馈，不必为参加测试购买服务。先测试能使用的功能即可，不要在反馈里附上密钥。', 'Follow the in-app guide to configure your chosen chat service. Provider charges may apply, but you do not need to buy a service to participate. Report setup problems and test the features available to you; never include keys in feedback.')],
  [tr('怎么修改邮箱或删除申请？', 'How do I correct or delete my application?'), tr(`请用报名邮箱联系 ${policy.contact}，说明需要修改或删除。站长核验后处理。网站申请资料与 Google Play 的测试资格分别管理，删除申请不会自动退出 Google Play 测试。`, `Contact ${policy.contact} from your registered email to request a correction or deletion. The administrator will verify and handle it. Website records and Google Play membership are separate; deleting your application does not opt you out of Google Play.`)]
]);
onMounted(load); onUnmounted(() => { disposed = true; });
</script>

<template>
  <main class="page apply-page">
    <div class="apply-container">
      <section class="apply-hero" aria-labelledby="apply-title">
        <div class="apply-intro">
          <p class="apply-eyebrow">TSUKUYOMI SPACE · GOOGLE PLAY</p>
          <div class="apply-identity"><img :src="appIcon" alt="" width="56" height="56"><span>{{ tr('月读空间 · Android 封闭测试', 'Tsukuyomi Space · Android closed test') }}</span></div>
          <h1 id="apply-title">{{ tr('一起打磨\n八千代的日常对话', 'Help shape everyday\nconversations with Yachiyo') }}</h1>
          <p class="apply-lead">{{ tr('从一句问候，到接得上前文的聊天。邀请你在自己的安卓手机上体验，把真实的感受告诉我们。', 'From a first hello to a conversation that stays connected. Try the app on your Android device and tell us how it feels.') }}</p>
          <ul class="apply-points"><li><TsIcon name="smartphone" :size="18" />{{ tr('可使用 Google Play 的安卓设备', 'An Android device with Google Play') }}</li><li><TsIcon name="check" :size="18" />{{ tr('连续加入至少 14 天，实际体验', 'Stay opted in for 14 days and test the app') }}</li><li><TsIcon name="mail" :size="18" />{{ tr('真实反馈，不要求好评', 'Honest feedback, no positive-review requirement') }}</li></ul>
          <a class="apply-text-link" href="#guide">{{ tr('先看加入教程', 'Read the joining guide') }} <span aria-hidden="true">↓</span></a>
        </div>
        <section id="application" class="apply-card" aria-labelledby="form-title">
          <template v-if="received">
            <div ref="receipt" class="apply-receipt" tabindex="-1" role="status"><span class="apply-badge">{{ tr('申请已收到 · 等待邀请', 'Application received · Awaiting invitation') }}</span><h2 id="form-title">{{ tr('谢谢，接下来留意邮箱', 'Thank you. Watch your inbox.') }}</h2><p class="apply-email">{{ form.email.trim() }}</p><p>{{ tr('名单和测试版本就绪后，我们会通过邮箱发送加入链接和使用说明。同一邮箱重复申请会沿用已有记录。', 'We will email the joining link and setup guide once the tester list and release are ready. Repeat applications keep the existing record.') }}</p><p class="apply-note">{{ tr('申请成功还不等于成为 Google Play 测试者，也没有开始计算 14 天。请收到邀请后继续完成下方步骤。', 'Applying does not make you a Google Play tester or start the 14-day period. Follow the steps below when your invitation arrives.') }}</p><a href="#guide" class="apply-button">{{ tr('查看接下来的步骤', 'See the next steps') }}</a></div>
          </template>
          <template v-else>
            <p class="apply-eyebrow">01 / {{ tr('先登记，再加入测试', 'APPLY, THEN JOIN') }}</p><h2 id="form-title">{{ tr('申请参与测试', 'Apply to test') }}</h2><p class="apply-card-intro">{{ tr('无需注册本站账号。请留下 Google Play 使用的邮箱。', 'No website account needed. Use the email signed in to Google Play.') }}</p>
            <p v-if="loading" role="status">{{ tr('正在读取报名信息…', 'Loading registration…') }}</p>
            <p v-else-if="config && !config.registrationOpen" class="apply-note" role="status">{{ tr('本轮报名暂时关闭。你仍可查看下方教程，稍后再来。', 'Registration is currently paused. You can still read the guide below.') }}</p>
            <form v-if="config?.registrationOpen" @submit.prevent="submit">
              <fieldset :disabled="busy"><label for="play-email">{{ tr('Google 账号邮箱', 'Google account email') }} <span>{{ tr('必填', 'Required') }}</span></label><input id="play-email" v-model="form.email" type="email" maxlength="254" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" placeholder="you@gmail.com" required aria-describedby="play-email-hint"><p id="play-email-hint" class="apply-hint">{{ tr('在 Google Play 右上角头像处确认；非 Gmail 的 Google 账号也可以。', 'Check it under your Google Play profile. Non-Gmail Google accounts work too.') }}</p>
              <div class="apply-fields"><div><label for="play-device">{{ tr('设备型号', 'Device model') }} <span>{{ tr('选填', 'Optional') }}</span></label><input id="play-device" v-model="form.device" maxlength="80" :placeholder="tr('例如 Redmi K90', 'e.g. Pixel 9')"></div><div><label for="play-android">{{ tr('Android 版本', 'Android version') }} <span>{{ tr('选填', 'Optional') }}</span></label><input id="play-android" v-model="form.androidVersion" maxlength="30" placeholder="Android 16"></div></div>
              <div class="apply-trap" aria-hidden="true"><label>Website<input v-model="form.website" tabindex="-1" autocomplete="off"></label></div>
              <label class="apply-check"><input v-model="form.eligible" type="checkbox" required><span>{{ tr('我有可使用 Google Play 的安卓设备，愿意连续加入至少 14 天并实际体验。', 'I have an Android device with Google Play and intend to stay opted in for at least 14 days and test the app.') }}</span></label>
              <label class="apply-check"><input v-model="form.consent" type="checkbox" required><span>{{ tr('我同意将邮箱及选填的设备信息用于本次测试招募、邀请和反馈联络，并已阅读', 'I agree to use my email and optional device details for this test, invitations and feedback, and have read the') }} <a href="#data-use">{{ tr('资料使用说明', 'data-use notice') }}</a>{{ tr('与', ' and ') }}<RouterLink to="/privacy">{{ tr('隐私政策', 'Privacy Policy') }}</RouterLink>{{ tr('。', '.') }}</span></label>
              <button class="apply-button" type="submit" :disabled="busy || !form.eligible || !form.consent">{{ busy ? tr('正在提交…', 'Submitting…') : tr('提交测试申请', 'Submit application') }}<TsIcon name="chevronRight" :size="18" /></button></fieldset>
            </form>
          </template>
          <p v-if="error" class="apply-error" role="alert">{{ error }}</p><button v-if="!loading && !config" class="apply-button" @click="load">{{ tr('重新加载', 'Retry') }}</button>
          <p class="apply-fine">{{ tr('不需要提供 Google 密码、验证码或 API 密钥。', 'Never provide your Google password, verification codes or API keys.') }}</p>
        </section>
      </section>
      <nav class="apply-jump" :aria-label="tr('本页导航', 'On this page')"><a href="#application">{{ tr('申请报名', 'Apply') }}</a><a href="#guide">{{ tr('加入教程', 'Joining guide') }}</a><a href="#testing">{{ tr('测什么', 'What to test') }}</a><a href="#faq">{{ tr('常见问题', 'Help') }}</a></nav>
      <section id="guide" class="apply-section" aria-labelledby="guide-title"><p class="apply-eyebrow">THE NEXT STEPS</p><h2 id="guide-title">{{ tr('从报名，到真正加入测试', 'From applying to joining the test') }}</h2><p class="apply-section-intro">{{ tr('请按顺序完成。报名、成为测试者、安装应用，是三个不同的步骤。', 'Follow these steps in order. Applying, opting in and installing are separate steps.') }}</p><ol class="apply-steps"><li v-for="(step, i) in steps" :key="i"><span class="apply-step-number">0{{ i + 1 }}</span><div><h3>{{ step[0] }}</h3><p>{{ step[1] }}</p><a v-if="i === 2 && config?.joinUrl" class="apply-text-link" :href="config.joinUrl" target="_blank" rel="noopener noreferrer">{{ tr('已收到邀请？打开 Google Play 加入页', 'Invited? Open the Google Play opt-in page') }} ↗</a></div></li></ol><p class="apply-note">{{ tr('Google 对适用的新个人开发者账号要求：至少 12 位测试者连续加入封闭测试 14 天后，开发者才能申请正式发布资格；达到人数和天数不代表自动获批。', 'For affected new personal developer accounts, Google requires at least 12 testers opted in continuously for 14 days before the developer can apply for production access. Meeting the minimum does not guarantee approval.') }} <a :href="policy.requirementsUrl" target="_blank" rel="noopener noreferrer">{{ tr('官方要求', 'Official requirements') }} ↗</a></p></section>
      <section id="testing" class="apply-section" aria-labelledby="testing-title"><p class="apply-eyebrow">YOUR EXPERIENCE MATTERS</p><h2 id="testing-title">{{ tr('不需要专业测试经验', 'No testing experience required') }}</h2><div class="apply-test-grid"><article><span>01</span><h3>{{ tr('像不像八千代', 'Does it feel like Yachiyo?') }}</h3><p>{{ tr('聊聊音乐、创作和小愿望，试试夸奖、打趣或认真交流。告诉我们哪里像她，哪里显得刻意。', 'Talk about music, creativity and little wishes. Try praise, banter or a serious conversation. Tell us what feels in character or forced.') }}</p></article><article><span>02</span><h3>{{ tr('能不能接住前文', 'Does the conversation connect?') }}</h3><p>{{ tr('连续聊几轮，再更正一个细节或换个话题。看看是否记错、反复追问，或编造没发生的共同经历。', 'Chat for several turns, correct a detail or change the subject. Watch for forgotten details, repeated questions or invented shared memories.') }}</p></article><article><span>03</span><h3>{{ tr('手机上好不好用', 'Does it work on your phone?') }}</h3><p>{{ tr('试试安装、登录、页面阅读和 Live2D。卡顿、闪退、按钮不好点或看不懂的提示，都值得反馈。', 'Try installation, sign-in, reading and Live2D. Report lag, crashes, difficult buttons or confusing instructions.') }}</p></article></div><div class="apply-feedback"><div><h3>{{ tr('一句具体的反馈，就很有帮助', 'One specific observation helps') }}</h3><p>{{ tr('建议附上：手机型号、Android 版本、应用版本、操作步骤、实际发生了什么。截图可选，请遮住个人信息。', 'Include your device, Android and app versions, steps and what happened. Screenshots are optional; hide personal information.') }}</p></div><a class="apply-button" :href="feedback">{{ tr('邮件反馈', 'Email feedback') }} ↗</a></div></section>
      <section id="faq" class="apply-section" aria-labelledby="faq-title"><h2 id="faq-title">{{ tr('遇到问题时', 'If you get stuck') }}</h2><details v-for="faq in faqs" :key="faq[0]"><summary>{{ faq[0] }}</summary><p>{{ faq[1] }}</p></details></section>
      <footer id="data-use" class="apply-data"><h2>{{ tr('你的申请资料', 'Your application data') }}</h2><p>{{ tr('我们保存报名邮箱、选填的设备信息、同意说明的版本、申请时间和邀请处理状态，用于本次测试名单、邀请及反馈联络。邮箱会由站长加入 Google Play Console 测试名单，由 Google 按其规则处理。资料不公开展示，仅超级管理员可查看或导出。', 'We store your email, optional device details, consent version, submission time and invitation status for this test. The administrator will add your email to the Google Play Console tester list, where Google processes it under its policies. These details are private and available only to the super administrator.') }}</p><p>{{ tr('如需查阅、更正或删除，请用报名邮箱联系', 'To access, correct or delete your application, contact us from your registered email at') }} <a :href="feedback">{{ policy.contact }}</a>。<RouterLink to="/privacy">{{ tr('完整隐私政策', 'Full Privacy Policy') }}</RouterLink> · <a :href="policy.joiningGuideUrl" target="_blank" rel="noopener noreferrer">{{ tr('Google 官方加入说明', 'Google testing guide') }}</a></p></footer>
    </div>
  </main>
</template>
