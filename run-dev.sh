#!/usr/bin/env bash
set -e

pip install -r requirements.txt

exec daphne -b 0.0.0.0 -p 8000 bigCalendar_app.asgi:application