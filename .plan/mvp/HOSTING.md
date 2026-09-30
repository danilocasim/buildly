# Hosting and infrastructure

Where each part of Buildly runs, what it costs, and how to set it up. Prices were checked on 2026-09-30 and are approximate; recheck before committing. Decisions are recorded in [`DECISIONS.md`](DECISIONS.md) as D13–D15.

## 1. The stack

| Purpose | Service | Plan |
| --- | --- | --- |
| Web app, worker, and Postgres | Railway | Hobby at $5/month with $5 of usage included, then billed per second for CPU, memory, and disk |
| Snapshot and export ZIP storage | AWS S3 | Pay as you go, about $0.025 per GB stored, first 100 GB of downloads free each month |
| Magic-link email | Resend | Free, 3,000 emails a month and 100 a day |
| DNS, TLS, and domain | Cloudflare | Free, plus about $12 a year for the domain |
| AI generation | OpenAI API | Pay per token, about $0.04 per build with model routing, $0.12 if the flagship does everything |
| Previews on phone (Expo Go) | Expo Snack | Free, hosted by Expo |
| Web preview player | Self-hosted build of Snack's web player (D18), static files on its own domain | Static hosting (Cloudflare Pages or S3; chosen in TODO 4b.0.1), about $0 |
| Error alerts | Sentry | Free tier |
| Payments after the beta | Stripe | No monthly fee, 2.9% + $0.30 per charge |

Region: **Singapore** for Railway and S3, closest to the first users.

## 2. Cost

### Beta, 10 users

| Item | Monthly |
| --- | --- |
| Railway web app (about 0.5 vCPU, 0.5 GB) | $15 |
| Railway worker (1 vCPU, 2 GB, mostly idle) | $15–25 |
| Railway Postgres (small instance and volume) | $5–10 |
| Railway staging, sleeping when idle | $5–10 |
| OpenAI (10 users × about 30 builds × $0.04; $36 without routing) | $12 |
| AWS S3 | under $1 |
| Domain | about $1 |
| Resend, Cloudflare, Snack, Sentry | $0 |
| **Total** | **about $55–75** |

### After launch, about 100 users with 20 on Pro

| Item | Monthly |
| --- | --- |
| Railway, larger worker | $60–80 |
| OpenAI (80 Free × about 10 builds + 20 Pro × about 80 builds, at $0.04) | about $96 |
| AWS S3 | about $1 |
| Everything else | $0 to a few dollars |
| **Total** | **about $160–180** |
| Revenue from 20 Pro subscribers | $240 |

OpenAI is the only line that grows with usage, and model routing is what keeps it affordable. Without routing, the same 2,400 builds cost about $290, more than the revenue. The evaluation harness decides whether the small model can handle edits (EVAL.md, decision P3); if it cannot, the Pro guardrail in the brief applies.

## 3. Setup

### Railway

- One project with two environments: **staging** and **production** (TODO 9.1.1).
- Three services per environment:
  - `web`: `apps/web`, Next.js, public domain via Cloudflare.
  - `worker`: `apps/worker`, built from the Dockerfile in TODO 2.5.3 with the foundation's `node_modules` pre-installed; no public domain; at least **2 GB memory** for the type checker.
  - `postgres`: Railway's managed Postgres.
- Region: Southeast Asia (Singapore).
- Staging services sleep when idle to save cost.
- Set a monthly usage limit and billing alert in the Railway dashboard.

### AWS S3

- One bucket per environment, for example `buildly-staging` and `buildly-prod`, in `ap-southeast-1`.
- Block Public Access on. Default encryption (SSE-S3) on.
- Object layout:

  ```
  snapshots/{projectId}/{snapshotId}.json    kept indefinitely; restore depends on them
  exports/{projectId}/{exportId}.zip          deleted after 7 days by lifecycle rule
  ```

- Lifecycle rule: expire objects under `exports/` after 7 days. Exports can always be rebuilt from the snapshot.
- Users download exports through short-lived presigned URLs (TODO 3.3.1); no bucket CORS is needed for a plain download link.
- Access: one IAM user per environment, limited to its bucket. Keys go into Railway environment variables only. Rotate them if they ever leak, and at least yearly.

  ```json
  {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
        "Resource": "arn:aws:s3:::buildly-prod/*"
      },
      {
        "Effect": "Allow",
        "Action": ["s3:ListBucket"],
        "Resource": "arn:aws:s3:::buildly-prod"
      }
    ]
  }
  ```

- Set an AWS Budgets alert (for example $5/month) so an unexpected spike is visible.
- Local development keeps using MinIO in docker-compose.

### Resend

