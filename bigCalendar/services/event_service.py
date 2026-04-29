from datetime import date, datetime, timezone
from bigCalendar.models import Event
from bigCalendar.repositories import event_repository


def get_events_for_range(start: date, end: date):
    rows = event_repository.get_by_date_range(start, end)
    return [_serialize(r) for r in rows]


VALID_TYPES = set(Event.EventType.values)


def update_event_type(event_id: int, event_type: str):
    if event_type not in VALID_TYPES:
        return None, 'invalid type'
    row = event_repository.update_type(event_id, event_type)
    if row is None:
        return None, 'not found'
    return _serialize(row), None


def move_event(event_id: int, room_id: int, start: date, end: date):
    if event_repository.check_overlap(room_id, start, end, event_id):
        return None, 'overlap'
    row = event_repository.update_position(event_id, room_id, start, end)
    if row is None:
        return None, 'not found'
    return _serialize(row), None


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
