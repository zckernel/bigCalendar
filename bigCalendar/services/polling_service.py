import asyncio
from datetime import datetime, timezone
from channels.layers import get_channel_layer
from bigCalendar.services.event_service import get_events_updated_since

POLL_INTERVAL = 2


async def polling_loop():
    channel_layer = get_channel_layer()
    last_check = datetime.now(tz=timezone.utc)

    while True:
        await asyncio.sleep(POLL_INTERVAL)
        now = datetime.now(tz=timezone.utc)
        events = await asyncio.to_thread(get_events_updated_since, last_check)
        last_check = now

        if events:
            await channel_layer.group_send('events', {
                'type': 'event_update',
                'data': {'type': 'events_changed', 'events': events},
            })
