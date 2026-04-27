import random
from datetime import date, timedelta
from django.core.management.base import BaseCommand
from django.db import transaction
from bigCalendar.models import Room, Event

TOTAL_ROOMS = 1000
ROOM_FRACTION = 0.30
DATE_RANGE_DAYS = 180
EVENT_TYPES = [Event.TYPE_EMPTY, Event.TYPE_BOOKED, Event.TYPE_MAINTENANCE]


class Command(BaseCommand):
    help = 'Seed 1000 rooms and events for 30% of them'

    def add_arguments(self, parser):
        parser.add_argument('--clear', action='store_true', help='Clear existing data first')

    def handle(self, *args, **options):
        if options['clear']:
            Event.objects.all().delete()
            Room.objects.all().delete()
            self.stdout.write('Cleared existing data.')

        self._seed_rooms()
        self._seed_events()

    def _seed_rooms(self):
        existing = Room.objects.count()
        if existing >= TOTAL_ROOMS:
            self.stdout.write(f'Rooms already exist ({existing}), skipping.')
            return

        rooms = [Room(name=f'Room_{i}') for i in range(1, TOTAL_ROOMS + 1)]
        Room.objects.bulk_create(rooms, ignore_conflicts=True)
        self.stdout.write(f'Created {TOTAL_ROOMS} rooms.')

    def _seed_events(self):
        if Event.objects.exists():
            self.stdout.write('Events already exist, skipping.')
            return

        today = date.today()
        range_start = today - timedelta(days=DATE_RANGE_DAYS)
        range_end = today + timedelta(days=DATE_RANGE_DAYS)

        all_room_ids = list(Room.objects.values_list('id', flat=True))
        selected_ids = random.sample(all_room_ids, k=int(len(all_room_ids) * ROOM_FRACTION))

        events = []
        for room_id in selected_ids:
            events.extend(_generate_room_events(room_id, range_start, range_end))

        with transaction.atomic():
            Event.objects.bulk_create(events, batch_size=2000)

        self.stdout.write(f'Created {len(events)} events for {len(selected_ids)} rooms.')


def _generate_room_events(room_id, range_start, range_end):
    events = []
    cursor = range_start + timedelta(days=random.randint(0, 10))

    while cursor < range_end:
        duration = random.randint(1, 30)
        event_end = cursor + timedelta(days=duration - 1)

        if event_end > range_end:
            break

        events.append(Event(
            room_id=room_id,
            event_type=random.choice(EVENT_TYPES),
            event_start=cursor,
            event_end=event_end,
        ))

        gap = random.randint(0, 5)
        cursor = event_end + timedelta(days=1 + gap)

    return events
