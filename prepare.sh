#!/usr/bin/env bash
set -euo pipefail

# The data directories are bind mounted into containers that run as their own
# users, so each one is handed to the uid that actually writes it rather than
# being made world-writable.
#
#   mongo:latest   runs mongod as uid 999 (mongodb)
#   dragonfly      runs as root
#   signal-cli     runs as root and owns ./config

mkdir -p ./data/db ./data/configdb ./data/dragonfly ./config

sudo chown -R 999:999 ./data/db ./data/configdb
sudo chmod -R 750 ./data/db ./data/configdb

sudo chown -R 0:0 ./data/dragonfly ./config
sudo chmod -R 750 ./data/dragonfly ./config
