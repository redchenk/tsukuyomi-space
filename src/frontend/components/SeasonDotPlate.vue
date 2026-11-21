<script setup>
import { computed } from 'vue';

const props = defineProps({ season: { type: String, required: true } });
// A seven-row alphabet and four hand-drawn marks share the same lattice as the controls.
const letters = {
  A: ['01110','10001','10001','11111','10001','10001','10001'],
  E: ['11111','10000','10000','11110','10000','10000','11111'],
  G: ['01111','10000','10000','10111','10001','10001','01111'],
  I: ['01110','00100','00100','00100','00100','00100','01110'],
  M: ['10001','11011','10101','10101','10001','10001','10001'],
  N: ['10001','11001','11001','10101','10011','10011','10001'],
  P: ['11110','10001','10001','11110','10000','10000','10000'],
  R: ['11110','10001','10001','11110','10100','10010','10001'],
  S: ['01111','10000','10000','01110','00001','00001','11110'],
  T: ['11111','00100','00100','00100','00100','00100','00100'],
  U: ['10001','10001','10001','10001','10001','10001','01110'],
  W: ['10001','10001','10001','10101','10101','11011','10001']
};
const marks = {
  spring: ['.....xx.xx.....','....xxxxxxx....','.....xxxxx.....','.xx...xxx...xx.','xxxx...x...xxxx','.xxxx..x..xxxx.','..xxxx.x.xxxx..','....xxx.xxx....','.....xx.xx.....','...xxx...xxx...','..xxxx.x.xxxx..','..xxx..x..xxx..','.......x.......'],
  summer: ['...............','.........xxx...','.......xxxxx...','......xxx..xx..','.....xxx....x..','....xxx........','...xxx.........','..xxx......xx..','.xxx.....xxxx..','xxx....xxxx....','xx...xxxx....xx','...xxxx....xxx.','.xxxx....xxx...'],
  autumn: ['.......x.......','......xxx......','...x..xxx..x...','...xxxxxxxxx...','.x..xxxxxxx..x.','.xxxxxxxxxxxxx.','..xxxxxxxxxxx..','xxxxxxxxxxxxxxx','..xxxxxxxxxxx..','....xxxxxxx....','...xx..x..xx...','.......x.......','.......x.......'],
  winter: ['.......x.......','....x..x..x....','.....x.x.x.....','..x...xxx...x..','...xx..x..xx...','..x..x.x.x..x..','....xxxxxxx....','..x..x.x.x..x..','...xx..x..xx...','..x...xxx...x..','.....x.x.x.....','....x..x..x....','.......x.......']
};
function makePlate(season, mark) {
  const columns = Array.from({ length: 56 }, (_, x) => ({
    x, path: '', mark: x < 17,
    delay: x * 3 + 'ms', crest: (Math.sin(x * .29) * 9 + Math.cos(x * .53) * 4).toFixed(1) + 'px'
  }));
  function stamp(rows, startX, startY) {
    rows.forEach((row, y) => [...row].forEach((dot, x) => {
      if (dot !== '1' && dot !== 'x') return;
      const column = columns[startX + x];
      const cx = column.x * 5 + 2.5, cy = (startY + y) * 5 + 2.5;
      column.path += 'M' + (cx - 1.65) + ',' + cy + 'a1.65,1.65 0 1,0 3.3,0a1.65,1.65 0 1,0 -3.3,0z';
    }));
  }
  stamp(mark, 1, 2);
  [...season.toUpperCase()].forEach((char, i) => stamp(letters[char], 19 + 6*i, 5));
  return columns.filter(column => column.path);
}
const plates = Object.fromEntries(Object.entries(marks).map(([season, mark]) => [season, makePlate(season, mark)]));
const plate = computed(() => plates[props.season] || plates.spring);
</script>
<template>
  <svg class="season-dot-plate" viewBox="0 0 280 85" aria-hidden="true" focusable="false">
    <defs><pattern id="season-plate-grid" width="5" height="5" patternUnits="userSpaceOnUse">
      <circle cx="2.5" cy="2.5" r=".9" fill="currentColor" />
    </pattern></defs>
    <rect width="280" height="85" fill="url(#season-plate-grid)" opacity=".16" />
    <Transition name="plate-print">
      <g :key="season" class="plate-imprint" :data-season="season">
        <path v-for="col in plate" :key="col.x" :d="col.path" class="plate-column" :class="{ 'plate-mark': col.mark }"
          :style="{ '--lag': col.delay, '--crest': col.crest }" />
      </g>
    </Transition>
  </svg>
</template>
<style scoped>
.season-dot-plate { display: block; width: 100%; height: auto; overflow: visible; }
.plate-column { fill: currentColor; transform-box: view-box; transform-origin: center; }
.plate-mark { fill: var(--plate-accent); }
/* Keep the old ink until the travelling fold reaches its column. The new ink
   opens from exactly the same wave. Only the two participating plates animate. */
@media (prefers-reduced-motion: no-preference) {
  .plate-print-leave-active { animation: plate-lifetime 340ms both; }
  .plate-print-enter-active { animation: plate-lifetime 650ms both; }
  .plate-print-leave-active .plate-column { animation: plate-fold 165ms var(--control-settle) var(--lag) both; }
  .plate-print-enter-active .plate-column { animation: plate-unfold 350ms var(--control-release) calc(110ms + var(--lag)) both; }
}
@keyframes plate-lifetime { from, to { opacity: 1; } }
@keyframes plate-fold {
  from { opacity: 1; transform: translateY(0) scaleY(1); }
  to { opacity: 0; transform: translateY(var(--crest)) scaleY(.08); }
}
@keyframes plate-unfold {
  from { opacity: 0; transform: translateY(var(--crest)) scaleY(.08); }
  20% { opacity: 1; }
  to { opacity: 1; transform: translateY(0) scaleY(1); }
}
</style>
