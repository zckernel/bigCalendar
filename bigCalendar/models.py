from django.db import models


class Room(models.Model):
    name = models.CharField(max_length=64)

    class Meta:
        db_table = 'calendar_room'


class Event(models.Model):
    TYPE_EMPTY = 'empty'
    TYPE_BOOKED = 'booked'
    TYPE_MAINTENANCE = 'maintenance'
    EVENT_TYPES = [
        (TYPE_EMPTY, 'Empty'),
        (TYPE_BOOKED, 'Booked'),
        (TYPE_MAINTENANCE, 'Maintenance'),
    ]

    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='events')
    event_type = models.CharField(max_length=16, choices=EVENT_TYPES)
    event_start = models.DateField()
    event_end = models.DateField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'calendar_event'
        indexes = [
            models.Index(fields=['room', 'event_start', 'event_end']),
            models.Index(fields=['updated_at']),
        ]
