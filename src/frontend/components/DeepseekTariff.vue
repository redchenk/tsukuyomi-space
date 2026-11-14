<script setup>
defineProps({ model: { type: Object, required: true } });
function rate(model, key, count = 1) {
  const value = model.tools_price?.rates?.[key];
  return value ? (Number(value.numerator) / Number(value.denominator) * count / 1e9).toLocaleString('zh-CN', { maximumFractionDigits: 6 }) : '—';
}
</script>
<template>
  <div v-if="model.tools_price" class="deepseek-tariff">
    <p>{{ `搜索与阅读链接 ¥${rate(model, 'search')}/次 · OCR 与文件解析 ¥${rate(model, 'ocr_pages')}/页 · 语音识别 ¥${rate(model, 'asr_seconds', 3600)}/小时（不足 1 秒按 1 秒）。` }}</p>
    <p>{{ `聊天请求预留 ¥${Number(model.reservation_atoms || 0) / 1e9}，工具按服务上限预留，按实际用量结算并释放余款。多步思考按整轮累计计费；超过预留或用量不完整时转入待核对。文档先提取文字，再加入对话，按实际识别页数收费。` }}</p>
  </div>
</template>
<style scoped>.deepseek-tariff { font-size:.8rem; color:var(--ts-muted); line-height:1.7; } p { margin:.4rem 0; }</style>
