import asyncio
import json
import orjson
from datetime import date, datetime, timezone
from functools import wraps
from django.conf import settings
from django.http import HttpResponse, JsonResponse, StreamingHttpResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET
from asgiref.sync import sync_to_async
from bigCalendar.services import room_service, event_service


def _require_api_key(view_func):
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if request.headers.get('X-Api-Key') != settings.API_KEY:
            return JsonResponse({'error': 'forbidden'}, status=403)
        return view_func(request, *args, **kwargs)
    return wrapper


def index(request):
    return render(request, 'bigCalendar/index.html', {
        'realtime_transport': settings.REALTIME_TRANSPORT,
        'js_version': settings.JS_VERSION,
        'api_key': settings.API_KEY,
    })


async def api_stream(request):
    get_updated = sync_to_async(event_service.get_events_updated_since)

    async def stream():
        last_check = datetime.now(timezone.utc)
        try:
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
        except (GeneratorExit, asyncio.CancelledError):
            return

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

    import time
    t0 = time.perf_counter()
    events = event_service.get_events_for_range(start, end)
    t1 = time.perf_counter()
    body = orjson.dumps({'events': events})
    t2 = time.perf_counter()
    print(f'[events] db={t1-t0:.3f}s serial={t2-t1:.3f}s rows={len(events)}', flush=True)
    return HttpResponse(body, content_type='application/json')


@csrf_exempt
@_require_api_key
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
