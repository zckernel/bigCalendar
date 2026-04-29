#!/usr/bin/env bash
set -e

exec daphne -b 0.0.0.0 -p 8000 bigCalendar_app.asgi:application