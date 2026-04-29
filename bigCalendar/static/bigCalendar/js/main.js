import * as store    from './store.js?v=1.0.8';
import * as api      from './api.js?v=1.0.8';
import { connect as wsConnect }  from './websocket.js?v=1.0.8';
import { connect as sseConnect } from './sse.js?v=1.0.8';
import { ScrollManager }               from './scroll.js?v=1.0.8';
import { render, hitTestEvent }        from './renderer.js?v=1.0.8';
import { init as initDrag, getDragState } from './drag.js?v=1.0.8';
import { startMove, hasActive, getInterp } from './animations.js?v=1.0.8';

const canvas       = document.getElementById('canvas');
const dragCanvas   = document.getElementById('drag-canvas');
const ctx          = canvas.getContext('2d');
const wrapper      = document.getElementById('wrapper');
const vscroll      = document.getElementById('vscroll');
const vscrollInner = document.getElementById('vscroll-inner');
const popup        = document.getElementById('type-popup');

let W = 0, H = 0, rafPending = false;

function scheduleRender() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    render(ctx, W, H, sm, store, getDragState(), getInterp);
    if (hasActive()) scheduleRender();
  });
}

const sm = new ScrollManager(wrapper, vscroll, vscrollInner, scheduleRender);

function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width      = W;
  canvas.height     = H;
  dragCanvas.width  = W;
  dragCanvas.height = H;
  wrapper.style.width  = W + 'px';
  wrapper.style.height = H + 'px';
  sm.resize(W, H);
}

// ── popup ────────────────────────────────────────────────────────────────────

function showPopup(x, y, event) {
  popup.style.left = (x + 8) + 'px';
  popup.style.top  = (y + 8) + 'px';
  popup.classList.add('visible');
  popup._targetEvent = event;
}

function hidePopup() {
  popup.classList.remove('visible');
  popup._targetEvent = null;
}

popup.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn || !popup._targetEvent) return;
  const typeMap = { 'btn-booked': 'booked', 'btn-maintenance': 'maintenance', 'btn-empty': 'empty' };
  const newType = Object.entries(typeMap).find(([cls]) => btn.classList.contains(cls))?.[1];
  if (!newType) return;

  const ev = popup._targetEvent;
  hidePopup();

  try {
    const updated = await api.updateEvent(ev.id, newType);
    store.applyUpdates([updated]);
    scheduleRender();
  } catch {
    // API failed — UI stays unchanged
  }
});

document.addEventListener('mousedown', (e) => {
  if (!popup.contains(e.target)) hidePopup();
});

// ── init ─────────────────────────────────────────────────────────────────────

async function init() {
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 100));

  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 180);
  const end   = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 180);

  const [rooms, events] = await Promise.all([
    api.fetchRooms(),
    api.fetchEvents(start, end),
  ]);

  store.setRooms(rooms);
  store.setEvents(events);
  sm.setNumRooms(rooms.length);
  scheduleRender();

  initDrag(sm, canvas, dragCanvas, scheduleRender, (ev, clientX, clientY) => {
    showPopup(clientX, clientY, ev);
  });

  sm.onGridClick = (e) => {
    const rect = canvas.getBoundingClientRect();
    const ev = hitTestEvent(e.clientX - rect.left, e.clientY - rect.top, sm, store);
    if (ev) showPopup(e.clientX, e.clientY, ev);
    else hidePopup();
  };

  const connect = window.REALTIME_TRANSPORT === 'sse' ? sseConnect : wsConnect;
  connect((msg) => {
    if (msg.type === 'events_changed') {
      const moved = store.applyUpdates(msg.events);
      for (const m of moved) startMove(m.ev, m.fromStart, m.fromEnd, m.fromRoomId);
      scheduleRender();
    }
  });
}

init();
