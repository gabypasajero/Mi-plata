#!/usr/bin/env bash
# Corre las migraciones y la prueba de seguridad en un Postgres local desechable.
set -euo pipefail
# initdb no corre como root
if [ "$(id -u)" = 0 ]; then exec runuser -u postgres -- "$0" "$@"; fi
cd "$(dirname "$0")/.."
PGBIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
DATA=$(mktemp -d)
trap '"$PGBIN/pg_ctl" -D "$DATA" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DATA"' EXIT
"$PGBIN/initdb" -D "$DATA" -U postgres >/dev/null
"$PGBIN/pg_ctl" -D "$DATA" -o "-k $DATA -p 54329 -c listen_addresses=''" -l "$DATA/log" start >/dev/null
PSQL=(psql -h "$DATA" -p 54329 -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f tests/supabase_stub.sql
for f in migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -f tests/rls_test.sql
