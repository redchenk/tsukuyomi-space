<script setup>
import { onMounted, onUnmounted, reactive, ref } from 'vue';

const emit = defineEmits(['go']);

const gameRoot = ref(null);
const state = reactive({
  hero: 'kaguya',
  started: false,
  missing: false,
  redFans: 0,
  blueFans: 0,
  viewers: 12800,
  time: '3:00',
  result: ''
});

let game = null;
let hudTimer = 0;

const heroes = [
  { id: 'kaguya', name: '辉夜 Kaguya', desc: '远程月光术式，适合控场与持续输出。' },
  { id: 'iroha', name: '彩叶 Iroha', desc: '高速突进刺客，依靠标记与爆发收割。' }
];

function loadPhaser() {
  if (window.Phaser) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/lib/phaser.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function destroyGame() {
  window.clearInterval(hudTimer);
  hudTimer = 0;
  if (game) {
    game.destroy(true);
    game = null;
  }
}

function createScene() {
  const Phaser = window.Phaser;
  return class ArenaScene extends Phaser.Scene {
    constructor() {
      super('ArenaScene');
      this.keys = null;
      this.player = null;
      this.enemies = [];
      this.projectiles = null;
      this.elapsed = 0;
    }

    create() {
      const width = this.scale.width;
      const height = this.scale.height;
      this.add.rectangle(width / 2, height / 2, width, height, 0x0b1220);
      for (let i = 0; i < 7; i += 1) {
        const y = 90 + i * 88;
        this.add.line(0, 0, 80, y, width - 80, y + (i % 2 ? 34 : -34), 0x24405e, 0.55).setOrigin(0).setLineWidth(2);
      }
      this.add.rectangle(86, height / 2, 70, height - 130, 0x3b1531, 0.72).setStrokeStyle(2, 0xff6b9d, 0.65);
      this.add.rectangle(width - 86, height / 2, 70, height - 130, 0x123246, 0.72).setStrokeStyle(2, 0x63d5ff, 0.65);

      this.player = this.add.circle(180, height / 2, 18, 0xf7d774);
      this.physics.add.existing(this.player);
      this.player.body.setCollideWorldBounds(true);
      this.player.hp = 100;
      this.player.cooldown = 0;
      this.add.text(144, height / 2 - 48, state.hero === 'iroha' ? 'Iroha' : 'Kaguya', { color: '#f7d774', fontSize: '14px' });

      this.enemies = [0, 1, 2].map((index) => {
        const enemy = this.add.circle(width - 210, 210 + index * 130, 17, 0x63d5ff);
        this.physics.add.existing(enemy);
        enemy.hp = 80;
        enemy.seed = index + 1;
        return enemy;
      });

      this.projectiles = this.physics.add.group();
      this.physics.add.overlap(this.projectiles, this.enemies, (bolt, enemy) => {
        bolt.destroy();
        enemy.hp -= state.hero === 'iroha' ? 38 : 30;
        state.redFans += 28;
        state.viewers += 420;
        if (enemy.hp <= 0) {
          enemy.hp = 80;
          enemy.setPosition(width - 190, 150 + Phaser.Math.Between(0, height - 300));
          state.redFans += 85;
        }
      });

      this.keys = this.input.keyboard.addKeys('W,A,S,D,Q,E,R,SPACE');
      this.input.on('pointerdown', (pointer) => this.fire(pointer.worldX, pointer.worldY));
      this.cameras.main.flash(260, 247, 215, 116);
    }

    fire(x, y) {
      if (this.player.cooldown > 0) return;
      const Phaser = window.Phaser;
      const bolt = this.add.circle(this.player.x, this.player.y, 7, state.hero === 'iroha' ? 0xff6b9d : 0xf7d774);
      this.physics.add.existing(bolt);
      this.projectiles.add(bolt);
      bolt.body.setCircle(7);
      bolt.body.setAllowGravity(false);
      this.physics.velocityFromRotation(Phaser.Math.Angle.Between(this.player.x, this.player.y, x, y), 520, bolt.body.velocity);
      this.player.cooldown = state.hero === 'iroha' ? 0.22 : 0.34;
    }

    update(_, delta) {
      const dt = delta / 1000;
      const speed = state.hero === 'iroha' ? 290 : 240;
      this.elapsed += dt;
      this.player.cooldown = Math.max(0, this.player.cooldown - dt);
      this.player.body.setVelocity(0);
      if (this.keys.W.isDown) this.player.body.velocity.y = -speed;
      if (this.keys.S.isDown) this.player.body.velocity.y = speed;
      if (this.keys.A.isDown) this.player.body.velocity.x = -speed;
      if (this.keys.D.isDown) this.player.body.velocity.x = speed;
      this.player.body.velocity.normalize().scale(speed);

      this.enemies.forEach((enemy) => {
        const offset = Math.sin(this.elapsed * (0.7 + enemy.seed * 0.2)) * 70;
        enemy.body.setVelocity(Math.cos(this.elapsed + enemy.seed) * 40, offset * 0.18);
        if (window.Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y) < 38) {
          state.blueFans += 0.35;
        }
      });

      if (this.keys.SPACE.isDown || this.keys.Q.isDown) {
        const target = this.enemies[0];
        this.fire(target.x, target.y);
      }
    }
  };
}

