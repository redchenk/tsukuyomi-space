import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';

const panelDefaults = {
  chatPanel: { top: '12.3rem', right: '1.2rem' },
  profilePanel: { top: '6.4rem', left: 'max(6.2rem, calc(clamp(1rem, 3vw, 2rem) + 5rem))' },
  notePanel: { top: '18.2rem', left: 'max(6.2rem, calc(clamp(1rem, 3vw, 2rem) + 5rem))' }
};

export const roomPanelButtons = [
  { id: 'chatPanel', label: '\u804a\u5929' },
  { id: 'profilePanel', label: '\u8d44\u6599' },
  { id: 'notePanel', label: '\u4fbf\u7b7e' }
];

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value == null ? fallback : value;
  } catch (_) {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function useRoomPanels() {
  const activePanels = reactive({
    chatPanel: true,
    profilePanel: false,
    notePanel: false
  });
  const panelPositions = reactive(readJson('roomPanelPositions', {}));
  const panelZ = reactive({});
  const topZ = ref(30);
  const draggingPanel = ref(null);

  function panelStyle(panelId) {
    return {
      ...panelDefaults[panelId],
      ...(panelPositions[panelId] || {}),
      zIndex: panelZ[panelId] || undefined
    };
  }

  function persistPanelPositions() {
    writeJson('roomPanelPositions', { ...panelPositions });
  }

  function bringPanelForward(panelId) {
    panelZ[panelId] = ++topZ.value;
  }

  function togglePanel(panelId) {
    activePanels[panelId] = !activePanels[panelId];
    if (activePanels[panelId]) bringPanelForward(panelId);
  }

  function closePanel(panelId) {
    activePanels[panelId] = false;
  }

  function startPanelDrag(panelId, event) {
    if (event.target?.closest?.('button, input, textarea, select, a')) return;
    if (window.matchMedia('(max-width: 760px)').matches) return;
    const panel = document.getElementById(panelId);
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    draggingPanel.value = {
      id: panelId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    bringPanelForward(panelId);
    panel.classList.add('dragging');
    event.preventDefault();
    event.currentTarget?.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    if (!draggingPanel.value) return;
    const panel = document.getElementById(draggingPanel.value.id);
    if (!panel) return;
    const x = Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, event.clientX - draggingPanel.value.offsetX));
    const y = Math.max(8, Math.min(window.innerHeight - panel.offsetHeight - 8, event.clientY - draggingPanel.value.offsetY));
    panelPositions[draggingPanel.value.id] = { top: `${y}px`, left: `${x}px`, right: 'auto' };
  }

  function onPointerUp(event) {
    if (!draggingPanel.value) return;
    event?.preventDefault?.();
    document.getElementById(draggingPanel.value.id)?.classList.remove('dragging');
    persistPanelPositions();
    draggingPanel.value = null;
  }

  onMounted(() => {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
  });

  return {
    activePanels,
    panelButtons: roomPanelButtons,
    panelStyle,
    bringPanelForward,
    togglePanel,
    closePanel,
    startPanelDrag,
    onPointerMove,
    onPointerUp
  };
}
