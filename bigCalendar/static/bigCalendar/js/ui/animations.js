import { DURATION } from '../core/config.js';

const _anims = new Map();

function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

export function startMove(ev, fromStart, fromEnd, fromRoomId) {
  _anims.set(ev.id, {
    fromStart, fromEnd, fromRoomId,
    toStart: ev.start, toEnd: ev.end, toRoomId: ev.roomId,
    t0: performance.now(),
  });
}

export function cancelMove(eventId) {
  _anims.delete(eventId);
}

export function getInterp(eventId) {
  const a = _anims.get(eventId);
  if (!a) {return null;}
  const raw = Math.min(1, (performance.now() - a.t0) / DURATION);
  if (raw >= 1) { _anims.delete(eventId); return null; }
  const t = easeOut(raw);
  return {
    start:      new Date(a.fromStart.getTime() + (a.toStart.getTime() - a.fromStart.getTime()) * t),
    end:        new Date(a.fromEnd.getTime()   + (a.toEnd.getTime()   - a.fromEnd.getTime())   * t),
    fromRoomId: a.fromRoomId,
    toRoomId:   a.toRoomId,
    t,
  };
}

export function hasActive() { return _anims.size > 0; }
