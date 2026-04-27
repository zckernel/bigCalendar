let _rooms = [];
let _eventsByRoom = new Map();

export function setRooms(data) {
  _rooms = data;
}

export function getRooms() {
  return _rooms;
}

export function setEvents(data) {
  _eventsByRoom.clear();
  for (const e of data) _insertEvent(_parse(e));
  for (const arr of _eventsByRoom.values()) arr.sort(_byStart);
}

export function applyUpdates(events) {
  for (const e of events) {
    const parsed = _parse(e);
    if (!_eventsByRoom.has(e.room_id)) _eventsByRoom.set(e.room_id, []);
    const arr = _eventsByRoom.get(e.room_id);
    const idx = arr.findIndex(x => x.id === e.id);
    if (idx >= 0) arr[idx] = parsed;
    else arr.push(parsed);
    arr.sort(_byStart);
  }
}

export function getEventsForRoom(roomId) {
  return _eventsByRoom.get(roomId) || [];
}

function _insertEvent(parsed) {
  if (!_eventsByRoom.has(parsed.roomId)) _eventsByRoom.set(parsed.roomId, []);
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
