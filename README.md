# bigCalendar

A high-performance grid calendar built for scale. The entire grid renders on a Canvas 2D surface — no DOM nodes per event, no layout thrashing. Only visible cells are painted each frame (virtual viewport), and the date axis extends dynamically as you scroll with no hard limits. Drop in a million rows, scroll through years of history, drag events across the grid — it stays smooth.

Works across all modern desktop browsers and mobile devices.

**Demo:** https://zckernel.com/bigcalendar/

## Features

### Performance
- **Canvas rendering** — the entire grid is drawn via the Canvas 2D API. No DOM nodes per event, no layout thrashing.
- **Virtual viewport** — only the visible rows and columns are drawn on each frame. Scrolling through thousands of rows stays smooth regardless of dataset size.
- **Infinite date axis** — the column window extends automatically as the user scrolls left or right, with no hard boundaries and no pagination.
- **requestAnimationFrame batching** — ghost rendering and scroll updates are coalesced into single rAF callbacks.

### Drag & Drop
- **Smooth animated moves** — events interpolate to their new position after being dropped.
- **Snap-back on conflict** — if the server rejects a move (overlap race condition), the event animates back to its original position.
- **Client-side overlap guard** — overlap is checked locally before the drop is submitted, giving instant feedback without a round-trip.
- **Edge auto-scroll** — dragging near the viewport edge scrolls the calendar in both axes at a speed proportional to proximity.

### Real-time sync
- Changes made by any client appear on all connected clients within ~2 seconds, with smooth move animation applied automatically.
- Dual transport: **WebSocket + Redis** (multi-process) or **SSE** (zero-dependency single-process).

### Mobile & Browser
- Adapted for all modern browsers (Chrome, Firefox, Safari, Edge) and mobile devices (iOS, Android).
- **Touch scrolling** — swipe gestures pan the grid in both axes.
- **Long-press to drag** — hold an event for 350 ms to start dragging; the device vibrates briefly to confirm.
- **Tap to edit** — tap an event to switch its type via popup.
- Full touch pipeline: move, end, and cancel are handled; scroll and drag modes are cleanly separated with no gesture conflicts.

### Other
- Three event states: **Booked** (blue), **Maintenance** (red), **Empty** (yellow).
- REST API for rooms and events.
- Seed command to generate 1 000 rows with realistic data.

## Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12, Django 6, Django Channels 4, Daphne 4 |
| Database | MySQL 8 |
| Cache / WS broker | Redis 7 |
| Frontend | Vanilla JS (ES modules), Canvas 2D API |
| Container | Docker, docker-compose |

## Architecture

```
bigCalendar/
  models.py              # Room, Event
  repositories/          # DB queries
  services/              # Business logic + polling (every 2s)
  consumers.py           # WebSocket consumer
  views.py               # REST API + SSE + index
  static/bigCalendar/js/ # config, api, store, websocket, scroll, renderer, drag, main
  templates/             # index.html
bigCalendar_app/
  settings.py            # reads env vars; CHANNEL_LAYERS → redis:6379 or in-memory
  config.py              # REALTIME_TRANSPORT, JS_VERSION
  asgi.py                # ProtocolTypeRouter
```

## Getting Started

### Prerequisites

- Docker ≥ 24 and docker-compose v2
- Python 3.12 (only needed for local development outside Docker)

### Environment variables

Copy and fill in `.env` before starting the stack:

```env
# Required
SECRET_KEY=replace-with-a-long-random-string
API_KEY=replace-with-a-long-random-string

# Database (must match docker-compose.prod.yml MySQL config)
DB_NAME=bigcalendar
DB_USER=bigcalendar
DB_PASSWORD=change_me
DB_HOST=mysql
DB_PORT=3306

# Optional
DEBUG=False
```

### Run

```bash
docker-compose -f docker-compose.prod.yml up --build -d
```

### Migrations

Run once after the first start (and after each schema change):

```bash
docker-compose -f docker-compose.prod.yml exec bigcalendar python manage.py migrate
```

### Seed data

```bash
docker-compose -f docker-compose.prod.yml exec bigcalendar python manage.py seed_data          # seed 1000 rows + events
docker-compose -f docker-compose.prod.yml exec bigcalendar python manage.py seed_data --clear  # drop and re-seed
```

The app is available at `http://localhost:8000`.

## API

All write endpoints require the `X-API-Key` header matching the `API_KEY` env var.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/rooms/` | List all rows |
| GET | `/api/events/?start=YYYY-MM-DD&end=YYYY-MM-DD` | Events for date range |
| PATCH | `/api/events/<id>/` | Update event type or position |

## WebSocket

Connect to `ws://localhost:8000/ws/events/` to receive real-time updates.

Payload on change:
```json
{ "type": "events_changed", "events": [...] }
```

## Realtime Transport

Controlled by `REALTIME_TRANSPORT` in `bigCalendar_app/config.py`:

| Value | Default | Requires |
|---|---|---|
| `redis` | yes | Redis container, Django Channels |
| `sse` | no | Nothing extra |

### When to use `redis`
- Multiple server processes / workers
- You already have Redis in your infrastructure

### When to use `sse`
- Single-process deployment (one Daphne instance)
- You want to eliminate the Redis dependency

Both modes poll the database every 2 seconds and push changes to all connected clients. The user experience is identical.

## Database Schema

```sql
calendar_room:  id, name
calendar_event: id, room_id (FK), event_type ENUM(empty, booked, maintenance),
                event_start DATE, event_end DATE,
                updated_at DATETIME ON UPDATE CURRENT_TIMESTAMP
```

## License

Business Source License 1.1 (BSL)

- Free for non-commercial use
- Commercial use requires a separate license — contact zckernel@gmail.com
- Converts to MIT on 2036-01-01
