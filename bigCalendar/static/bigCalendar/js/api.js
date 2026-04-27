const _fmt = d => d.toISOString().slice(0, 10);

export async function fetchRooms() {
  const res = await fetch('/api/rooms/');
  const data = await res.json();
  return data.rooms;
}

export async function fetchEvents(start, end) {
  const res = await fetch(`/api/events/?start=${_fmt(start)}&end=${_fmt(end)}`);
  const data = await res.json();
  return data.events;
}

export async function updateEvent(id, eventType) {
  const res = await fetch(`/api/events/${id}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_type: eventType }),
  });
  if (!res.ok) throw new Error('update failed');
  const data = await res.json();
  return data.event;
}
