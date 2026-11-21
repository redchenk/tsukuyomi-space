<script setup>
defineProps({ dark: Boolean });
</script>

<template>
  <span class="theme-lens" :class="{ 'is-night': dark }" aria-hidden="true"><i /></span>
</template>

<style scoped>
.theme-lens {
  position: relative; display: inline-block; flex: none; overflow: hidden;
  inline-size: 2rem; block-size: 1.17rem; border-radius: var(--r-pill);
  background-color: var(--lens-sky);
  background-image:
    radial-gradient(ellipse 80% 90% at 85% 120%, var(--lens-hill) 65%, transparent 69%),
    radial-gradient(ellipse 75% 80% at 15% 130%, var(--lens-far) 68%, transparent 72%);
  border: 1px solid var(--lens-border);
  box-shadow: inset 0 1px 2px var(--control-shade);
}
.theme-lens i {
  position: absolute; left: .12rem; top: 50%; width: .78rem; height: .78rem;
  border-radius: var(--r-pill); transform: translate(0, -50%);
  background: var(--lens-orb); box-shadow: 0 0 0 1px var(--lens-border), 0 1px 2px var(--control-shade);
  transition: transform 320ms var(--control-release);
}
.theme-lens.is-night i { transform: translate(.83rem, -50%); }
.theme-lens.is-night::before {
  content: ''; position: absolute; height: 2px; width: 2px; top: 24%; left: 26%;
  background: var(--lens-star); border-radius: var(--r-pill); box-shadow: .32rem .16rem 0 var(--lens-star);
}
@media (prefers-reduced-motion: reduce) { .theme-lens i { transition: none; } }
@media (forced-colors: active) { .theme-lens i { background: ButtonText; } }
</style>
