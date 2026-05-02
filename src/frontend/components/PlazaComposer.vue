<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  onSubmit: { type: Function, required: true },
  t: { type: Object, required: true }
});

const text = ref('');
const charCount = computed(() => `${text.value.length} / 300`);

const moods = [
  { prefix: '\u3010\u95ee\u5019\u3011', label: '\u95ee\u5019' },
  { prefix: '\u3010\u53cd\u9988\u3011', label: '\u53cd\u9988' },
  { prefix: '\u3010\u53cb\u94fe\u3011', label: '\u53cb\u94fe' },
  { prefix: '\u3010\u7075\u611f\u3011', label: '\u7075\u611f' }
];

function insert(prefix) {
  text.value = `${prefix} ${text.value}`.slice(0, 300);
}

async function submit() {
  const ok = await props.onSubmit(text.value);
  if (ok) text.value = '';
}
</script>

<template>
  <div>
    <div class="plaza-composer-top">
      <span>{{ t.publish }}</span>
      <span class="plaza-char-count">{{ charCount }}</span>
    </div>
    <textarea v-model="text" class="plaza-textarea" maxlength="300" :placeholder="t.composerPlaceholder"></textarea>
    <div class="plaza-moods">
      <button v-for="mood in moods" :key="mood.prefix" class="chip" type="button" @click="insert(mood.prefix)">
        {{ mood.label }}
      </button>
    </div>
    <div class="plaza-composer-actions">
      <span class="plaza-char-count">{{ t.composerHint }}</span>
      <button class="primary-btn" type="button" @click="submit">{{ t.publish }}</button>
    </div>
  </div>
</template>
