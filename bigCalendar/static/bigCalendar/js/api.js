const _fmt = d => d.toISOString().slice(0, 10);
const BASE = '/bigcalendar';

export async function fetchRooms() {
  const res = await fetch(`${BASE}/api/rooms/`);
  const data = await res.json();
  return data.rooms;
}

export async function fetchEvents(start, end) {
  const res = await fetch(`${BASE}/api/events/?start=${_fmt(start)}&end=${_fmt(end)}`);
  const data = await res.json();
  return data.events;
}

export async function moveEvent(id, roomId, start, end) {
  const res = await fetch(`${BASE}/api/events/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room_id: roomId, event_start: start, event_end: end }),
  });
  if (!res.ok) throw new Error('move failed');
  const data = await res.json();
  return data.event;
}

export async function updateEvent(id, eventType) {
  const res = await fetch(`${BASE}/api/events/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_type: eventType }),
  });
  if (!res.ok) throw new Error('update failed');
  const data = await res.json();
  return data.event;
}