async function startGame() {
  state.started = true;
  state.result = '';
  state.redFans = 0;
  state.blueFans = 0;
  state.viewers = 12800;
  destroyGame();
  try {
    await loadPhaser();
  } catch (_) {
    state.missing = true;
    return;
  }

  const Phaser = window.Phaser;
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: gameRoot.value,
    width: 1120,
    height: 680,
    backgroundColor: '#0b1220',
    physics: { default: 'arcade', arcade: { debug: false } },
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [createScene()]
  });

  let seconds = 180;
  hudTimer = window.setInterval(() => {
    seconds -= 1;
    state.blueFans += 4;
    const minute = Math.floor(seconds / 60);
    const second = String(Math.max(0, seconds % 60)).padStart(2, '0');
    state.time = `${minute}:${second}`;
    if (state.redFans >= 1000 || state.blueFans >= 1000 || seconds <= 0) {
      state.result = state.redFans >= state.blueFans ? '红队胜利' : '蓝队胜利';
      window.clearInterval(hudTimer);
      hudTimer = 0;
    }
  }, 1000);
}

onMounted(() => {
  startGame();
});

onUnmounted(destroyGame);
</script>

<template>
  <main class="page arena-page">
    <section class="arena-shell">
      <header class="arena-top">
        <div>
          <span class="arena-kicker">KASSEN ARENA</span>
          <h1>月读竞技场</h1>
        </div>
        <div class="arena-actions">
          <button class="ghost-btn" type="button" @click="$emit('go', '/hub')">大厅</button>
          <button class="primary-btn" type="button" @click="startGame">重开</button>
        </div>
      </header>

      <section class="arena-layout">
        <aside class="arena-side">
          <div class="arena-panel">
            <strong>角色选择</strong>
            <button v-for="hero in heroes" :key="hero.id" class="arena-hero" :class="{ active: state.hero === hero.id }" type="button" @click="state.hero = hero.id; startGame()">
              <span>{{ hero.name }}</span>
              <small>{{ hero.desc }}</small>
            </button>
          </div>

          <div class="arena-panel arena-score">
            <div><span>红队粉丝</span><b>{{ Math.floor(state.redFans) }}/1000</b></div>
            <div><span>蓝队粉丝</span><b>{{ Math.floor(state.blueFans) }}/1000</b></div>
            <div><span>在线观众</span><b>{{ Math.floor(state.viewers).toLocaleString('zh-CN') }}</b></div>
            <div><span>倒计时</span><b>{{ state.time }}</b></div>
          </div>
        </aside>

        <section class="arena-stage">
          <div ref="gameRoot" class="arena-game"></div>
          <div v-if="state.missing" class="arena-overlay">Phaser 资源未加载，请检查 /lib/phaser.min.js。</div>
          <div v-if="state.result" class="arena-overlay result">
            <strong>{{ state.result }}</strong>
            <button class="primary-btn" type="button" @click="startGame">再来一局</button>
          </div>
        </section>
      </section>
    </section>
  </main>
</template>
