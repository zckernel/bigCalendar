from django.conf import settings
from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='calendar_index'),
    path('api/rooms/', views.api_rooms, name='api_rooms'),
    path('api/events/', views.api_events, name='api_events'),
    path('api/events/<int:event_id>/', views.api_event_update, name='api_event_update'),
]

if settings.REALTIME_TRANSPORT == 'sse':
    urlpatterns += [path('api/stream/', views.api_stream, name='api_stream')]
