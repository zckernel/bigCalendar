from bigCalendar.models import Event


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
    updated = Event.objects.filter(pk=event_id).update(event_type=event_type)
    if not updated:
        return None
    return Event.objects.filter(pk=event_id).values(
        'id', 'room_id', 'event_type', 'event_start', 'event_end'
    ).first()


def check_overlap(room_id, start, end, exclude_id):
    return Event.objects.filter(
        room_id=room_id,
        event_start__lte=end,
        event_end__gte=start,
    ).exclude(pk=exclude_id).exists()


def update_position(event_id, room_id, start, end):
    updated = Event.objects.filter(pk=event_id).update(
        room_id=room_id, event_start=start, event_end=end,
    )
    if not updated:
        return None
    return Event.objects.filter(pk=event_id).values(
        'id', 'room_id', 'event_type', 'event_start', 'event_end'
    ).first()
