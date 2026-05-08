import * as store    from './core/store.js';
import { TOOLBAR_H, INITIAL_LOAD_DAYS, CHUNK_DAYS, PREFETCH_THRESHOLD, EVICT_RANGE_DAYS } from './core/config.js';
import * as api      from './net/api.js';
import { connect as wsConnect }  from './net/websocket.js';
import { connect as sseConnect } from './net/sse.js';
import { ScrollManager }               from './ui/scroll.js';
import { render, hitTestEvent }        from './ui/renderer.js';
import { init as initDrag, getDragState, cancelDragIfConflict, isOwnMove } from './ui/drag.js';
import { startMove, hasActive, getInterp } from './ui/animations.js';

const canvas       = document.getElementById('canvas');
const dragCanvas   = document.getElementById('drag-canvas');
const ctx          = canvas.getContext('2d');
const wrapper      = document.getElementById('wrapper');
const vscroll      = document.getElementById('vscroll');
const vscrollInner = document.getElementById('vscroll-inner');
const popup        = document.getElementById('type-popup');

let W = 0, H = 0, rafPending = false;

function scheduleRender() {
  if (rafPending) {return;}
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    render(ctx, W, H, sm, store, getDragState(), getInterp);
    if (hasActive()) {scheduleRender();}
  });
}

const sm = new ScrollManager(wrapper, vscroll, vscrollInner, () => { scheduleRender(); maybePrefetch(); });

function resize() {
  W = window.innerWidth;
  H = window.innerHeight - TOOLBAR_H;
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

const _conflictToast = document.getElementById('conflict-toast');
let _toastTimer = null;
function showConflictToast() {
  if (_toastTimer) {clearTimeout(_toastTimer);}
  _conflictToast.classList.add('visible');
  _toastTimer = setTimeout(() => {
    _conflictToast.classList.remove('visible');
    _toastTimer = null;
  }, 3000);
}

popup.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn || !popup._targetEvent) {return;}
  const typeMap = { 'btn-booked': 'booked', 'btn-maintenance': 'maintenance', 'btn-empty': 'empty' };
  const newType = Object.entries(typeMap).find(([cls]) => btn.classList.contains(cls))?.[1];
  if (!newType) {return;}

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
  if (!popup.contains(e.target)) {hidePopup();}
});

// ── lazy loading ─────────────────────────────────────────────────────────────

const _DAY = 86400000;
let _loadedStart = null;
let _loadedEnd   = null;
let _fetchingLeft  = false;
let _fetchingRight = false;

function _makeDate(days) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

async function _fetchAndMerge(start, end, direction) {
  const events = await api.fetchEvents(start, end);
  store.mergeEvents(events);
  if (!_loadedStart || start < _loadedStart) { _loadedStart = start; }
  if (!_loadedEnd   || end   > _loadedEnd)   { _loadedEnd   = end;   }

  const rangeMs = _loadedEnd - _loadedStart;
  const maxMs   = EVICT_RANGE_DAYS * _DAY;
  if (rangeMs > maxMs) {
    const excess = rangeMs - maxMs;
    if (direction === 'right') {
      const cutoff = new Date(_loadedStart.getTime() + excess);
      store.evictBefore(cutoff);
      _loadedStart = cutoff;
    } else {
      const cutoff = new Date(_loadedEnd.getTime() - excess);
      store.evictAfter(cutoff);
      _loadedEnd = cutoff;
    }
  }

  scheduleRender();
}

function maybePrefetch() {
  if (!_loadedStart || !_loadedEnd) { return; }
  const days = sm.windowDays;
  const first = days[sm.firstColIndex];
  const last  = days[Math.min(sm.firstColIndex + sm.visibleCols(), days.length - 1)];
  if (!first || !last) { return; }

  if (!_fetchingLeft && (first - _loadedStart) / _DAY < PREFETCH_THRESHOLD) {
    _fetchingLeft = true;
    const end   = new Date(_loadedStart);
    const start = new Date(_loadedStart.getTime() - CHUNK_DAYS * _DAY);
    _fetchAndMerge(start, end, 'left').finally(() => { _fetchingLeft = false; });
  }
  if (!_fetchingRight && (_loadedEnd - last) / _DAY < PREFETCH_THRESHOLD) {
    _fetchingRight = true;
    const start = new Date(_loadedEnd);
    const end   = new Date(_loadedEnd.getTime() + CHUNK_DAYS * _DAY);
    _fetchAndMerge(start, end, 'right').finally(() => { _fetchingRight = false; });
  }
}

// ── init ─────────────────────────────────────────────────────────────────────

async function init() {
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 100));

  const start = _makeDate(-INITIAL_LOAD_DAYS);
  const end   = _makeDate(+INITIAL_LOAD_DAYS);

  const [rooms, events] = await Promise.all([
    api.fetchRooms(),
    api.fetchEvents(start, end),
  ]);

  store.setRooms(rooms);
  store.setEvents(events);
  _loadedStart = start;
  _loadedEnd   = end;
  sm.setNumRooms(rooms.length);
  scheduleRender();

  document.getElementById('today-btn').addEventListener('click', () => sm.scrollToToday());

  initDrag(sm, canvas, dragCanvas, scheduleRender, (ev, clientX, clientY) => {
    showPopup(clientX, clientY, ev);
  });

  sm.onGridClick = (e) => {
    const rect = canvas.getBoundingClientRect();
    const ev = hitTestEvent(e.clientX - rect.left, e.clientY - rect.top, sm, store);
    if (ev) {showPopup(e.clientX, e.clientY, ev);}
    else {hidePopup();}
  };

  const connect = window.REALTIME_TRANSPORT === 'sse' ? sseConnect : wsConnect;
  connect((msg) => {
    if (msg.type === 'events_changed') {
      // skip conflict check for updates caused by our own move to avoid rolling back a new drag
      const conflicted = msg.events.some(e => !isOwnMove(e.id) && cancelDragIfConflict(e.id));
      const moved = store.applyUpdates(msg.events);
      for (const m of moved) {startMove(m.ev, m.fromStart, m.fromEnd, m.fromRoomId);}
      scheduleRender();
      if (conflicted) {showConflictToast();}
    }
  });
}

init();
