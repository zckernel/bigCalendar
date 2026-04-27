import json
from datetime import date
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET
from bigCalendar.services import room_service, event_service


def index(request):
    return render(request, 'bigCalendar/index.html')


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
        event_type = body['event_type']
    except (json.JSONDecodeError, KeyError):
        return JsonResponse({'error': 'event_type required'}, status=400)

    event, err = event_service.update_event_type(event_id, event_type)
    if err == 'not found':
        return JsonResponse({'error': err}, status=404)
    if err:
        return JsonResponse({'error': err}, status=400)
    return JsonResponse({'event': event})