- Verify the sending domain and add its SPF and DKIM records in Cloudflare DNS.
- Use a subdomain for sending, for example `mail.<domain>`, so the root domain's reputation stays separate.
- The free tier's 100 emails a day is plenty for an invite-only beta. Move to the paid plan before public launch.

### Cloudflare

- Registrar and DNS for the domain.
- Point `app.<domain>` and `staging.<domain>` at the Railway `web` services; SSL mode **Full (strict)**.
- The staging domain must exist in week 1 because the Snack embed spike runs on it (SPIKES.md S1).

### OpenAI

- One OpenAI Platform project per environment (`buildly-staging`, `buildly-prod`), each with its own project API key. The key goes only into the `worker` service, never into the web app, client code, Snack sessions, or exports (TODO 7.2.1, 6.3.3).
- Set a monthly budget and alert on each project in the OpenAI dashboard, for example $20 for staging and $50 for production during the beta.
- Start with $5–10 of prepaid credit; enough for the spike, the evaluation runs, and dozens of test builds.
- New accounts start on a low usage tier with tighter rate limits. Check the tokens-per-minute limit for the chosen models before the beta, since several users building at once can hit it; the tier rises as spend accumulates.
- Model names live in `GENERATION_MODEL_PLAN` and `GENERATION_MODEL_EDIT`, so switching models is a config change.
- Watch spend against the `generations.cost_usd` totals on `/admin/metrics`.

### Sentry

- One project each for `web` and `worker`, free tier.
- Alert on new worker exceptions and on generation failure rate above 50% in an hour (TODO 9.1.3).

### Stripe (after the beta)

- Not needed for the MVP. Added with the billing backlog item.

## 4. Environment variables by service

| Variable | web | worker | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | yes | Railway Postgres reference variable |
| `STORAGE_REGION` | yes | yes | `ap-southeast-1` |
| `STORAGE_BUCKET` | yes | yes | Per environment |
| `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` | yes | yes | IAM user limited to the bucket |
| `STORAGE_ENDPOINT` | local only | local only | Empty for real S3; `http://localhost:9000` for MinIO |
| `OPENAI_API_KEY` | no | yes | The web app never calls OpenAI directly |
| `OPENAI_BASE_URL` | no | optional | Only for a proxy or a test server |
| `GENERATION_MODEL_PLAN`, `GENERATION_MODEL_EDIT` | no | yes | Model names are config, not code |
| `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM` | yes | no | Resend |
| `SESSION_SECRET` | yes | no | |
| `APP_URL` | yes | yes | Used in magic links and export READMEs |
| `SNACK_SDK_VERSION` | yes | yes | Pinned from `foundation.json` |
| `SENTRY_DSN` | yes | yes | Separate DSN per service |

## 5. Alternatives considered

| Option | Beta monthly | Setup effort | When to choose it |
| --- | --- | --- | --- |
| **Railway + S3** (chosen) | $55–75 | Hours | Default for the beta |
| AWS Lightsail (containers + managed Postgres) | $100–105 | About a day | Want everything in AWS with flat pricing |
| AWS ECS Fargate + RDS + ALB | $130–145 | Several days | Have AWS credits or already run production on AWS; best long-term scaling |
| Vercel for web + Railway for worker | $75–95 | Hours | Want per-PR preview deployments; worker still cannot run on serverless |
| Single VPS | $10–20 | Days, ongoing | Not recommended; you own backups, TLS, and patching |
| Cloudflare R2 instead of S3 | same | same | Only if downloads reach hundreds of GB a month; R2 egress is free |

ECS Fargate pitfalls if you move later: put tasks in public subnets or use VPC endpoints, since a NAT gateway alone adds about $33 a month; request SES production access about a day before relying on it for email.

## 6. Moving to AWS later

The app is portable by design, so a move is mechanical:

1. Push the `web` and `worker` images to ECR and run them on ECS Fargate (or Lightsail).
2. `pg_dump` from Railway Postgres and restore into RDS.
3. S3 stays as is. Replace the IAM user keys with ECS task roles.
4. Repoint the Cloudflare DNS records.

Revisit when paying users justify it or when AWS credits become available.

## 7. Sources

- [Railway pricing](https://railway.com/pricing)
- [Amazon S3 pricing](https://aws.amazon.com/s3/pricing/)
- [Resend pricing](https://resend.com/pricing)
- [OpenAI API pricing](https://developers.openai.com/api/docs/pricing)
- [AWS Fargate pricing](https://aws.amazon.com/fargate/pricing/)
- [Amazon Lightsail pricing](https://aws.amazon.com/lightsail/pricing/)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
