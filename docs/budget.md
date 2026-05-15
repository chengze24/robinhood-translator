# Project Budget — Robinhood Translator

Summer 2026 — estimated cost to build, deploy, and operate the project end-to-end.

## TL;DR

- **Realistic summer total: $50–150** out of pocket
- **AWS**: fully covered by your $120 in free credits (you'll likely have unused credit left over when they expire)
- **Anthropic API**: the only meaningful out-of-pocket cost
- **Everything else** (GitHub, VS Code, Claude Code, Chrome, all libraries): free

The Anthropic API dominates every other line item by 10–20×. AWS at this scale is essentially noise.

---

## Phase breakdown

| Phase | Weeks | Activity | Anthropic API | AWS | Notes |
|---|---|---|---|---|---|
| 1. Local dev MVP | 1–4 | Build extension + backend, test on yourself | $5–15 | $0 | Light usage, low volume |
| 2. User testing with dad | 4–8 | Dad uses daily, you iterate on prompt/UI | $15–40 | $0 | Real usage starts |
| 3. Feature expansion | 6–12 | RAG glossary, news digest, possibly full-page translation | $20–60 | $0–5 | Full-page mode is 3–5× base cost |
| 4. AWS deployment | 10–14 | Move backend to Lambda + DynamoDB + API Gateway | included above | $1–5/mo | Free tier covers most |

Totals across a 14-week summer: **~$50–150** with cost layers in place (cache, glossary, tiered models, prompt caching). Up to **~$300** if you implement full-page translation without careful cost control.

---

## Where the money goes

### Anthropic API (the real driver)

Per-call costs at Sonnet 4.6 pricing ($3/M input, $15/M output):

| Use case | Tokens in | Tokens out | Cost per call |
|---|---|---|---|
| Short selection (sentence) | ~250 | ~100 | $0.002 |
| Long selection (paragraph) | ~600 | ~300 | $0.006 |
| Stock page chunk | ~1000 | ~1500 | $0.025 |
| Full page (many chunks) | ~5000+ | ~7000+ | $0.10+ |

With caching + UI glossary + Haiku tier for routine text, multiply these by roughly 0.2–0.4. Prompt caching on the system prompt (~90% off cached tokens) shaves another chunk after that.

### AWS (after deployment)

Monthly cost at personal usage levels:

| Service | Monthly cost |
|---|---|
| Lambda | $0 (always-free tier: 1M requests + 400K GB-s) |
| API Gateway HTTP API | $0.01–0.10 |
| DynamoDB on-demand | $0–0.50 |
| CloudWatch logs | $0 (within 5 GB free tier) |
| Data transfer | $0 (first 100 GB out free) |
| **AWS subtotal** | **$0–2/month** |

Your $120 in credits would cover years of operation at this rate. The real risk is credits expiring before you spend them — check the dates in AWS Console → Billing → Credits.

---

## What's already paid for or free

- **GitHub**: free for public repos
- **VS Code**: free
- **Claude Code**: included in your existing Claude Pro plan
- **Chrome + DevTools**: free
- **Python, FastAPI, all libraries**: free
- **Embeddings for RAG**: free if using local FAISS or sentence-transformers; Voyage/OpenAI embeddings are pennies if you want a hosted vector DB
- **Domain name**: not needed; localhost during dev, AWS gives you a free `*.amazonaws.com` URL after deployment

---

## Billing alerts to set TODAY

Don't fly blind. A runaway bug (infinite loop, retry storm, accidentally not caching) can drain a budget in a day. Set hard alerts before you forget.

### Anthropic Console

1. Go to console.anthropic.com → Settings → **Usage Limits**
2. Set monthly spend cap: **$25**
3. Set email alert at: **$10**

### AWS Billing

1. AWS Console → **Billing & Cost Management → Budgets**
2. Create a budget: **$10/month**, email alert at 50% and 100%
3. Even though you have $120 credit, this is a runaway-loop safety net, not a spending plan

---

## Monitoring rhythm

Weekly habit during active development (Sunday evenings work well):

- **Anthropic Console → Usage**: check token spend, look for anomalies week-over-week
- **AWS Console → Cost Explorer**: check Lambda invocation counts and DynamoDB ops once you've deployed
- **Reality-check** against the phase estimates above at the end of each phase

If actuals diverge significantly (3×+ over budget), pause and diagnose before the next sprint.

---

## Worst-case scenarios to avoid

These are the things that would actually blow the budget:

- **Calling the API from the extension directly** — your API key gets extracted, someone runs up your bill. We're already avoiding this by routing through the backend.
- **No translation caching** — every page load re-translates everything. Easily 10× the cost.
- **GPU instances on EC2** — the thing that ate your free tier last time. Run local LLMs on your MacBook, not on AWS.
- **Forgetting a `while` loop in a fetch** — classic. Always add an `AbortController` or a request counter.
- **Publishing the extension publicly without rate limits** — strangers could drive your bill. Stay self-hosted/personal for now.
