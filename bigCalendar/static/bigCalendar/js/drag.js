import { CELL_W, CELL_H, HEADER_H, ROOM_COL_W } from './config.js';
import { hitTestEvent, renderGhost } from './renderer.js';
import * as store from './store.js';
import * as api from './api.js';
import { startMove, cancelMove } from './animations.js';

const MS = 86400000;
const EDGE_PX   = 60;  // px от края — начало авто-скролла
const MAX_SPEED = 15;  // px/frame

const _fmt = d =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

let _drag = null;
let _rafPending = false;

export function getDragState() { return _drag; }

export function init(sm, canvas, dragCanvas, scheduleRender, onEventClick) {
  const dragCtx = dragCanvas.getContext('2d');

  sm.onDragIntercept = (e) => {
    const rect    = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;
    const ev      = hitTestEvent(canvasX, canvasY, sm, store);
    if (!ev) return false;

    // сколько дней от начала события до точки клика — чтобы событие не прыгало при drag'е
    const colIdx          = sm.firstColIndex + Math.floor((canvasX - ROOM_COL_W + sm.colOffset) / CELL_W);
    const dayUnderCursor  = sm.windowDays[Math.max(0, Math.min(sm.windowDays.length - 1, colIdx))];
    const clickDayOffset  = Math.round((dayUnderCursor.getTime() - ev.start.getTime()) / MS);

    _drag = {
      ev, clickDayOffset, onEventClick,
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
    const drag = _drag;
    _drag = null;

    document.body.style.cursor = '';

    // клик (мышь почти не двигалась) — показываем попап смены типа
    const dist = Math.hypot(e.clientX - drag.startClientX, e.clientY - drag.startClientY);
    if (dist < 5) {
      drag.dragCtx.clearRect(0, 0, drag.canvas.width, drag.canvas.height);
      drag.scheduleRender();
      if (drag.onEventClick) drag.onEventClick(drag.ev, e.clientX, e.clientY);
      return;
    }

    await _commitDrag(drag);
  });

  sm.onDragTouchMove = (clientX, clientY) => {
    if (!_drag) return;
    _drag.curClientX = clientX;
    _drag.curClientY = clientY;
    _recalc();
    _scheduleGhost();
  };

  sm.onDragTouchEnd = async () => {
    if (!_drag) return;
    const drag = _drag;
    _drag = null;
    await _commitDrag(drag);
  };
}

async function _commitDrag(drag) {
  if (drag.hasOverlap) { _snapBack(drag); return; }

  drag.dragCtx.clearRect(0, 0, drag.canvas.width, drag.canvas.height);

  const rooms      = store.getRooms();
  const targetRoom = rooms[drag.targetRoomIdx];
  if (!targetRoom) { drag.scheduleRender(); return; }

  const unchanged =
    targetRoom.id === drag.ev.roomId &&
    drag.targetStart.getTime() === drag.ev.start.getTime();
  if (unchanged) { drag.scheduleRender(); return; }

  try {
    const updated = await api.moveEvent(
      drag.ev.id, targetRoom.id,
      _fmt(drag.targetStart), _fmt(drag.targetEnd),
    );
    store.applyUpdates([updated]);
    cancelMove(drag.ev.id);
  } catch {}
  drag.scheduleRender();
}

// пересчёт целевой позиции относительно текущего viewport
function _recalc() {
  const { ev, clickDayOffset, sm, canvas } = _drag;
  const rect    = canvas.getBoundingClientRect();
  const canvasX = _drag.curClientX - rect.left;

  // день под курсором в текущем viewport
  const colIdx         = sm.firstColIndex + Math.floor((canvasX - ROOM_COL_W + sm.colOffset) / CELL_W);
  const dayUnderCursor = sm.windowDays[Math.max(0, Math.min(sm.windowDays.length - 1, colIdx))];

  const durationMs      = ev.end.getTime() - ev.start.getTime();
  _drag.targetStart     = new Date(dayUnderCursor.getTime() - clickDayOffset * MS);
  _drag.targetEnd       = new Date(_drag.targetStart.getTime() + durationMs);
  _drag.targetRoomIdx   = _roomIdxAt(_drag.curClientY, canvas, sm);

  const targetRoom  = store.getRooms()[_drag.targetRoomIdx];
  _drag.hasOverlap  = targetRoom
    ? _hasOverlap(targetRoom.id, _drag.targetStart, _drag.targetEnd, ev.id)
    : true;
}

function _scheduleGhost() {
  if (_rafPending) return;
  _rafPending = true;
  requestAnimationFrame(() => {
    _rafPending = false;
    if (!_drag) return;

    // edge scroll
    const rect    = _drag.canvas.getBoundingClientRect();
    const canvasX = _drag.curClientX - rect.left;
    const canvasY = _drag.curClientY - rect.top;
    const scrollDx = _edgeSpeedX(canvasX, _drag.canvas.width);
    const scrollDy = _edgeSpeed(canvasY, _drag.canvas.height);

    if (scrollDx !== 0 || scrollDy !== 0) {
      _drag.sm.scroll(scrollDx, scrollDy);
      _recalc();
      _scheduleGhost();
    }

    renderGhost(_drag.dragCtx, _drag.canvas.width, _drag.canvas.height, _drag.sm, _drag);
  });
}

function _edgeSpeedX(canvasX, canvasW) {
  const left = ROOM_COL_W;
  if (canvasX < left + EDGE_PX)  return -MAX_SPEED * (1 - Math.max(0, canvasX - left) / EDGE_PX);
  if (canvasX > canvasW - EDGE_PX) return  MAX_SPEED * (1 - (canvasW - canvasX) / EDGE_PX);
  return 0;
}

function _edgeSpeed(canvasY, canvasH) {
  if (canvasY < EDGE_PX)           return -MAX_SPEED * (1 - canvasY / EDGE_PX);
  if (canvasY > canvasH - EDGE_PX) return  MAX_SPEED * (1 - (canvasH - canvasY) / EDGE_PX);
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

function _snapBack(drag) {
  drag.dragCtx.clearRect(0, 0, drag.canvas.width, drag.canvas.height);
  const draggedRoomId = store.getRooms()[drag.targetRoomIdx]?.id ?? drag.ev.roomId;
  startMove(drag.ev, drag.targetStart, drag.targetEnd, draggedRoomId);
  drag.scheduleRender();
}
