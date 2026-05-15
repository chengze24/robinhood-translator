# Iteration 1 Retrospective + Iteration 2 Plan

## Iteration 1: Local select-to-translate MVP

**Goal:** Build the smallest possible end-to-end translation pipeline.

### What we built

- **Project scaffolding**: GitHub repo, `.gitignore`, README, monorepo layout (`extension/`, `backend/`, `docs/`)
- **Dev environment**: Homebrew, Python 3.13 via conda, Node.js, VS Code, AWS CLI, Claude Code, SSH-keyed GitHub
- **Python backend (FastAPI)**: `/translate` and `/health` endpoints, calls Anthropic Sonnet 4.6 with a finance-context system prompt, loaded from `.env`
- **Chrome extension (Manifest V3)**: content script captures text selection, calls backend, displays Chinese in a floating tooltip near the selection
- **Working end-to-end demo**: translated a Robinhood marketing page sentence in place, with NVDA/ticker/dollar preservation

### What works

- The translation backend prompt and output quality (Chinese reads naturally, financial terms preserved correctly, ticker symbols left in English)
- The local dev loop (edit → reload extension → refresh page → test)
- The git workflow — `add → commit → push` is now muscle memory
- The basic Chrome extension architecture (manifest, content script, host permissions)

### What we built but isn't useful in this product

- **Select-to-translate UX** — dad can't reliably select multi-line text
- **The plan to translate UI chrome** — dad doesn't need it; he navigates Robinhood by spatial memory

---

## User research findings (dad session)

1. **Multi-line text selection is hard for him.** Selection is the wrong primary interaction. Hover would work much better.
2. **Speed-to-value matters more than cost.** Dad needs this now. Cost optimization is meaningless until he's actively using it.
3. **The actual product is content comprehension, not UI translation.** Dad already navigates Robinhood without reading English — he knows the buttons, prices, charts. He needs translation for content-heavy areas: news summaries, user comments, anywhere there's prose he can't skim.
4. **News superlinks are a specific technical challenge.** Robinhood's per-stock news section uses links that don't behave like regular selectable text — they intercept selection as click. Needs a special handling strategy.

---

## Strategic pivots

### Pivot 1: Product positioning

| | Before | After |
|---|---|---|
| Framing | "Robinhood translator" | "AI content comprehension for non-English-speaking retail traders" |
| Scope | UI + content | Content-heavy areas only |
| Story | Page translator | AI assistant solving a real user problem |

### Pivot 2: Primary interaction

| | Before | After |
|---|---|---|
| Trigger | Select text → translate | Hover ~2 seconds → translate |
| Fallback | (none) | Selection still works for power users |

### Pivot 3: Order of operations

| | Before | After |
|---|---|---|
| Sequence | Build → optimize → deploy | Deploy → ship to user → measure → optimize what hurts |
| Deployment | Iteration 4 | Iteration 2 |

---

## Iteration 2 Plan

**Goal:** Get a real production version into dad's hands on his Windows PC, with hover-to-translate and a working solution for the news section.

**Estimated duration:** 2–3 weeks

### Phase A: AWS deployment (Week 1)
- Adapt FastAPI backend to run on AWS Lambda (likely via Mangum adapter, or refactor to a plain Lambda handler)
- Set up API Gateway HTTP API in front of Lambda
- Provision DynamoDB table for future translation cache (create the resource even if caching logic comes later)
- Add `ANTHROPIC_API_KEY` as a Lambda environment variable (never in code or git)
- Deploy with AWS SAM, AWS CDK, or AWS Console for the first time — discuss with Claude which path fits best for learning
- Test from MacBook: extension hits the cloud URL instead of localhost
- Update CORS allowed origins to include the production extension's origin

### Phase B: Hover-to-translate UX (Week 1–2)
- Replace `mouseup` selection logic with a hover-with-debounce model in `content.js`
- Detect text-containing elements on hover
- Wait 2 seconds (configurable) of stable hover before firing translation
- Cancel on `mouseleave` or new hover target
- Keep selection-based translation as a fallback (e.g., shift+click, or a toggle)
- Test with dad on his real usage flow

### Phase C: News section handling (Week 2)
- Inspect Robinhood's news DOM structure (DevTools on a stock detail page)
- Decide approach: (a) auto-translate news items in place when they appear, (b) hover-translate the link without triggering navigation, (c) add a small translate button next to each item
- Likely answer: hover-translate with the tooltip positioned so it doesn't block the link
- Implement and test

### Phase D: Install on dad's PC and observe (Week 2–3)
- Package the `extension/` folder (zip is fine for unpacked install on Windows Chrome)
- Walk dad through Chrome dev-mode install on his PC
- Watch him use it for several real trading sessions
- Note what works and what breaks
- Document findings in `docs/iteration_2_retro.md` after the iteration

### Success criteria

- Dad can use the extension on Robinhood, on his own PC, with hover, without needing your help mid-session
- News section translations work reliably
- AWS spend < $5 for the iteration
- Anthropic spend < $30 for the iteration

---

## Deferred to later iterations

These remain on the backlog but aren't on the critical path:

- **UI string glossary** — low priority; dad doesn't need it
- **Full-page translation** — unnecessary given the new product framing
- **Translation cache (DynamoDB read/write logic)** — add when we see cost pressure
- **Anthropic prompt caching** — same
- **Haiku tier routing** — same
- **RAG financial glossary** — would improve news translation quality; reassess after iteration 2
- **News sentiment analysis** — interesting portfolio piece, not urgent
- **User comments translation** — likely similar pattern to news; pick up after news works
- **Local LLM experiment (Qwen on MacBook)** — résumé/portfolio side project
- **Eval set expansion** — ongoing; keep adding examples in `docs/eval_set.md` as dad uses the tool

---

## What we're optimizing for

The single most important metric for iteration 2: **dad uses the tool unprompted, multiple times per week, without complaining.**

If we hit that, the product is real. Everything else (cost, accuracy, more features) is iteration on something that already matters to someone.
