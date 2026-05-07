<script setup>
defineProps({
  live2d: { type: Object, required: true }
});
</script>

<template>
  <section class="room-stage" aria-label="Live2D stage">
    <div class="room-stage-copy">
      <p>Live2D Room</p>
      <h1>&#20843;&#21315;&#20195;&#36745;&#22812;&#23020;&#27491;&#22312;&#25151;&#38388;&#37324;&#31561;&#20320;</h1>
    </div>
    <div id="live2d-container" class="room-live2d-container"></div>
    <div v-if="live2d.error.value" class="room-stage-error">{{ live2d.error.value }}</div>
  </section>
</template>
