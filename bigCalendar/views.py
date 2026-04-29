import asyncio
import json
from datetime import date, datetime, timezone
from django.conf import settings
from django.http import JsonResponse, StreamingHttpResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET
from asgiref.sync import sync_to_async
from bigCalendar.services import room_service, event_service


def index(request):
    return render(request, 'bigCalendar/index.html', {
        'realtime_transport': settings.REALTIME_TRANSPORT,
        'js_version': settings.JS_VERSION,
    })


async def api_stream(request):
    get_updated = sync_to_async(event_service.get_events_updated_since)

    async def stream():
        last_check = datetime.now(timezone.utc)
        while True:
            await asyncio.sleep(2)
            now = datetime.now(timezone.utc)
            events = await get_updated(last_check)
            last_check = now
            if events:
                data = json.dumps({'type': 'events_changed', 'events': events})
                yield f'data: {data}\n\n'
            else:
                yield ': heartbeat\n\n'

    response = StreamingHttpResponse(stream(), content_type='text/event-stream')
    response['Cache-Control'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'
    return response


@require_GET
def api_rooms(request):
    rooms = room_service.get_all_rooms()
    return JsonResponse({'rooms': rooms})


@require_GET
def api_events(request):
    try:
        start = date.fromisoformat(request.GET['start'])
        end = date.fromisoformat(request.GET['end'])
    except (KeyError, ValueError):
        return JsonResponse({'error': 'start and end required (YYYY-MM-DD)'}, status=400)

    events = event_service.get_events_for_range(start, end)
    return JsonResponse({'events': events})


@csrf_exempt
def api_event_update(request, event_id):
    if request.method != 'PATCH':
        return JsonResponse({'error': 'method not allowed'}, status=405)
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'invalid json'}, status=400)

    if 'event_type' in body:
        event, err = event_service.update_event_type(event_id, body['event_type'])
        if err == 'not found':
            return JsonResponse({'error': err}, status=404)
        if err:
            return JsonResponse({'error': err}, status=400)
        return JsonResponse({'event': event})

    if 'room_id' in body:
        try:
            room_id = int(body['room_id'])
            start = date.fromisoformat(body['event_start'])
            end = date.fromisoformat(body['event_end'])
        except (KeyError, ValueError):
            return JsonResponse({'error': 'room_id, event_start, event_end required'}, status=400)
        event, err = event_service.move_event(event_id, room_id, start, end)
        if err == 'not found':
            return JsonResponse({'error': err}, status=404)
        if err == 'overlap':
            return JsonResponse({'error': err}, status=409)
        if err:
            return JsonResponse({'error': err}, status=400)
        return JsonResponse({'event': event})

    return JsonResponse({'error': 'event_type or room_id required'}, status=400)
