# bigCalendar

A real-time room booking calendar built with Django Channels, WebSockets, and a Canvas-based frontend.

## Features

- Canvas-rendered calendar for 1000 rooms across a 360-day range (±180 days from today)
- Real-time updates via WebSocket — event changes propagate to all clients within ~2 seconds
- Three event types: **Booked** (blue), **Maintenance** (red), **Empty** (yellow)
- Vertical scroll (rooms) and horizontal scroll (dates)
- REST API for rooms and events

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
