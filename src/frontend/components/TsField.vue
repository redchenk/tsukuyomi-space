<script setup>
import { useId } from 'vue';
defineOptions({ inheritAttrs: false });
const props = defineProps({ label: { type: String, required: true }, hint: String, error: String, id: String });
const value = defineModel({ type: String });
const generated = useId();
</script>

<template>
  <div class="ui-field-group">
    <label :for="props.id || generated">{{ label }}</label>
    <input v-bind="$attrs" class="ui-field" :id="props.id || generated" v-model="value"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="[hint && (props.id || generated) + '-hint', error && (props.id || generated) + '-error', $attrs['aria-describedby']].filter(Boolean).join(' ') || undefined">
    <small v-if="hint" :id="(props.id || generated) + '-hint'" class="form-hint">{{ hint }}</small>
    <small v-if="error" :id="(props.id || generated) + '-error'" class="ts-field-error" role="alert">{{ error }}</small>
  </div>
</template>
