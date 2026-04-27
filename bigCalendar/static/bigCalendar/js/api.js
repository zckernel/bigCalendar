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
