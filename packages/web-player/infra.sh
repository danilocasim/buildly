#!/usr/bin/env bash
# One-time AWS setup for the web player host (TODO 4b.0.1, HOSTING.md): a private S3 bucket
# behind a CloudFront distribution with origin access control. Idempotent: re-running reuses
# what exists. Needs an admin profile (the app's keys only reach the snapshot bucket).
#
#   AWS_PROFILE=buildly-admin sh infra.sh
#
# Prints the distribution's domain, which becomes SNACK_WEB_PLAYER_URL=https://<domain>/v2/%%SDK_VERSION%%.
set -euo pipefail

export AWS_PROFILE=${AWS_PROFILE:-buildly-admin}
region=${PLAYER_REGION:-ap-southeast-1}
bucket=${PLAYER_BUCKET:-buildly-web-player}
tags="project=buildly"

account=$(aws sts get-caller-identity --query Account --output text)
echo "account $account, region $region, bucket $bucket"

# Bucket: private, encrypted, tagged for the buildly budget. No website hosting: CloudFront reads it.
if ! aws s3api head-bucket --bucket "$bucket" 2>/dev/null; then
  aws s3api create-bucket --bucket "$bucket" --region "$region" \
    --create-bucket-configuration LocationConstraint="$region" >/dev/null
  echo "created bucket $bucket"
fi
aws s3api put-public-access-block --bucket "$bucket" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-encryption --bucket "$bucket" --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws s3api put-bucket-tagging --bucket "$bucket" --tagging "TagSet=[{Key=project,Value=buildly}]"

# Origin access control: CloudFront signs its requests to the bucket.
oac_id=$(aws cloudfront list-origin-access-controls \
  --query "OriginAccessControlList.Items[?Name=='$bucket'].Id | [0]" --output text)
if [ -z "$oac_id" ] || [ "$oac_id" = None ]; then
  oac_id=$(aws cloudfront create-origin-access-control --origin-access-control-config \
    "Name=$bucket,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3" \
    --query OriginAccessControl.Id --output text)
  echo "created origin access control $oac_id"
fi

# Distribution: HTTPS only, GET/HEAD, compression, the managed CachingOptimized policy (the
# export's assets are content-hashed; index.html is uploaded with no-cache by deploy.sh).
dist_id=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='$bucket'].Id | [0]" --output text)
if [ -z "$dist_id" ] || [ "$dist_id" = None ]; then
  config=$(cat <<EOF
{
  "CallerReference": "$bucket-$(date +%s)",
  "Comment": "$bucket",
  "Enabled": true,
  "HttpVersion": "http2and3",
  "IsIPV6Enabled": true,
  "PriceClass": "PriceClass_All",
  "DefaultRootObject": "",
  "Origins": {
    "Quantity": 1,
    "Items": [
      {
        "Id": "s3",
        "DomainName": "$bucket.s3.$region.amazonaws.com",
        "OriginAccessControlId": "$oac_id",
        "S3OriginConfig": { "OriginAccessIdentity": "" }
      }
    ]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "s3",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": { "Quantity": 2, "Items": ["GET", "HEAD"], "CachedMethods": { "Quantity": 2, "Items": ["GET", "HEAD"] } },
    "Compress": true,
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }
}
EOF
)
  dist_id=$(aws cloudfront create-distribution-with-tags --distribution-config-with-tags \
    "{\"DistributionConfig\": $config, \"Tags\": {\"Items\": [{\"Key\": \"project\", \"Value\": \"buildly\"}]}}" \
    --query Distribution.Id --output text)
  echo "created distribution $dist_id"
fi
dist_arn="arn:aws:cloudfront::$account:distribution/$dist_id"
domain=$(aws cloudfront get-distribution --id "$dist_id" --query Distribution.DomainName --output text)

# Only that distribution may read the bucket.
aws s3api put-bucket-policy --bucket "$bucket" --policy "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [{
    \"Sid\": \"AllowCloudFrontRead\",
    \"Effect\": \"Allow\",
    \"Principal\": { \"Service\": \"cloudfront.amazonaws.com\" },
    \"Action\": \"s3:GetObject\",
    \"Resource\": \"arn:aws:s3:::$bucket/*\",
    \"Condition\": { \"StringEquals\": { \"AWS:SourceArn\": \"$dist_arn\" } }
  }]
}"

echo "distribution $dist_id: https://$domain (status $(aws cloudfront get-distribution --id "$dist_id" --query Distribution.Status --output text))"
echo "SNACK_WEB_PLAYER_URL=https://$domain/v2/%%SDK_VERSION%%"
