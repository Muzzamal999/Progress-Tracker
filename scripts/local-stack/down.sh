#!/usr/bin/env bash
pkill -f "local-stack/proxy.mjs" 2>/dev/null || true
docker rm -f sja-testdb sja-gotrue sja-postgrest >/dev/null 2>&1 || true
echo "local stack stopped"
