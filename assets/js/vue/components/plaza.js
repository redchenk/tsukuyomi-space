import { computed, ref } from '/assets/vendor/vue.esm-browser.prod.js';

export const PlazaComposer = {
    props: ['t', 'onSubmit'],
    setup(props) {
        const text = ref('');
        const charCount = computed(() => `${text.value.length} / 300`);
        function insert(prefix) { text.value = `${prefix} ${text.value}`.slice(0, 300); }
        async function submit() {
            const ok = await props.onSubmit(text.value);
            if (ok) text.value = '';
        }
        return { text, charCount, insert, submit };
    },
    template: `
        <div>
            <div class="plaza-composer-top">
                <span>发布一条新的广场留言</span>
                <span class="plaza-char-count">{{ charCount }}</span>
            </div>
            <textarea class="plaza-textarea" v-model="text" maxlength="300" :placeholder="t.composerPlaceholder"></textarea>
            <div class="plaza-moods">
                <button class="chip" type="button" @click="insert('【问候】')">问候</button>
                <button class="chip" type="button" @click="insert('【反馈】')">反馈</button>
                <button class="chip" type="button" @click="insert('【友链】')">友链</button>
                <button class="chip" type="button" @click="insert('【灵感】')">灵感</button>
            </div>
            <div class="plaza-composer-actions">
                <span class="plaza-char-count">{{ t.composerHint }}</span>
                <button class="primary-btn" @click="submit">{{ t.publish }}</button>
            </div>
        </div>
    `
};

export const PlazaReplyForm = {
    props: ['t', 'msgId', 'onSubmit'],
    emits: ['cancel'],
    setup(props, { emit }) {
        const text = ref('');
        async function submit() {
            const ok = await props.onSubmit(props.msgId, text.value);
            if (ok) text.value = '';
        }
        return { text, submit, emit };
    },
    template: `
        <div>
            <textarea class="plaza-textarea plaza-reply-textarea" v-model="text" maxlength="220" :placeholder="t.replyContentRequired"></textarea>
            <div class="plaza-msg-footer">
                <button class="primary-btn" @click="submit">{{ t.publishReply }}</button>
                <button class="ghost-btn" @click="emit('cancel')">{{ t.cancel }}</button>
            </div>
        </div>
    `
};
