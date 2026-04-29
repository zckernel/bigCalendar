import asyncio
import json
from channels.generic.websocket import AsyncWebsocketConsumer
from bigCalendar.services.polling_service import polling_loop

_poll_task: asyncio.Task | None = None
_client_count = 0
_lock: asyncio.Lock | None = None


def _get_lock() -> asyncio.Lock:
    global _lock
    if _lock is None:
        _lock = asyncio.Lock()
    return _lock


class EventConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        global _poll_task, _client_count
        await self.channel_layer.group_add('events', self.channel_name)
        await self.accept()
        async with _get_lock():
            _client_count += 1
            if _poll_task is None or _poll_task.done():
                _poll_task = asyncio.create_task(polling_loop())

    async def disconnect(self, code):
        global _poll_task, _client_count
        await self.channel_layer.group_discard('events', self.channel_name)
        async with _get_lock():
            _client_count = max(0, _client_count - 1)
            if _client_count == 0 and _poll_task and not _poll_task.done():
                _poll_task.cancel()
                _poll_task = None

    async def event_update(self, message):
        await self.send(json.dumps(message['data']))
