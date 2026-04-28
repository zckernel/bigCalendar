import { CELL_W, CELL_H, HEADER_H, ROOM_COL_W, EVENT_PAD, DAYS_OF_WEEK, EVENT_COLORS } from './config.js';

const MS = 86400000;

export function hitTestEvent(canvasX, canvasY, sm, store) {
  if (canvasY < HEADER_H || canvasX < ROOM_COL_W) return null;
  const roomIdx = sm.firstRowIndex + Math.floor((canvasY - HEADER_H + sm.rowOffset) / CELL_H);
  const rooms = store.getRooms();
  if (roomIdx < 0 || roomIdx >= rooms.length) return null;
  const dayIdx = sm.firstColIndex + Math.floor((canvasX - ROOM_COL_W + sm.colOffset) / CELL_W);
  if (dayIdx < 0 || dayIdx >= sm.windowDays.length) return null;
  const clickedDay = sm.windowDays[dayIdx].getTime();
  const events = store.getEventsForRoom(rooms[roomIdx].id);
  return events.find(ev => ev.start.getTime() <= clickedDay && clickedDay <= ev.end.getTime()) || null;
}

export function render(ctx, W, H, sm, store, dragState = null) {
  ctx.clearRect(0, 0, W, H);
  _drawGrid(ctx, W, H, sm, store, dragState);
  _drawRoomNames(ctx, H, sm, store);
  _drawHeader(ctx, W, sm);
  _drawCorner(ctx);
}

export function renderGhost(dragCtx, W, H, sm, dragState) {
  dragCtx.clearRect(0, 0, W, H);
  if (!dragState || !dragState.targetStart) return;

  const { targetRoomIdx, targetStart, targetEnd, hasOverlap } = dragState;
  const rowScreenIdx = targetRoomIdx - sm.firstRowIndex;
  const y = HEADER_H + rowScreenIdx * CELL_H - sm.rowOffset;
  if (y + CELL_H < HEADER_H || y > H) return;

  const si = Math.round((targetStart.getTime() - sm.windowStart.getTime()) / MS);
  const ei = Math.round((targetEnd.getTime()   - sm.windowStart.getTime()) / MS);
  const x0 = ROOM_COL_W + (si - sm.firstColIndex) * CELL_W - sm.colOffset;
  const x1 = ROOM_COL_W + (ei - sm.firstColIndex + 1) * CELL_W - sm.colOffset;
  const cx0 = Math.max(x0, ROOM_COL_W);
  const cx1 = Math.min(x1, W);
  if (cx1 <= cx0) return;

  const evY = y + EVENT_PAD;
  const evH = CELL_H - EVENT_PAD * 2;

  dragCtx.fillStyle = hasOverlap ? 'rgba(200,0,0,0.45)' : 'rgba(80,80,80,0.35)';
  dragCtx.fillRect(cx0, evY, cx1 - cx0, evH);
  dragCtx.strokeStyle = hasOverlap ? '#c00' : '#555';
  dragCtx.lineWidth = 2;
  dragCtx.strokeRect(cx0, evY, cx1 - cx0, evH);
}

function _drawGrid(ctx, W, H, sm, store, dragState) {
  const rooms = store.getRooms();
  const vRows = sm.visibleRows();
  const vCols = sm.visibleCols();
  const dragId = dragState?.ev?.id ?? null;

  ctx.strokeStyle = '#ddd';

  for (let ri = 0; ri < vRows; ri++) {
    const roomIdx = sm.firstRowIndex + ri;
    if (roomIdx >= rooms.length) continue;
    const y = HEADER_H + ri * CELL_H - sm.rowOffset;

    ctx.fillStyle = (roomIdx % 2 === 0) ? '#ffffff' : '#f8f8f8';
    ctx.fillRect(ROOM_COL_W, y, W - ROOM_COL_W, CELL_H);

    _drawEvents(ctx, W, sm, store.getEventsForRoom(rooms[roomIdx].id), y, dragId);

    for (let ci = 0; ci < vCols; ci++) {
      ctx.strokeRect(ROOM_COL_W + ci * CELL_W - sm.colOffset, y, CELL_W, CELL_H);
    }
  }
}

function _drawEvents(ctx, W, sm, events, rowY, dragId) {
  if (!events.length) return;
  const evY = rowY + EVENT_PAD;
  const evH = CELL_H - EVENT_PAD * 2;

  for (const ev of events) {
    const si = Math.round((ev.start - sm.windowStart) / MS);
    const ei = Math.round((ev.end   - sm.windowStart) / MS);

    const x0 = ROOM_COL_W + (si - sm.firstColIndex) * CELL_W - sm.colOffset;
    const x1 = ROOM_COL_W + (ei - sm.firstColIndex + 1) * CELL_W - sm.colOffset;

    const cx0 = Math.max(x0, ROOM_COL_W);
    const cx1 = Math.min(x1, W);
    if (cx1 <= cx0) continue;

    if (ev.id === dragId) {
      _drawHatching(ctx, cx0, evY, cx1 - cx0, evH);
      continue;
    }

    ctx.fillStyle = EVENT_COLORS[ev.type] || '#aaa';
    ctx.fillRect(cx0, evY, cx1 - cx0, evH);

    const labelX = Math.max(x0 + 3, ROOM_COL_W + 3);
    if (cx1 - labelX > 28) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx0, evY, cx1 - cx0, evH);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = 'bold 9px monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText(ev.type, labelX, evY + evH / 2);
      ctx.restore();
    }
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
  const vRows = sm.visibleRows();

  for (let ri = 0; ri < vRows; ri++) {
    const roomIdx = sm.firstRowIndex + ri;
    if (roomIdx >= rooms.length) continue;
    const y = HEADER_H + ri * CELL_H - sm.rowOffset;

    ctx.fillStyle = (roomIdx % 2 === 0) ? '#e8eaf6' : '#ede7f6';
    ctx.fillRect(0, y, ROOM_COL_W, CELL_H);
    ctx.strokeStyle = '#bbb';
    ctx.strokeRect(0, y, ROOM_COL_W, CELL_H);

    ctx.fillStyle = '#222';
    ctx.font = 'bold 11px monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(rooms[roomIdx].name, 6, y + CELL_H / 2);
  }
}

function _drawHeader(ctx, W, sm) {
  const vCols = sm.visibleCols();

  ctx.font = '11px monospace';
  ctx.textBaseline = 'middle';

  for (let ci = 0; ci < vCols; ci++) {
    const dayIdx = sm.firstColIndex + ci;
    if (dayIdx < 0 || dayIdx >= sm.windowDays.length) continue;
    const day = sm.windowDays[dayIdx];
    const x = ROOM_COL_W + ci * CELL_W - sm.colOffset;
    const isWeekend = day.getDay() === 0 || day.getDay() === 6;

    ctx.fillStyle = isWeekend ? '#ffcdd2' : '#c5cae9';
    ctx.fillRect(x, 0, CELL_W, HEADER_H);
    ctx.strokeStyle = '#9fa8da';
    ctx.strokeRect(x, 0, CELL_W, HEADER_H);

    const mm = String(day.getMonth() + 1).padStart(2, '0');
    const dd = String(day.getDate()).padStart(2, '0');
    ctx.fillStyle = '#1a237e';
    ctx.fillText(`${DAYS_OF_WEEK[day.getDay()]} ${mm}/${dd}`, x + 4, HEADER_H / 2);
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
