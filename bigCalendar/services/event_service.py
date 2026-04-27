from datetime import date, datetime, timezone
from bigCalendar.repositories import event_repository


def get_events_for_range(start: date, end: date):
    rows = event_repository.get_by_date_range(start, end)
    return [_serialize(r) for r in rows]


def get_events_updated_since(since_dt: datetime):
    rows = event_repository.get_updated_since(since_dt)
    return [_serialize(r) for r in rows]


def _serialize(row):
    return {
        'id': row['id'],
        'room_id': row['room_id'],
        'event_type': row['event_type'],
        'event_start': row['event_start'].isoformat(),
        'event_end': row['event_end'].isoformat(),
    }
