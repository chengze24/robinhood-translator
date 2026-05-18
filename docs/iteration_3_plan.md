# Iteration 2 Retrospective + Iteration 3 Plan

## Iteration 2: Production deployment + hover UX

**Goal:** Get a real cloud-hosted version into dad's hands with hover-to-translate and a working solution for the news section.

**Outcome:** Shipped. Dad is using the extension on his Windows PC against an AWS-hosted backend.

### What we built

- **Phase A — AWS deployment.** SAM template (`backend/template.yaml`), Mangum adapter wrapping the FastAPI app for Lambda, IaC-driven deploy through CloudFormation. API Gateway HTTP API with CORS, Lambda with environment-variable secret, DynamoDB resource provisioned (unused so far).
- **Phase B — Hover-to-translate.** Two-second debounce on stable mouseover. Persistent hover tooltip (only replaced on next successful translation). Scrollable interior. Viewport-aware positioning that flips above the anchor when there's no room below.
- **Phase C — News section handling.** `resolveTextBlock()` detects the "card link overlay" pattern (empty `<a>` on top of sibling content) and walks up to the card container to extract title + summary.
- **Phase D — Install on dad's PC.** Packaged the extension folder, transferred, loaded as unpacked in Chrome dev mode. Dad is using it.

### What works

- Two independent tooltips (selection + hover) coexist correctly, per-tooltip generation counters prevent stale-response races.
- News card translation captures byline, time, ticker, title, and summary together.
- Selection still works on regular text as a power-user fallback.
- The `[a-zA-Z]{3,}` filter correctly skips UI chrome like `$0.00 ▼ 9.23%`.
- The cloud round trip (extension → API Gateway → Lambda → Anthropic → back) works reliably; cold start is ~7s, warm is 1–3s, dominated by LLM latency.
- The IaC pattern: every infrastructure change goes through `template.yaml` → `sam deploy`. CloudFormation stack reflects exactly what's in git.

### Bugs and gotchas encountered (great learning, in order found)

- **Mangum / Magnum typo** — installed the wrong package, would've crashed at import time on Lambda. Caught before deploy.
- **API key paste mangled** — SAM masks `NoEcho` parameters at the prompt now, so paste errors are invisible. Fixed via `sam deploy --parameter-overrides`.
- **Tooltip override** — selection and hover initially shared one DOM element; hover would overwrite the selection's translation. Fixed by using two separate tooltip elements.
- **News section empty `<a>`** — Robinhood's news cards use a stretched-link pattern. `textContent` of the link is empty; visible text lives in siblings. Fixed by walking upward when the hover target is an empty link.
- **Long translations overflowed the viewport** — fixed with `max-height: 280px` + `overflow-y: auto` plus viewport-fit positioning.
- **Hover tooltip vanished on mouseleave** — annoying because long translations need scrolling. Made the hover tooltip persistent (only replaced on next translation or dismissed via outside click).
- **LLM clarification responses** — for very short inputs like "Review order," Claude was returning "please provide content to translate" and the bad response was getting cached. Fixed by updating the system prompt to forbid clarification requests; also added a defensive English-word filter in the extension.
- **AWS new-account concurrency quota = 10** — blocks the `Reserved concurrency = 0` kill-switch trick. Known limitation; deferred (waiting for AWS to lift the quota naturally over time, or opening a Support case if needed).

### Known limitations / deferred

- **Kill switch** — blocked by the concurrency quota issue above. Anthropic spend cap + AWS billing alert are doing the actual cost-control work.
- **Update announcement** — when the service is down, dad sees generic "翻译失败." Better would be a typed `{status: "paused", message: "..."}` response handled distinctly in the extension.
- **Cold-start latency** — 7s on the first call of a new container. Acceptable for personal use; provisioned concurrency would fix it but isn't free.
- **CORS scoped to `https://robinhood.com` only** — if any Robinhood subdomain becomes load-bearing, we'll need to expand.

### Lessons that transferred from theory to lived experience

