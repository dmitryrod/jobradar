#!/bin/sh
set -e
# Профиль Chromium и очередь лежат на смонтированном volume ./data
mkdir -p /app/data/session
if [ "${SKIP_BOOTSTRAP:-}" != "1" ]; then
  node /app/scripts/bootstrap.mjs
fi
exec "$@"
