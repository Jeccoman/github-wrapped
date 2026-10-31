#!/bin/sh
set -e
: "${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN to a token with Account Analytics: Read}"
ACCOUNT="${CLOUDFLARE_ACCOUNT_ID:-52149a64c8a2dba44cd8a64f81e8ee6a}"
DAYS="${1:-7}"
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT/analytics_engine/sql" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  --data "SELECT blob1 AS route, blob2 AS kind, blob3 AS cache, SUM(_sample_interval) AS requests FROM github_wrapped WHERE timestamp > NOW() - INTERVAL '$DAYS' DAY GROUP BY route, kind, cache ORDER BY requests DESC FORMAT PrettyCompact"
