#!/bin/sh
# Starts or stops docker-compose services. Prefers Docker Desktop's binary because a
# different `docker` (an npm documentation generator) can shadow it on PATH.
set -eu
DOCKER=${DOCKER:-docker}
[ -x /Applications/Docker.app/Contents/Resources/bin/docker ] && DOCKER=/Applications/Docker.app/Contents/Resources/bin/docker
case "${1:-}" in
  up) exec "$DOCKER" compose up -d --wait ;;
  down) exec "$DOCKER" compose down ;;
  *) echo "usage: services.sh up|down" >&2; exit 2 ;;
esac
