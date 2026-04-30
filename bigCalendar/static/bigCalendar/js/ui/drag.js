import { CELL_W, CELL_H, HEADER_H, ROOM_COL_W, MS, EDGE_PX, MAX_SPEED, DRAG_DELAY_MS } from '../core/config.js';
import { hitTestEvent, renderGhost } from './renderer.js';
import * as store from '../core/store.js';
import * as api from '../net/api.js';
import { startMove, cancelMove, DURATION as ANIM_DURATION } from './animations.js';


const _fmt = d =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

let _drag = null;
let _pendingDrag = null;
let _dragTimer = null;
let _rafPending = false;
let _snapBackGhostToken = 0;

// IDs of events we just moved ourselves — server echo of our own move should not cancel a new drag
const _ownMoves = new Set();


export function getDragState() { return _drag; }

export function isOwnMove(eventId) {
  if (!_ownMoves.has(eventId)) { return false; }
  _ownMoves.delete(eventId);
  return true;
}

export function cancelDragIfConflict(eventId) {
  if (_pendingDrag && _pendingDrag.ev.id === eventId) {
    clearTimeout(_dragTimer);
    _dragTimer = null;
    _pendingDrag = null;
    return true;
  }
  if (!_drag || _drag.ev.id !== eventId) {return false;}
  const drag = _drag;
  _drag = null;
  document.body.style.cursor = '';
  drag.sm.windowDays = drag.savedWindowDays.slice();
  drag.sm.offsetX    = drag.savedOffsetX;
  drag.sm.scroll(0, drag.savedOffsetY - drag.sm.offsetY);
  drag.dragCtx.clearRect(0, 0, drag.canvas.width, drag.canvas.height);
  drag.scheduleRender();
  return true;
}

export function init(sm, canvas, dragCanvas, scheduleRender, onEventClick) {
  const dragCtx = dragCanvas.getContext('2d');

  sm.onDragIntercept = (e) => {
    const rect    = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;
    const ev      = hitTestEvent(canvasX, canvasY, sm, store);
    if (!ev) {return false;}

    // days from event start to click point — keeps event from jumping on drag
    const colIdx          = sm.firstColIndex + Math.floor((canvasX - ROOM_COL_W + sm.colOffset) / CELL_W);
    const dayUnderCursor  = sm.windowDays[Math.max(0, Math.min(sm.windowDays.length - 1, colIdx))];
    const clickDayOffset  = Math.round((dayUnderCursor.getTime() - ev.start.getTime()) / MS);

    // cancel any running snap-back animation for this event so the renderer
    // doesn't paint it as a coloured block (via getInterp) while dragId is null
    _snapBackGhostToken++;
    cancelMove(ev.id);
    dragCtx.clearRect(0, 0, canvas.width, canvas.height);

    _pendingDrag = {
      ev, clickDayOffset, onEventClick,
      startClientX: e.clientX,
      startClientY: e.clientY,
      curClientX: e.clientX,
      curClientY: e.clientY,
      targetRoomIdx: _roomIdxAt(e.clientY, canvas, sm),
      targetStart: ev.start,
      targetEnd:   ev.end,
      hasOverlap:  false,
      savedWindowDays: sm.windowDays.slice(),
      savedOffsetX:    sm.offsetX,
      savedOffsetY:    sm.offsetY,
      sm, canvas, dragCtx, scheduleRender,
    };

    // activate visual drag only after delay so a plain click doesn't flicker
    _dragTimer = setTimeout(() => {
      if (_pendingDrag) {
        _drag = _pendingDrag;
        _pendingDrag = null;
        document.body.style.cursor = 'grabbing';
        scheduleRender();
      }
    }, DRAG_DELAY_MS);

    return true;
  };

  function _onMouseMove(e) {
    if (_pendingDrag) {
      const dist = Math.hypot(e.clientX - _pendingDrag.startClientX, e.clientY - _pendingDrag.startClientY);
      if (dist > 5) {
        clearTimeout(_dragTimer);
        _dragTimer = null;
        _drag = _pendingDrag;
        _pendingDrag = null;
        document.body.style.cursor = 'grabbing';
        _drag.scheduleRender();
      }
    }
    if (!_drag) {return;}
    _drag.curClientX = e.clientX;
    _drag.curClientY = e.clientY;
    _recalc();
    _scheduleGhost();
  }

  async function _onMouseUp(e) {
    if (_pendingDrag) {
      // mouse barely moved — treat as click, drag was not yet activated
      clearTimeout(_dragTimer);
      _dragTimer = null;
      const pending = _pendingDrag;
      _pendingDrag = null;
      if (pending.onEventClick) {pending.onEventClick(pending.ev, e.clientX, e.clientY);}
      return;
    }
    if (!_drag) {return;}
    const drag = _drag;
    _drag = null;

    document.body.style.cursor = '';

    await _commitDrag(drag);
  }

  window.addEventListener('mousemove', _onMouseMove);
  window.addEventListener('mouseup',   _onMouseUp);

  sm.onDragTouchMove = (clientX, clientY) => {
    if (!_drag) {return;}
    _drag.curClientX = clientX;
    _drag.curClientY = clientY;
    _recalc();
    _scheduleGhost();
  };

  sm.onDragTouchEnd = async () => {
    if (!_drag) {return;}
    const drag = _drag;
    _drag = null;
    await _commitDrag(drag);
  };

  return function destroy() {
    window.removeEventListener('mousemove', _onMouseMove);
    window.removeEventListener('mouseup',   _onMouseUp);
  };
}

