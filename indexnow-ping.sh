#!/usr/bin/env bash
# Ping IndexNow after deploy so Bing/Yandex pick up changes faster.
# Usage: ./indexnow-ping.sh

KEY="quietfocus2026indexnow"
HOST="www.quietfocusai.com"
BASE="https://${HOST}"

URLS=(
  "${BASE}/"
  "${BASE}/live-demo.html"
  "${BASE}/about-quiet.html"
  "${BASE}/contact.html"
  "${BASE}/privacy.html"
  "${BASE}/terms.html"
)

JSON='{"host":"'"${HOST}"'","key":"'"${KEY}"'","keyLocation":"'"${BASE}/${KEY}.txt'","urlList":['
for i in "${!URLS[@]}"; do
  [[ $i -gt 0 ]] && JSON+=','
  JSON+='"'"${URLS[$i]}"'"'
done
JSON+=']}'

curl -sS -X POST "https://api.indexnow.org/indexnow" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d "${JSON}"

echo ""
echo "IndexNow ping sent for ${#URLS[@]} URLs."
