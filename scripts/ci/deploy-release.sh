#!/usr/bin/env bash
set -euo pipefail

base=/opt/digitalycloud-deploy
release_id="${1:?Release ID required}"
[[ "$release_id" =~ ^[0-9a-f]{40}-[0-9]+-[0-9]+$ ]] || {
  echo "Invalid release ID"
  exit 1
}

exec 9>"$base/deploy.lock"
flock -n 9 || { echo "Another deployment is running"; exit 1; }

archive="$base/incoming/$release_id.tar.gz"
release="$base/releases/$release_id"
test -f "$archive"
test ! -e "$release"

previous="$(readlink -f "$base/current")"
test -d "$previous"
mkdir "$release"

tar --no-same-owner --no-same-permissions -xzf "$archive" -C "$release"

for file in apps/backend/dist/server.js apps/backend/dist/worker.js \
  apps/frontend/.next/BUILD_ID node_modules/next/dist/bin/next; do
  test -f "$release/$file" || {
    echo "Incomplete release: $file"
    exit 1
  }
done

chmod -R a+rX "$release"
mkdir -p "$release/apps/frontend/.next/cache"
setfacl -R -m u:digitalycloud:rwX "$release/apps/frontend/.next"
find "$release/apps/frontend/.next" -type d \
  -exec setfacl -m d:u:digitalycloud:rwx {} +

switch_to() {
  ln -s "$1" "$base/current.next"
  mv -Tf "$base/current.next" "$base/current"
}

restart_apps() {
  sudo -n /usr/bin/systemctl restart \
    digitalycloud-api.service \
    digitalycloud-web.service \
    digitalycloud-worker.service
}

healthy() {
  local attempt code
  for attempt in $(seq 1 30); do
    if systemctl is-active --quiet digitalycloud-api.service &&
       systemctl is-active --quiet digitalycloud-web.service &&
       systemctl is-active --quiet digitalycloud-worker.service &&
       curl --noproxy '*' -fsS --connect-timeout 3 --max-time 15 \
         http://127.0.0.1:4000/v1/health/ready >/dev/null; then
      code="$(curl --noproxy '*' -sS --connect-timeout 3 --max-time 15 -o /dev/null -w '%{http_code}' \
        http://127.0.0.1:3000/ || true)"
      if [ "$code" = 200 ]; then
        return 0
      fi
    fi
    sleep 2
  done
  return 1
}

rollback() {
  trap - ERR INT TERM
  echo "Deployment failed; restoring $previous"
  switch_to "$previous"
  if restart_apps && healthy; then
    echo "Previous release restored"
  else
    echo "ROLLBACK NEEDS ATTENTION: check service logs"
  fi
  exit 1
}

trap rollback ERR INT TERM
switch_to "$release"
restart_apps
healthy
sleep 5
healthy
trap - ERR INT TERM

echo "Deployment successful: $release_id"
