import { CELL_W, CELL_H, HEADER_H, ROOM_COL_W, EVENT_PAD, DAYS_OF_WEEK, EVENT_COLORS } from '../core/config.js';

const MS = 86400000;

export function hitTestEvent(canvasX, canvasY, sm, store) {
  if (canvasY < HEADER_H || canvasX < ROOM_COL_W) {return null;}
  const roomIdx = sm.firstRowIndex + Math.floor((canvasY - HEADER_H + sm.rowOffset) / CELL_H);
  const rooms = store.getRooms();
  if (roomIdx < 0 || roomIdx >= rooms.length) {return null;}
  const dayIdx = sm.firstColIndex + Math.floor((canvasX - ROOM_COL_W + sm.colOffset) / CELL_W);
  if (dayIdx < 0 || dayIdx >= sm.windowDays.length) {return null;}
  const clickedDayMs = sm.windowDays[dayIdx].getTime();
  const events = store.getEventsForRoom(rooms[roomIdx].id);
  return events.find(ev => ev.start.getTime() <= clickedDayMs && clickedDayMs <= ev.end.getTime()) || null;
}

export function render(ctx, W, H, sm, store, dragState = null, getInterp = null) {
  ctx.clearRect(0, 0, W, H);
  _drawGrid(ctx, W, H, sm, store, dragState, getInterp);
  _drawRoomNames(ctx, H, sm, store);
  _drawHeader(ctx, W, sm);
  _drawCorner(ctx);
}

export function renderGhost(dragCtx, W, H, sm, dragState) {
  dragCtx.clearRect(0, 0, W, H);
  if (!dragState || !dragState.targetStart) {return;}

  const { targetRoomIdx, targetStart, targetEnd, hasOverlap } = dragState;
  const rowScreenIdx = targetRoomIdx - sm.firstRowIndex;
  const rowTop = HEADER_H + rowScreenIdx * CELL_H - sm.rowOffset;
  if (rowTop + CELL_H < HEADER_H || rowTop > H) {return;}

  const startColIdx = Math.round((targetStart.getTime() - sm.windowStart.getTime()) / MS);
  const endColIdx   = Math.round((targetEnd.getTime()   - sm.windowStart.getTime()) / MS);
  const eventLeft   = ROOM_COL_W + (startColIdx - sm.firstColIndex) * CELL_W - sm.colOffset;
  const eventRight  = ROOM_COL_W + (endColIdx - sm.firstColIndex + 1) * CELL_W - sm.colOffset;
  const clippedLeft  = Math.max(eventLeft, ROOM_COL_W);
  const clippedRight = Math.min(eventRight, W);
  if (clippedRight <= clippedLeft) {return;}

  const eventTop    = rowTop + EVENT_PAD;
  const eventHeight = CELL_H - EVENT_PAD * 2;

  dragCtx.fillStyle = hasOverlap ? 'rgba(200,0,0,0.45)' : 'rgba(80,80,80,0.35)';
  dragCtx.fillRect(clippedLeft, eventTop, clippedRight - clippedLeft, eventHeight);
}

function _drawGrid(ctx, W, H, sm, store, dragState, getInterp) {
  const rooms = store.getRooms();
  const visibleRowCount = sm.visibleRows();
  const visibleColCount = sm.visibleCols();
  const dragId = dragState?.ev?.id ?? null;
  const overlays = [];

  ctx.strokeStyle = '#ddd';

  for (let ri = 0; ri < visibleRowCount; ri++) {
    const roomIdx = sm.firstRowIndex + ri;
    if (roomIdx >= rooms.length) {continue;}
    const rowTop = HEADER_H + ri * CELL_H - sm.rowOffset;

    ctx.fillStyle = (roomIdx % 2 === 0) ? '#ffffff' : '#f8f8f8';
    ctx.fillRect(ROOM_COL_W, rowTop, W - ROOM_COL_W, CELL_H);

    _drawEvents(ctx, W, sm, store.getEventsForRoom(rooms[roomIdx].id), rowTop, dragId, getInterp, rooms, overlays);

    for (let ci = 0; ci < visibleColCount; ci++) {
      ctx.strokeRect(ROOM_COL_W + ci * CELL_W - sm.colOffset, rowTop, CELL_W, CELL_H);
    }
  }

  for (const overlay of overlays) {
    _paintEvent(ctx, overlay.ev, overlay.clippedLeft, overlay.clippedRight, overlay.eventLeft, overlay.eventTop, overlay.eventHeight);
  }
}

