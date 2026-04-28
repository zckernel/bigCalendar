import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'bigCalendar_app.settings')
django.setup()

from django.conf import settings
from django.core.asgi import get_asgi_application
from django.contrib.staticfiles.handlers import ASGIStaticFilesHandler

if settings.REALTIME_TRANSPORT == 'redis':
    from channels.routing import ProtocolTypeRouter, URLRouter
    from channels.auth import AuthMiddlewareStack
    import bigCalendar.routing

    application = ProtocolTypeRouter({
        'http': ASGIStaticFilesHandler(get_asgi_application()),
        'websocket': AuthMiddlewareStack(
            URLRouter(bigCalendar.routing.websocket_urlpatterns)
        ),
    })
else:
    application = ASGIStaticFilesHandler(get_asgi_application())
