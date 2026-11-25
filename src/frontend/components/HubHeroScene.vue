<script setup>
defineProps({ art: String, alt: String, season: String });
</script>

<template>
  <section class="home-hero" :data-art-season="season" aria-labelledby="home-title">
    <img class="home-hero-art" :src="art" :alt="alt" width="1672" height="941" fetchpriority="high">
    <div class="hero-shade" aria-hidden="true"></div>
    <slot />
  </section>
</template>

<style scoped>
.home-hero-art {
  position: absolute;
  inset: 0;
  z-index: -2;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 44%;
  pointer-events: none;
}
@media (max-width: 860px) {
  .home-hero-art { object-position: 60% center; }
}
@media (max-width: 600px) {
  .home-hero-art { object-position: 67% top; }
  [data-art-season="autumn"] .home-hero-art { object-position: 77% top; }
}
</style>