- **Real user feedback radically reshapes priorities.** The dad session pivoted the entire product framing from "translate everything" to "translate the content-heavy stuff." Building blindly would have wasted weeks.
- **Production bugs only surface with real usage.** The card-overlay pattern, the LLM clarification edge case, the AWS quota — none of these are theoretical. You only find them by shipping.
- **IaC is genuinely transformative.** Knowing the entire cloud setup can be recreated with one `sam deploy` from a git checkout changes how you think about infrastructure.
- **The diagnostic loop matters more than any single tool.** DevTools Network tab, CloudWatch logs, console logging, curl — none of them alone solves a bug; the muscle is knowing which to reach for.

---

## Iteration 3 Plan: Cost reduction

**Goal:** Reduce per-translation cost while maintaining quality. Target: ≥70% reduction in Anthropic spend at steady-state usage, measurable against a baseline.

**Estimated duration:** 2–3 weeks

### Why this, why now

Dad is actively using the extension. Every news card he hovers, every article he reads, costs ~half a cent. At his early-stage usage that's pennies a day, but as the tool becomes routine — and especially if it ever helps more than one user — the cost layers we deferred in iteration 1 become real. This iteration installs them.

Cost-reduction work is also strong portfolio material in a way that "ship a feature" isn't. "Cut LLM inference cost 70% via caching + model tiering, measured against an eval set" is the kind of bullet that distinguishes someone who can ship from someone who can also operate what they ship.

### Phase A — Baseline observability (Week 1, early)

Before optimizing, measure.

- Add structured logging in `main.py`: per request, log input length (chars), input tokens, output tokens, model used, latency, cache hit/miss.
- Tail CloudWatch logs over a few days of dad's real usage.
- Compute baseline: requests per day, average tokens in/out, cost per request, total cost projected.
- Save baseline numbers in `docs/cost_baseline.md` for the retro comparison later.

### Phase B — Persistent translation cache (Week 1)

The DynamoDB table from the SAM template is sitting there unused. Wire it up.

- Add a cache lookup at the top of the translate handler in `main.py`.
  - Cache key: SHA-256 of input text.
  - Cache value: `{ translation, model_used, created_at }`.
  - DynamoDB TTL: 30 days on the `created_at` attribute (DynamoDB auto-expires old entries).
- On cache hit: skip the LLM call entirely, return cached value.
- On cache miss: call LLM, write to cache on the way back.
- Log cache hit rate in the structured logs.

Expected impact: 50–80% reduction in API calls after a week of dad's usage.

### Phase C — Anthropic prompt caching (Week 2)

Anthropic supports server-side caching of stable prompt prefixes. The system prompt (translation rules) is long, stable across every request, and a perfect candidate.

- Add `cache_control: { type: "ephemeral" }` to the system prompt block in the Anthropic SDK call.
- Verify cache hits in CloudWatch logs (Anthropic returns cache stats in the response).
- Expected impact: ~90% reduction in *input* token cost on cached portions, modest overall but free to enable.

### Phase D — Model tiering (Week 2)

Use Haiku 4.5 for short / routine text, Sonnet 4.6 for content-rich text.

- Add a routing function: select model based on input length or content shape (e.g., < 80 chars or `[A-Z]` heavy → Haiku; longer prose → Sonnet).
- Run both models on the `docs/eval_set.md` examples; compare translation quality.
- Roll out the routing only if Haiku quality is acceptable for short inputs.

Expected impact: ~3× cost reduction on whatever fraction of traffic routes to Haiku.

### Phase E — Measure and retro (Week 3)

- Pull a week of post-optimization metrics from CloudWatch.
- Compute actual % cost reduction vs baseline.
- Write `docs/iteration_3_retro.md` with the numbers.
- This retro is the portfolio artifact — concrete before/after, real engineering trade-offs documented.

### Success criteria

- Anthropic monthly spend reduced by at least 70% vs the iteration-2 baseline.
- Translation quality on the eval set unchanged (or improved) for content-heavy translations.
- Dad doesn't notice any UX change (still feels fast, still feels accurate).
- The retro document has concrete before/after numbers, not vague claims.

### Out of scope for iteration 3

- New features (comments translation, RAG glossary, sentiment, news digest endpoint).
- Frontend changes except as required by cost work.
- Migration to AWS Bedrock vs direct Anthropic API (interesting comparison, parking it).
- Local LLM benchmark — still good portfolio material, but its own thing; iteration 4 or a side project.
- Kill switch / update announcement (deferred from iteration 2; still deferred).