async function _commitDrag(drag) {
  if (drag.hasOverlap) { _snapBack(drag); return; }

  const _origRoomIdx = store.getRooms().findIndex(r => r.id === drag.ev.roomId);
  const _dropGhostState = {
    targetRoomIdx: _origRoomIdx >= 0 ? _origRoomIdx : drag.targetRoomIdx,
    targetStart:   drag.ev.start,
    targetEnd:     drag.ev.end,
    hasOverlap:    false,
  };
  const _dropT0 = performance.now();
  const _dropToken = ++_snapBackGhostToken;
  (function _animateDrop() {
    if (_snapBackGhostToken !== _dropToken) { return; }
    const raw = Math.min(1, (performance.now() - _dropT0) / ANIM_DURATION);
    if (raw >= 1) { drag.dragCtx.clearRect(0, 0, drag.canvas.width, drag.canvas.height); return; }
    drag.dragCtx.globalAlpha = Math.pow(1 - raw, 3);
    renderGhost(drag.dragCtx, drag.canvas.width, drag.canvas.height, drag.sm, _dropGhostState);
    drag.dragCtx.globalAlpha = 1;
    requestAnimationFrame(_animateDrop);
  }());

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
    _ownMoves.add(drag.ev.id);
    store.applyUpdates([updated]);
    cancelMove(drag.ev.id);
  } catch { /* network error — UI stays unchanged */ }
  drag.scheduleRender();
}

// recalculate target position relative to current viewport
function _recalc() {
  const { ev, clickDayOffset, sm, canvas } = _drag;
  const rect    = canvas.getBoundingClientRect();
  const canvasX = _drag.curClientX - rect.left;

  // day under cursor in current viewport
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
  if (_rafPending) {return;}
  _rafPending = true;
  requestAnimationFrame(() => {
    _rafPending = false;
    if (!_drag) {return;}

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
  if (canvasX < left + EDGE_PX)  {return -MAX_SPEED * (1 - Math.max(0, canvasX - left) / EDGE_PX);}
  if (canvasX > canvasW - EDGE_PX) {return  MAX_SPEED * (1 - (canvasW - canvasX) / EDGE_PX);}
  return 0;
}

function _edgeSpeed(canvasY, canvasH) {
  if (canvasY < EDGE_PX)           {return -MAX_SPEED * (1 - canvasY / EDGE_PX);}
  if (canvasY > canvasH - EDGE_PX) {return  MAX_SPEED * (1 - (canvasH - canvasY) / EDGE_PX);}
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
  drag.sm.windowDays = drag.savedWindowDays.slice();
  drag.sm.offsetX    = drag.savedOffsetX;
  drag.sm.scroll(0, drag.savedOffsetY - drag.sm.offsetY);
  const draggedRoomId = store.getRooms()[drag.targetRoomIdx]?.id ?? drag.ev.roomId;
  startMove(drag.ev, drag.targetStart, drag.targetEnd, draggedRoomId);
  const rooms = store.getRooms();
  const originalRoomIdx = rooms.findIndex(r => r.id === drag.ev.roomId);
  const _ghostState = {
    targetRoomIdx: originalRoomIdx >= 0 ? originalRoomIdx : drag.targetRoomIdx,
    targetStart:   drag.ev.start,
    targetEnd:     drag.ev.end,
    hasOverlap:    false,
  };
  const _t0 = performance.now();
  const _myToken = ++_snapBackGhostToken;
  (function _animateGhost() {
    if (_snapBackGhostToken !== _myToken) { return; }
    const raw = Math.min(1, (performance.now() - _t0) / ANIM_DURATION);
    if (raw >= 1) { drag.dragCtx.clearRect(0, 0, drag.canvas.width, drag.canvas.height); return; }
    drag.dragCtx.globalAlpha = Math.pow(1 - raw, 3);
    renderGhost(drag.dragCtx, drag.canvas.width, drag.canvas.height, drag.sm, _ghostState);
    drag.dragCtx.globalAlpha = 1;
    requestAnimationFrame(_animateGhost);
  }());
  drag.scheduleRender();
}
