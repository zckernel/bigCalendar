#!/bin/bash
set -e

cd /opt/bigCalendar

git pull

docker compose -f docker-compose.prod.yml up -d

docker compose -f docker-compose.prod.yml exec -T bigcalendar \
  python manage.py collectstatic --noinput