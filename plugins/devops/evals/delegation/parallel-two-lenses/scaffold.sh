#!/usr/bin/env bash
set -e
git init -q . 2>/dev/null || true
git checkout -q -b eval/work 2>/dev/null || git switch -q -c eval/work
# Deliberately thin: the repo states what runs today and nothing about the
# options being weighed. The answer needs current provider pricing, residency
# and failover terms (outside the files) plus a trade-off argued both ways, so
# a model that answers from the files alone has nothing to answer with.
cat > README.md <<'MD'
# orders-api

Node 22 service on one VM, self-managed Postgres 15 (~40 GB, nightly pg_dump,
no replica). Customers are EU-based; a 4 h outage costs roughly 30k EUR in
refunds. One ops engineer, part time.
MD
cat > docker-compose.yml <<'YML'
services:
  db:
    image: postgres:15.8
    volumes: [pgdata:/var/lib/postgresql/data]
volumes: { pgdata: {} }
YML
git add -A && git -c user.email=eval@local -c user.name=eval commit -qm fixtures
