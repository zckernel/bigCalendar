from bigCalendar.models import Room


def get_all():
    return list(Room.objects.order_by('id').values('id', 'name'))
