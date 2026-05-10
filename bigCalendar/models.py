from django.db import models


class Room(models.Model):
    name = models.CharField(max_length=64)

    class Meta:
        db_table = 'calendar_room'

    def __str__(self):
        return self.name


class Event(models.Model):
    class EventType(models.TextChoices):
        EMPTY = 'empty', 'Empty'
        BOOKED = 'booked', 'Booked'
        MAINTENANCE = 'maintenance', 'Maintenance'

    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='events')
    event_type = models.CharField(max_length=16, choices=EventType.choices)
    event_start = models.DateField()
    event_end = models.DateField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'calendar_event'
        indexes = [
            models.Index(fields=['event_start', 'event_end']),
            models.Index(fields=['room', 'event_start', 'event_end']),
            models.Index(fields=['updated_at']),
        ]

    def __str__(self):
        return f"{self.event_type} | room {self.room_id} | {self.event_start}–{self.event_end}"
