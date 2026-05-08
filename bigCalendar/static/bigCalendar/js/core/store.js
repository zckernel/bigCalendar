let _rooms = [];
const _eventsByRoom = new Map();
const _loadedIds = new Set();

export function setRooms(data) {
  _rooms = data;
}

export function getRooms() {
  return _rooms;
}

export function setEvents(data) {
  _eventsByRoom.clear();
  _loadedIds.clear();
  for (const e of data) {_insertEvent(_parse(e));}
  for (const arr of _eventsByRoom.values()) {arr.sort(_byStart);}
}

export function mergeEvents(data) {
  for (const e of data) {_insertEvent(_parse(e));}
  for (const arr of _eventsByRoom.values()) {arr.sort(_byStart);}
}

export function applyUpdates(events) {
  const moved = [];
  for (const e of events) {
    const parsed = _parse(e);
    let old = null;
    for (const arr of _eventsByRoom.values()) {
      const idx = arr.findIndex(x => x.id === e.id);
      if (idx >= 0) { old = arr[idx]; arr.splice(idx, 1); break; }
    }
    if (!_eventsByRoom.has(e.room_id)) {_eventsByRoom.set(e.room_id, []);}
    const arr = _eventsByRoom.get(e.room_id);
    arr.push(parsed);
    arr.sort(_byStart);
    if (old) {moved.push({ ev: parsed, fromStart: old.start, fromEnd: old.end, fromRoomId: old.roomId });}
  }
  return moved;
}

export function getEventsForRoom(roomId) {
  return _eventsByRoom.get(roomId) || [];
}

export function evictBefore(cutoff) {
  for (const [roomId, arr] of _eventsByRoom) {
    const kept = [];
    for (const ev of arr) {
      if (ev.end < cutoff) { _loadedIds.delete(ev.id); }
      else { kept.push(ev); }
    }
    _eventsByRoom.set(roomId, kept);
  }
}

export function evictAfter(cutoff) {
  for (const [roomId, arr] of _eventsByRoom) {
    const kept = [];
    for (const ev of arr) {
      if (ev.start > cutoff) { _loadedIds.delete(ev.id); }
      else { kept.push(ev); }
    }
    _eventsByRoom.set(roomId, kept);
  }
}

function _insertEvent(parsed) {
  if (_loadedIds.has(parsed.id)) {return;}
  _loadedIds.add(parsed.id);
  if (!_eventsByRoom.has(parsed.roomId)) {_eventsByRoom.set(parsed.roomId, []);}
  _eventsByRoom.get(parsed.roomId).push(parsed);
}

function _parse(e) {
  return {
    id:     e.id,
    roomId: e.room_id,
    type:   e.event_type,
    start:  _localDate(e.event_start),
    end:    _localDate(e.event_end),
  };
}

function _localDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function _byStart(a, b) { return a.start - b.start; }
