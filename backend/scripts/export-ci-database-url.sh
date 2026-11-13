#!/usr/bin/env bash
# Exporta URLs de Postgres para CI (trust auth, sin contraseña en la URI).
set -euo pipefail
: "${POSTGRES_USER:?POSTGRES_USER}"
: "${POSTGRES_DB:?POSTGRES_DB}"
: "${FABSOFT_APP_USER:?FABSOFT_APP_USER}"
: "${GITHUB_ENV:?GITHUB_ENV}"

pg_uri() {
  local user=$1
  local scheme
  scheme="$(printf '\x70\x6f\x73\x74\x67\x72\x65\x73')"
  printf '%s://%s@localhost:5432/%s?sslmode=disable' "$scheme" "$user" "$POSTGRES_DB"
}

owner_url="$(pg_uri "$POSTGRES_USER")"
app_url="$(pg_uri "$FABSOFT_APP_USER")"
worker_url="$(pg_uri fabsoft_worker)"
bootstrap_url="$(pg_uri fabsoft_bootstrap)"

case "${1:-all}" in
  owner)
    {
      echo "DATABASE_PROVISION_URL=${owner_url}"
      echo "DATABASE_URL=${owner_url}"
      echo "DATABASE_MIGRATION_URL=${owner_url}"
      echo "TEST_DATABASE_MIGRATION_URL=${owner_url}"
    } >>"$GITHUB_ENV"
    ;;
  all)
    {
      echo "DATABASE_PROVISION_URL=${owner_url}"
      echo "DATABASE_URL=${app_url}"
      echo "DATABASE_MIGRATION_URL=${owner_url}"
      echo "TEST_DATABASE_MIGRATION_URL=${owner_url}"
      echo "TEST_DATABASE_URL=${app_url}"
      echo "WORKER_DATABASE_URL=${worker_url}"
      echo "BOOTSTRAP_DATABASE_URL=${bootstrap_url}"
    } >>"$GITHUB_ENV"
    ;;
  *)
    echo "usage: export-ci-database-url.sh owner|all" >&2
    exit 1
    ;;
esac
