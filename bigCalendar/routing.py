from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'^bigcalendar/ws/events/$', consumers.EventConsumer.as_asgi()),
]
