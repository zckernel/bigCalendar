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

const _loader = document.getElementById('loader');
let _fetchCount = 0;
function _startFetch() { if (++_fetchCount === 1) { _loader?.classList.add('visible'); } }
function _endFetch()   { if (--_fetchCount === 0) { _loader?.classList.remove('visible'); } }

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
// [{s, e}] ms timestamps, sorted by s, non-overlapping — actual loaded ranges
let _loaded = [];

function _addRange(start, end) {
  const entry = {s: start.getTime(), e: end.getTime()};
  const sorted = [..._loaded, entry].sort((a, b) => a.s - b.s);
  const out = [];
  for (const r of sorted) {
    if (out.length && r.s <= out[out.length - 1].e) {
      out[out.length - 1].e = Math.max(out[out.length - 1].e, r.e);
    } else { out.push({s: r.s, e: r.e}); }
  }
  _loaded = out;
}

function _coveredAt(d) {
  const t = d.getTime();
  return _loaded.some(r => r.s <= t && r.e >= t);
}

// End of the rightmost interval whose start ≤ d (how far right coverage goes at/before d)
function _rightCovEdge(d) {
  const t = d.getTime();
  let best = null;
  for (const r of _loaded) {
    if (r.s <= t && (best === null || r.e > best)) { best = r.e; }
  }
  return best; // ms or null
}

// Start of the leftmost interval whose end ≥ d (how far left coverage goes at/after d)
function _leftCovEdge(d) {
  const t = d.getTime();
  let best = null;
  for (const r of _loaded) {
    if (r.e >= t && (best === null || r.s < best)) { best = r.s; }
  }
  return best; // ms or null
}

function _makeDate(days) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

async function _fetchAndMerge(start, end, signal) {
  _startFetch();
  try {
    const events = await api.fetchEvents(start, end, signal);
    store.mergeEvents(events);
    _addRange(start, end);
    scheduleRender();
  } catch (e) {
    if (e.name !== 'AbortError') { throw e; }
  } finally {
    _endFetch();
  }
}

function _evictFarData() {
  if (!_loaded.length) { return; }
  const days = sm.windowDays;
  const midIdx = Math.min(sm.firstColIndex + Math.floor(sm.visibleCols() / 2), days.length - 1);
  const mid = days[midIdx];
  if (!mid) { return; }
  const half = (EVICT_RANGE_DAYS / 2) * _DAY;
  const lc = mid.getTime() - half;
  const rc = mid.getTime() + half;
  _loaded = _loaded.map(r => ({s: Math.max(r.s, lc), e: Math.min(r.e, rc)})).filter(r => r.s < r.e);
  store.evictBefore(new Date(lc));
  store.evictAfter(new Date(rc));
}

let _abortLeft  = null;
let _abortRight = null;
let _rightGen = 0;
let _leftGen  = 0;
let _fetchingRightEnd   = null; // fetchEnd of the in-flight right fetch
let _fetchingLeftStart  = null; // fetchStart of the in-flight left fetch
let _initialized = false;

function maybePrefetch() {
  _evictFarData();
  const days = sm.windowDays;
  const first = days[sm.firstColIndex];
  const last  = days[Math.min(sm.firstColIndex + sm.visibleCols(), days.length - 1)];
  if (!first || !last) { return; }

  if (_abortRight && _fetchingRightEnd && last.getTime() > _fetchingRightEnd.getTime()) {
    _abortRight.abort(); _abortRight = null; _fetchingRightEnd = null; _rightGen++;
  }
  if (_abortLeft && _fetchingLeftStart && first.getTime() < _fetchingLeftStart.getTime()) {
    _abortLeft.abort(); _abortLeft = null; _fetchingLeftStart = null; _leftGen++;
  }

  // Only one fetch at a time — no cross-cancellation in start blocks
  if (_abortRight || _abortLeft) { return; }
  if (!_initialized) { return; }

  const rEdge = _rightCovEdge(last);
  const lEdge = _leftCovEdge(first);
  const rDays = rEdge !== null ? (rEdge - last.getTime()) / _DAY : -Infinity;
  const lDays = lEdge !== null ? (first.getTime() - lEdge) / _DAY : -Infinity;

  if (rDays < PREFETCH_THRESHOLD) {
    const ctrl = new AbortController();
    _abortRight = ctrl;
    const gen = ++_rightGen;
    const farRight = rEdge === null || (last.getTime() - rEdge) / _DAY > CHUNK_DAYS;
    const fetchStart = farRight
      ? new Date(last.getTime() - CHUNK_DAYS * _DAY / 2)
      : new Date(rEdge);
    const fetchEnd = new Date(fetchStart.getTime() + CHUNK_DAYS * _DAY);
    _fetchingRightEnd = fetchEnd;
    _fetchAndMerge(fetchStart, fetchEnd, ctrl.signal).finally(() => {
      if (_rightGen === gen) { _abortRight = null; _fetchingRightEnd = null; maybePrefetch(); }
    });
  } else if (lDays < PREFETCH_THRESHOLD) {
    const ctrl = new AbortController();
    _abortLeft = ctrl;
    const gen = ++_leftGen;
    const farLeft = lEdge === null || (lEdge - first.getTime()) / _DAY > CHUNK_DAYS;
    const fetchEnd = farLeft
      ? new Date(first.getTime() + CHUNK_DAYS * _DAY / 2)
      : new Date(lEdge);
    const fetchStart = new Date(fetchEnd.getTime() - CHUNK_DAYS * _DAY);
    _fetchingLeftStart = fetchStart;
    _fetchAndMerge(fetchStart, fetchEnd, ctrl.signal).finally(() => {
      if (_leftGen === gen) { _abortLeft = null; _fetchingLeftStart = null; maybePrefetch(); }
    });
  }
}

// ── init ─────────────────────────────────────────────────────────────────────

async function init() {
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 100));

  _startFetch();
  const rooms = await api.fetchRooms().finally(() => _endFetch());

  store.setRooms(rooms);
  sm.setNumRooms(rooms.length);
  scheduleRender();
  _initialized = true;
  maybePrefetch();

  document.getElementById('today-btn').addEventListener('click', async () => {
    const today = _makeDate(0);
    if (!_coveredAt(today)) {
      const start = new Date(today.getTime() - INITIAL_LOAD_DAYS * _DAY);
      const end   = new Date(today.getTime() + INITIAL_LOAD_DAYS * _DAY);
      await _fetchAndMerge(start, end);
    }
    sm.scrollToToday();
  });

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
