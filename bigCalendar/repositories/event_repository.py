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
