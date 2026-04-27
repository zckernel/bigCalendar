from datetime import date
from django.http import JsonResponse
from django.shortcuts import render
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
