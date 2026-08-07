#!/bin/sh
set -eu
echo "[cron-sim] simulating Cloud Scheduler, hitting $APP_URL every ${INTERVAL_SECONDS}s"
while true; do
  for endpoint in $CRON_ENDPOINTS; do
    echo "[cron-sim] POST $APP_URL$endpoint"
    curl -s -o /dev/null -w "[cron-sim] %{url_effective} -> %{http_code}\n" \
      -X POST -H "Authorization: Bearer $CRON_SECRET" \
      "$APP_URL$endpoint" || echo "[cron-sim] app not reachable yet"
  done
  sleep "$INTERVAL_SECONDS"
done
