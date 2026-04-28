import { CELL_W, CELL_H, HEADER_H, ROOM_COL_W } from './config.js';
import { hitTestEvent, renderGhost } from './renderer.js';
import * as store from './store.js';
import * as api from './api.js';

const MS = 86400000;
const EDGE_PX    = 60;   // px от края — начало авто-скролла
const MAX_SPEED  = 15;   // px/frame

const _fmt = d =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

let _drag = null;
let _rafPending = false;

export function getDragState() { return _drag; }

export function init(sm, canvas, dragCanvas, scheduleRender, onEventClick) {
  const dragCtx = dragCanvas.getContext('2d');

  sm.onDragIntercept = (e) => {
    const rect   = canvas.getBoundingClientRect();
    const cx     = e.clientX - rect.left;
    const cy     = e.clientY - rect.top;
    const ev     = hitTestEvent(cx, cy, sm, store);
    if (!ev) return false;

    // сколько дней от начала события до точки клика — чтобы событие не прыгало при drag'е
    const dayIdx      = sm.firstColIndex + Math.floor((cx - ROOM_COL_W + sm.colOffset) / CELL_W);
    const clickDay    = sm.windowDays[Math.max(0, Math.min(sm.windowDays.length - 1, dayIdx))];
    const clickOffset = Math.round((clickDay.getTime() - ev.start.getTime()) / MS);

    _drag = {
      ev, clickOffset, onEventClick,
      startClientX: e.clientX,
      startClientY: e.clientY,
      curClientX: e.clientX,
      curClientY: e.clientY,
      targetRoomIdx: _roomIdxAt(e.clientY, canvas, sm),
      targetStart: ev.start,
      targetEnd:   ev.end,
      hasOverlap:  false,
      sm, canvas, dragCtx, scheduleRender,
    };

    document.body.style.cursor = 'grabbing';
    scheduleRender();
    return true;
  };

  window.addEventListener('mousemove', (e) => {
    if (!_drag) return;
    _drag.curClientX = e.clientX;
    _drag.curClientY = e.clientY;
    _recalc();
    _scheduleGhost();
  });

  window.addEventListener('mouseup', async (e) => {
    if (!_drag) return;
    const d = _drag;
    _drag = null;

    document.body.style.cursor = '';
    d.dragCtx.clearRect(0, 0, d.canvas.width, d.canvas.height);

    // клик (мышь почти не двигалась) — показываем попап смены типа
    const dist = Math.hypot(e.clientX - d.startClientX, e.clientY - d.startClientY);
    if (dist < 5) {
      d.scheduleRender();
      if (d.onEventClick) d.onEventClick(d.ev, e.clientX, e.clientY);
      return;
    }

    if (d.hasOverlap) { d.scheduleRender(); return; }

    const rooms      = store.getRooms();
    const targetRoom = rooms[d.targetRoomIdx];
    if (!targetRoom) { d.scheduleRender(); return; }

    const unchanged =
      targetRoom.id === d.ev.roomId &&
      d.targetStart.getTime() === d.ev.start.getTime();
    if (unchanged) { d.scheduleRender(); return; }

    try {
      const updated = await api.moveEvent(
        d.ev.id, targetRoom.id,
        _fmt(d.targetStart), _fmt(d.targetEnd),
      );
      store.applyUpdates([updated]);
    } catch {
      // сервер отклонил (гонка overlap) — UI без изменений
    }
    d.scheduleRender();
  });
}

// пересчёт целевой позиции относительно текущего viewport
function _recalc() {
  const { ev, clickOffset, sm, canvas } = _drag;
  const rect   = canvas.getBoundingClientRect();
  const cx     = _drag.curClientX - rect.left;

  // день под курсором в текущем viewport
  const dayIdx    = sm.firstColIndex + Math.floor((cx - ROOM_COL_W + sm.colOffset) / CELL_W);
  const dayUnder  = sm.windowDays[Math.max(0, Math.min(sm.windowDays.length - 1, dayIdx))];

  const durMs = ev.end.getTime() - ev.start.getTime();
  _drag.targetStart   = new Date(dayUnder.getTime() - clickOffset * MS);
  _drag.targetEnd     = new Date(_drag.targetStart.getTime() + durMs);
  _drag.targetRoomIdx = _roomIdxAt(_drag.curClientY, canvas, sm);

  const room = store.getRooms()[_drag.targetRoomIdx];
  _drag.hasOverlap = room
    ? _hasOverlap(room.id, _drag.targetStart, _drag.targetEnd, ev.id)
    : true;
}

function _scheduleGhost() {
  if (_rafPending) return;
  _rafPending = true;
  requestAnimationFrame(() => {
    _rafPending = false;
    if (!_drag) return;

    // edge scroll
    const rect = _drag.canvas.getBoundingClientRect();
    const cx   = _drag.curClientX - rect.left;
    const cy   = _drag.curClientY - rect.top;
    const dx   = _edgeSpeedX(cx, _drag.canvas.width);
    const dy   = _edgeSpeed(cy, _drag.canvas.height);

    if (dx !== 0 || dy !== 0) {
      _drag.sm.scroll(dx, dy);   // скроллит viewport
      _recalc();                  // пересчитываем цель под курсором
      _scheduleGhost();           // продолжаем скроллить пока у края
    }

    renderGhost(_drag.dragCtx, _drag.canvas.width, _drag.canvas.height, _drag.sm, _drag);
  });
}

function _edgeSpeedX(cx, W) {
  const left = ROOM_COL_W;
  if (cx < left + EDGE_PX)  return -MAX_SPEED * (1 - Math.max(0, cx - left) / EDGE_PX);
  if (cx > W - EDGE_PX)     return  MAX_SPEED * (1 - (W - cx) / EDGE_PX);
  return 0;
}

function _edgeSpeed(pos, size) {
  if (pos < EDGE_PX)          return -MAX_SPEED * (1 - pos / EDGE_PX);
  if (pos > size - EDGE_PX)   return  MAX_SPEED * (1 - (size - pos) / EDGE_PX);
  return 0;
}

function _roomIdxAt(clientY, canvas, sm) {
  const rect = canvas.getBoundingClientRect();
  const idx  = sm.firstRowIndex + Math.floor((clientY - rect.top - HEADER_H + sm.rowOffset) / CELL_H);
  return Math.max(0, Math.min(store.getRooms().length - 1, idx));
}

function _hasOverlap(roomId, start, end, excludeId) {
  return store.getEventsForRoom(roomId).some(
    ev => ev.id !== excludeId && ev.start <= end && ev.end >= start,
  );
}
