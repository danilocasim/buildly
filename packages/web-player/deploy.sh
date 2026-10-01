#!/usr/bin/env bash
# Uploads dist/v2/<sdk>/ (from build.sh) to the player bucket and invalidates CloudFront.
#
#   AWS_PROFILE=buildly-admin sh deploy.sh
#
# Only the current SDK's folder is synced, so earlier v2/<sdk>/ folders stay for sessions
# still on them. Content-hashed assets get a long immutable cache; index.html and BUILD.json
# are never cached, so a redeploy is visible at once.
set -euo pipefail

export AWS_PROFILE=${AWS_PROFILE:-buildly-admin}
bucket=${PLAYER_BUCKET:-buildly-web-player}
here=$(cd "$(dirname "$0")" && pwd)
sdk=$(node -p "require('$here/../foundation/foundation.json').sdkVersion.split('.')[0]")
src=$here/dist/v2/$sdk
[ -f "$src/index.html" ] || { echo "deploy.sh: no build at $src; run build.sh first" >&2; exit 1; }

aws s3 sync "$src/" "s3://$bucket/v2/$sdk/" --delete \
  --exclude index.html --exclude BUILD.json \
  --cache-control "public, max-age=31536000, immutable"
aws s3 cp "$src/index.html" "s3://$bucket/v2/$sdk/index.html" --cache-control "no-cache" --content-type "text/html; charset=utf-8"
aws s3 cp "$src/BUILD.json" "s3://$bucket/v2/$sdk/BUILD.json" --cache-control "no-cache" --content-type "application/json"

dist_id=$(aws cloudfront list-distributions --query "DistributionList.Items[?Comment=='$bucket'].Id | [0]" --output text)
domain=$(aws cloudfront get-distribution --id "$dist_id" --query Distribution.DomainName --output text)
aws cloudfront create-invalidation --distribution-id "$dist_id" --paths "/v2/$sdk/*" --query Invalidation.Id --output text
echo "deployed v2/$sdk: https://$domain/v2/$sdk/index.html"
