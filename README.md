# bigCalendar

A high-performance, real-time room booking calendar built with Django Channels and a Canvas-based frontend. Designed to handle thousands of rooms and events smoothly — on both desktop and mobile.

**Demo:** https://zckernel.com/bigcalendar/

## Features

### Performance
- **Canvas rendering** — the entire grid is drawn via the Canvas 2D API. No DOM nodes per event, no layout thrashing. Renders 1000 rooms × 360 days instantly.
- **Virtual viewport** — only the visible rows and columns are drawn on each frame. Scrolling through thousands of rooms stays smooth regardless of dataset size.
- **Infinite scroll window** — the date axis is a sliding window that extends automatically as the user scrolls, with no hard boundaries.

### Smooth UX
- **Animated drag & drop** — events interpolate smoothly to their new position after being dropped. If the server rejects a move (overlap conflict), the event snaps back with animation.
- **Real-time sync** — changes made by any client appear on all other connected clients within ~2 seconds, with smooth move animation applied automatically.
- **Edge auto-scroll** — dragging an event near the viewport edge scrolls the calendar horizontally or vertically at a speed proportional to proximity.

### Mobile
- **Touch scrolling** — swipe gestures pan the calendar in both axes.
- **Long-press to drag** — hold an event for 350 ms to start dragging it; the device vibrates briefly to confirm. Tap to change the event type.
- **Full touch event pipeline** — touch move, end, and cancel are all handled; scroll and drag modes are cleanly separated with no gesture conflicts.

### Other
- Three event types: **Booked** (blue), **Maintenance** (red), **Empty** (yellow) — switchable via tap/click popup.
- Overlap detection on both client (prevents the drop) and server (race-condition guard).
- Dual real-time transport: **WebSocket + Redis** (multi-process) or **SSE** (zero-dependency single-process).
- REST API for rooms and events.

## Stack

| Layer | Technology |
|---|---|
| Backend | Django 6, Django Channels, Daphne |
| Database | MySQL |
| Cache / WS broker | Redis |
| Frontend | Vanilla JS (ES modules), Canvas API |
| Container | Docker / docker-compose |

## Architecture

```
bigCalendar/
  models.py              # Room, Event
  repositories/          # DB queries
  services/              # Business logic + polling (every 2s)
  consumers.py           # WebSocket consumer
  views.py               # REST API + index
  static/bigCalendar/js/ # config, api, store, websocket, scroll, renderer, main
  templates/             # index.html
bigCalendar_app/
  settings.py            # CHANNEL_LAYERS → redis:6379
  asgi.py                # ProtocolTypeRouter
```

## Getting Started

### Prerequisites

- Docker + docker-compose
- A running `shared-dev-net` Docker network
- MySQL container reachable as `mysql` (db: `app`, user: `app`, pass: `secret`)
- Redis container reachable as `redis` on port `6379`

### Run

```bash
docker-compose up --build
```

The app is available at `http://localhost:8000`.

### Seed data

```bash
python manage.py seed_data          # seed 1000 rooms + events
python manage.py seed_data --clear  # drop and re-seed
```

### Migrations

```bash
python manage.py migrate
```

## API

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/rooms/` | List all rooms |
| GET | `/api/events/?start=YYYY-MM-DD&end=YYYY-MM-DD` | Events for date range |

## WebSocket

Connect to `ws://localhost:8000/ws/events/` to receive real-time updates.

Payload on change:
```json
{ "type": "events_changed", "events": [...] }
```

## Realtime Transport

The update delivery mechanism is controlled by the `REALTIME_TRANSPORT` environment variable.

| Value | Default | Requires |
|---|---|---|
| `redis` | yes | Redis container, Django Channels |
| `sse` | no | Nothing extra |

Edit `bigCalendar_app/config.py`:

```python
REALTIME_TRANSPORT = 'redis'  # or 'sse'
```

### When to use `redis`

- You run multiple server processes / workers
- You need true bidirectional communication in the future
- You already have Redis in your infrastructure

### When to use `sse`

- Single-process deployment (one Daphne instance)
- You want to eliminate the Redis dependency
- Simpler infrastructure: no broker, no Channels layer needed
- Updates are server → client only (which is all this app does)

Both modes poll the database every 2 seconds and push changes to all connected clients. The user experience is identical.

## License

This project is licensed under the Business Source License 1.1 (BSL).

- Free for non-commercial use  
- Commercial use requires a separate license  
- Contact: zckernel@gmail.com  
- Converts to MIT on 2036-01-01

## Database Schema

```sql
calendar_room:  id, name
calendar_event: id, room_id (FK), event_type ENUM(empty,booked,maintenance),
                event_start DATE, event_end DATE,
                updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP
```
