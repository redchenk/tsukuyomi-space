(function (root) {
  'use strict';
  const MAX_CLONES = 300;
  const MAX_SPEED = 14;
  function attach(vm, { clock = () => Date.now(), defer = (fn) => queueMicrotask(fn), report = () => {} } = {}) {
    const runtime = vm.runtime;
    const stage = runtime.getTargetForStage();
    const variable = (name) => Object.values(stage.variables).find((item) => item.name === name);
    const score = variable('分数'), loop = variable('轮回分数'), restarting = variable('关卡轮换中');
    const resetReady = variable('轮回重置完成'), startReady = variable('轮回启动完成');
    const savedMood = variable('轮回心情'), mood = variable('心情值'), speed = variable('背景速度（我跑步速度');
    if (![score, loop, restarting, resetReady, startReady, savedMood, mood, speed].every(Boolean)) throw new Error('Incompatible Kaguya project');
    let base = 0, previous = 0, phase = 'idle', ownStart = false, disposed = false, epoch = 0;
    let active = Number(startReady.value) === 1;
    let lastReport = -1, reportedAt = -Infinity, cycles = 0;
    const readScore = () => Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(Number(score.value) || 0)));
    const onStart = () => {
      if (ownStart) return;
      epoch += 1; phase = 'idle'; base = 0; previous = 0; active = false;
      startReady.value = 0;
      restarting.value = 0; loop.value = 0;
    };
    const queue = (fn) => {
      const generation = epoch;
      defer(() => { if (!disposed && generation === epoch) fn(); });
    };
    const beginCycle = (value) => {
      phase = 'reset'; base = value; cycles += 1;
      restarting.value = 1; savedMood.value = Number(mood.value);
      resetReady.value = 0; startReady.value = 0; loop.value = 0;
      queue(() => {
        ownStart = true;
        try { vm.greenFlag(); } finally { ownStart = false; }
        // Do not run the menu animation or install additional browser timers per cycle.
        const menu = runtime.targets.find((target) => target.isOriginal && target.getName() === '开始游戏');
        if (menu) { runtime.stopForTarget(menu); menu.setVisible(false); }
      });
    };
    const tick = () => {
      if (disposed) return;
      if (!active) {
        if (Number(startReady.value) !== 1) return;
        active = true;
      }
      const value = readScore();
      if (phase === 'idle') {
        if (value + 100 < previous) base = 0;
        loop.value = Math.max(0, value - base);
        if (Number(mood.value) > 0 && value - base >= 10000) beginCycle(value);
      } else if (phase === 'reset' && Number(resetReady.value) === 1) {
        phase = 'start';
        queue(() => runtime.startHats('event_whenbroadcastreceived', { BROADCAST_OPTION: '游戏开始' }));
      } else if (phase === 'start' && Number(startReady.value) === 1) {
        restarting.value = 0; phase = 'idle'; loop.value = Math.max(0, value - base);
      }
      previous = value;
      if (Number(mood.value) > 0 && phase === 'idle') {
        const desired = value >= 10000 ? Math.min(MAX_SPEED, 8 + Math.log2(1 + (value - 10000) / 2000) * 1.35) : 0;
        const actual = Number(speed.value);
        speed.value = Math.min(MAX_SPEED, Math.max(Number.isFinite(actual) ? actual : 8, desired));
      }
      // Never publish the intermediate reset state or produce a network task for every frame.
      if (phase === 'idle' && value !== lastReport && clock() - reportedAt >= 750) {
        lastReport = value; reportedAt = clock(); report(value);
      }
    };
    runtime.on('PROJECT_START', onStart);
    runtime.on('AFTER_EXECUTE', tick);
    if (vm.setRuntimeOptions) vm.setRuntimeOptions({ maxClones: MAX_CLONES });
    if (vm.setCompilerOptions) vm.setCompilerOptions({ enabled: true, warpTimer: true });
    return {
      inspect: () => ({ phase, cycles, score: readScore(), speed: Number(speed.value), clones: runtime._cloneCounter, threads: runtime.threads.length }),
      dispose() {
        disposed = true; epoch += 1;
        runtime.removeListener('PROJECT_START', onStart); runtime.removeListener('AFTER_EXECUTE', tick);
      }
    };
  }
  function bindPageLifecycle(vm, stability, page = root) {
    const onHide = (event) => {
      // A restored back/forward-cache page must retain its engine hooks and state.
      if (event.persisted) return;
      stability.dispose(); vm.stopAll();
      page.removeEventListener('pagehide', onHide);
    };
    page.addEventListener('pagehide', onHide);
    return () => page.removeEventListener('pagehide', onHide);
  }
  const api = { attach, bindPageLifecycle, MAX_CLONES, MAX_SPEED };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TsukuyomiKaguyaRuntime = api;
})(typeof window !== 'undefined' ? window : globalThis);
