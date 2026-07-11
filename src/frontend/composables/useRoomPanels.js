import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';

const panelDefaults = {
  chatPanel: { top: '12.3rem', right: '1.2rem' },
  profilePanel: { top: '6.4rem', left: 'max(6.2rem, calc(clamp(1rem, 3vw, 2rem) + 5rem))' },
  notePanel: { top: '18.2rem', left: 'max(6.2rem, calc(clamp(1rem, 3vw, 2rem) + 5rem))' }
};

export const roomPanelButtons = [
  { id: 'chatPanel', label: '\u804a\u5929', icon: 'message' },
  { id: 'profilePanel', label: '\u8d44\u6599', icon: 'badge' },
  { id: 'notePanel', label: '\u4fbf\u7b7e', icon: 'note' }
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
  let draggingPanel = null;
  let dragFrameId = 0;
  let pendingDragPoint = null;

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
    draggingPanel = {
      id: panelId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      startLeft: rect.left,
      startTop: rect.top,
      width: rect.width,
      height: rect.height,
      x: rect.left,
      y: rect.top,
      panel
    };
    bringPanelForward(panelId);
    panel.classList.add('dragging');
    panel.style.willChange = 'transform';
    event.preventDefault();
    event.currentTarget?.setPointerCapture?.(event.pointerId);
  }

  function applyPanelDrag() {
    dragFrameId = 0;
    const drag = draggingPanel;
    const point = pendingDragPoint;
    pendingDragPoint = null;
    if (!drag || !point || !drag.panel?.isConnected) return;
    drag.x = Math.max(8, Math.min(window.innerWidth - drag.width - 8, point.clientX - drag.offsetX));
    drag.y = Math.max(8, Math.min(window.innerHeight - drag.height - 8, point.clientY - drag.offsetY));
    drag.panel.style.transform = `translate3d(${(drag.x - drag.startLeft).toFixed(2)}px, ${(drag.y - drag.startTop).toFixed(2)}px, 0)`;
  }

  function onPointerMove(event) {
    if (!draggingPanel) return;
    pendingDragPoint = { clientX: event.clientX, clientY: event.clientY };
    if (!dragFrameId) dragFrameId = window.requestAnimationFrame(applyPanelDrag);
  }

  function onPointerUp(event) {
    if (!draggingPanel) return;
    event?.preventDefault?.();
    if (dragFrameId) {
      window.cancelAnimationFrame(dragFrameId);
      dragFrameId = 0;
    }
    if (pendingDragPoint) applyPanelDrag();
    const drag = draggingPanel;
    drag.panel?.classList.remove('dragging');
    if (drag.panel) {
      drag.panel.style.transform = '';
      drag.panel.style.willChange = '';
    }
    panelPositions[drag.id] = { top: `${drag.y}px`, left: `${drag.x}px`, right: 'auto' };
    persistPanelPositions();
    draggingPanel = null;
    pendingDragPoint = null;
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
    if (dragFrameId) window.cancelAnimationFrame(dragFrameId);
    if (draggingPanel?.panel) {
      draggingPanel.panel.style.transform = '';
      draggingPanel.panel.style.willChange = '';
    }
    dragFrameId = 0;
    pendingDragPoint = null;
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
