#!/bin/bash
set -e

cd /opt/bigCalendar

git pull

docker compose -f docker-compose.prod.yml up -d --build

docker compose -f docker-compose.prod.yml exec -T bigcalendar \
  python manage.py migrate --noinput

docker compose -f docker-compose.prod.yml exec -T bigcalendar \
  python manage.py collectstatic --noinput

sudo nginx -t && sudo systemctl reload nginx

