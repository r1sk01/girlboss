#!/usr/bin/env bash
set -euo pipefail

git pull origin master
docker compose pull mongodb dragonfly
docker compose build --pull signal tritium web
docker compose up -d --remove-orphans
