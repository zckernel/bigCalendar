from django.db import transaction
from bigCalendar.models import Event


def _event_to_dict(event):
    return {
        'id': event.id,
        'room_id': event.room_id,
        'event_type': event.event_type,
        'event_start': event.event_start,
        'event_end': event.event_end,
    }


def get_by_date_range(date_start, date_end):
    return list(
        Event.objects
        .filter(event_start__lte=date_end, event_end__gte=date_start)
        .values('id', 'room_id', 'event_type', 'event_start', 'event_end')
    )


def get_updated_since(since_dt):
    return list(
        Event.objects
        .filter(updated_at__gt=since_dt)
        .values('id', 'room_id', 'event_type', 'event_start', 'event_end')
    )


def update_type(event_id, event_type):
    with transaction.atomic():
        event = Event.objects.select_for_update().filter(pk=event_id).first()
        if event is None:
            return None
        event.event_type = event_type
        event.save(update_fields=['event_type', 'updated_at'])
        return _event_to_dict(event)


def check_overlap(room_id, start, end, exclude_id):
    return Event.objects.filter(
        room_id=room_id,
        event_start__lte=end,
        event_end__gte=start,
    ).exclude(pk=exclude_id).exists()


def update_position(event_id, room_id, start, end):
    with transaction.atomic():
        event = Event.objects.select_for_update().filter(pk=event_id).first()
        if event is None:
            return None
        event.room_id = room_id
        event.event_start = start
        event.event_end = end
        event.save(update_fields=['room_id', 'event_start', 'event_end', 'updated_at'])
        return _event_to_dict(event)