function _drawEvents(ctx, W, sm, events, rowTop, dragId, getInterp, rooms, overlays) {
  if (!events.length) {return;}
  const eventHeight = CELL_H - EVENT_PAD * 2;

  for (const ev of events) {
    let startColIdx, endColIdx, eventTop;
    let movingAcrossRows = false;
    const interp = getInterp ? getInterp(ev.id) : null;
    if (interp) {
      startColIdx = (interp.start.getTime() - sm.windowStart.getTime()) / MS;
      endColIdx   = (interp.end.getTime()   - sm.windowStart.getTime()) / MS;
      if (rooms && interp.fromRoomId !== interp.toRoomId) {
        const fromRoomIdx = rooms.findIndex(r => r.id === interp.fromRoomId);
        if (fromRoomIdx >= 0) {
          const fromRowScreenIdx = fromRoomIdx - sm.firstRowIndex;
          const fromRowTop       = HEADER_H + fromRowScreenIdx * CELL_H - sm.rowOffset;
          eventTop = fromRowTop + (rowTop - fromRowTop) * interp.t + EVENT_PAD;
          movingAcrossRows = true;
        } else {
          eventTop = rowTop + EVENT_PAD;
        }
      } else {
        eventTop = rowTop + EVENT_PAD;
      }
    } else {
      startColIdx = Math.round((ev.start.getTime() - sm.windowStart.getTime()) / MS);
      endColIdx   = Math.round((ev.end.getTime()   - sm.windowStart.getTime()) / MS);
      eventTop = rowTop + EVENT_PAD;
    }

    const eventLeft  = ROOM_COL_W + (startColIdx - sm.firstColIndex) * CELL_W - sm.colOffset;
    const eventRight = ROOM_COL_W + (endColIdx - sm.firstColIndex + 1) * CELL_W - sm.colOffset;

    const clippedLeft  = Math.max(eventLeft, ROOM_COL_W);
    const clippedRight = Math.min(eventRight, W);
    if (clippedRight <= clippedLeft) {continue;}

    if (ev.id === dragId) {
      _drawHatching(ctx, clippedLeft, eventTop, clippedRight - clippedLeft, eventHeight);
      continue;
    }

    if (movingAcrossRows && overlays) {
      overlays.push({ ev, clippedLeft, clippedRight, eventLeft, eventTop, eventHeight });
      continue;
    }

    _paintEvent(ctx, ev, clippedLeft, clippedRight, eventLeft, eventTop, eventHeight);
  }
}

function _paintEvent(ctx, ev, clippedLeft, clippedRight, eventLeft, eventTop, eventHeight) {
  ctx.fillStyle = EVENT_COLORS[ev.type] || '#aaa';
  ctx.fillRect(clippedLeft, eventTop, clippedRight - clippedLeft, eventHeight);

  const labelX = Math.max(eventLeft + 3, ROOM_COL_W + 3);
  if (clippedRight - labelX > 28) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(clippedLeft, eventTop, clippedRight - clippedLeft, eventHeight);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 9px monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(ev.type, labelX, eventTop + eventHeight / 2);
    ctx.restore();
  }
}

function _drawHatching(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#ccc';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#aaa';
  ctx.lineWidth = 1;
  const step = 5;
  ctx.beginPath();
  for (let i = -h; i < w + h; i += step) {
    ctx.moveTo(x + i, y);
    ctx.lineTo(x + i + h, y + h);
  }
  ctx.stroke();
  ctx.restore();
}

function _drawRoomNames(ctx, H, sm, store) {
  const rooms = store.getRooms();
  const visibleRowCount = sm.visibleRows();

  for (let ri = 0; ri < visibleRowCount; ri++) {
    const roomIdx = sm.firstRowIndex + ri;
    if (roomIdx >= rooms.length) {continue;}
    const rowTop = HEADER_H + ri * CELL_H - sm.rowOffset;

    ctx.fillStyle = (roomIdx % 2 === 0) ? '#e8eaf6' : '#ede7f6';
    ctx.fillRect(0, rowTop, ROOM_COL_W, CELL_H);
    ctx.strokeStyle = '#bbb';
    ctx.strokeRect(0, rowTop, ROOM_COL_W, CELL_H);

    ctx.fillStyle = '#222';
    ctx.font = 'bold 11px monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(rooms[roomIdx].name, 6, rowTop + CELL_H / 2);
  }
}

function _drawHeader(ctx, W, sm) {
  const visibleColCount = sm.visibleCols();

  ctx.font = '11px monospace';
  ctx.textBaseline = 'middle';

  for (let ci = 0; ci < visibleColCount; ci++) {
    const dayIdx = sm.firstColIndex + ci;
    if (dayIdx < 0 || dayIdx >= sm.windowDays.length) {continue;}
    const day = sm.windowDays[dayIdx];
    const colLeft  = ROOM_COL_W + ci * CELL_W - sm.colOffset;
    const isWeekend = day.getDay() === 0 || day.getDay() === 6;

    ctx.fillStyle = isWeekend ? '#ffcdd2' : '#c5cae9';
    ctx.fillRect(colLeft, 0, CELL_W, HEADER_H);
    ctx.strokeStyle = '#9fa8da';
    ctx.strokeRect(colLeft, 0, CELL_W, HEADER_H);

    const mm = String(day.getMonth() + 1).padStart(2, '0');
    const dd = String(day.getDate()).padStart(2, '0');
    ctx.fillStyle = '#1a237e';
    ctx.fillText(`${DAYS_OF_WEEK[day.getDay()]} ${mm}/${dd}`, colLeft + 4, HEADER_H / 2);
  }
}

function _drawCorner(ctx) {
  ctx.fillStyle = '#3f51b5';
  ctx.fillRect(0, 0, ROOM_COL_W, HEADER_H);
  ctx.strokeStyle = '#283593';
  ctx.strokeRect(0, 0, ROOM_COL_W, HEADER_H);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText('Rooms / Days', 6, HEADER_H / 2);
}
