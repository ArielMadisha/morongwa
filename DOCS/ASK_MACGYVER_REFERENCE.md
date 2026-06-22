# Ask MacGyver — reference manual (architecture, ownership, roadmap)

This document explains **what you can and cannot “own”** in terms of AI models, what **Qwertymates already implements** in this monorepo, and **concrete steps** to grow Ask MacGyver toward the feature level of major AI clients (ChatGPT-style products). Use it as a **preparation guide** while Ask MacGyver is still primarily a **repo / product in progress**, not yet a fully separate live product.

---

## 1. What “you cannot replace OpenAI/Claude with a fully proprietary model inside this repo alone” means

### 1.1 What a “model” is (in practice)

A modern assistant like MacGyver needs:

| Piece | What it is |
|--------|------------|
| **Weights** | Billions of numbers that encode language understanding (the actual “brain”). |
| **Inference** | Hardware + software that runs those weights to produce text (GPUs/TPUs, vLLM, TensorRT-LLM, etc.). |
| **Training / alignment** | Data + compute + process that created or fine-tuned those weights. |

**OpenAI** and **Anthropic (Claude)** host weights + inference + scaling + safety stacks **outside your repo**. Your app calls their **HTTP APIs** and pays per token.

### 1.2 What “fully proprietary inside this repo alone” would require

To replace them **entirely** with something **you truly own** (no third-party LLM API), you need **your own stack**, not just Node/Next code:

1. **A trained model** (your weights, or an open-weight base you fine-tune).
2. **Inference deployment** (Kubernetes + GPU nodes, or a managed inference vendor that runs *your* chosen model).
3. **Operational tooling**: monitoring, rate limits, failover, context windows, safety filters.
4. **Optionally training pipelines** (if you fine-tune): data governance, evals, reproducible training jobs.

None of that appears magically from adding files to this repository; it is **infrastructure + ML lifecycle**.

### 1.3 What you *can* own without training your own foundation model

You **can** fully own:

- **Product UX** (chat UI, history, projects, mobile apps).
- **Orchestration** (routing, tools, RAG, moderation rules).
- **Data policy** (what is logged, retention, regional hosting).
- **Prompts & knowledge** (FAQ corpus, retrieval indexes, brand voice).
- **Integration with open-weight models** served **by you or a vendor** (Llama, Mistral, etc.) — the **application code** lives in your repo; the **GPU inference** lives elsewhere.

That is the realistic middle ground: **your product + your data pipeline**, with **either** commercial APIs **or** self-/vendor-hosted open models.

---

## 2. What we implemented *in this repo* (Qwertymates “MacGyver” gateway)

Today, “Ask MacGyver” in Qwertymates is a **thin, opinionated gateway**: platform search → FAQ → optional OpenAI. **You own the gateway and knowledge; you do not own OpenAI’s weights.**

### 2.1 Request flow

1. **Platform search first** — If the query matches content on Qwertymates (TV, products, users, music), the API returns a **`search`** result so the UI can show native results instead of only chat text.
2. **Static FAQ / knowledge** — If no platform hits, answers may come from curated patterns in `backend/src/data/macgyverKnowledge.ts` (no LLM call).
3. **LLM fallback** — If still needed and `OPENAI_API_KEY` is set, `backend/src/services/macgyverLLM.ts` calls **OpenAI Chat Completions** with the MacGyver system prompt.

Core files:

| Path | Role |
|------|------|
| `backend/src/routes/macgyver.ts` | `POST /api/macgyver/ask` (authenticated). |
| `backend/src/services/macgyverService.ts` | Orchestrates search → FAQ → LLM. |
| `backend/src/services/macgyverSearch.ts` | MongoDB search across TV, products, users, songs, etc. |
| `backend/src/services/macgyverLLM.ts` | OpenAI HTTP client, system prompt, model env. |
| `backend/src/data/macgyverKnowledge.ts` | Qwertymates FAQ patterns and answers. |
| `frontend/lib/api.ts` | `macgyverAPI.ask(query)` client. |

Environment variables (typical):

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | Required for LLM path (shared with other features unless you split keys). |
| `MACGYVER_OPENAI_MODEL` | Optional; defaults to `gpt-4o-mini`. |

### 2.2 What is *not* implemented yet (vs “big” AI clients)

- No standalone **AskMacGyver.com** deployment in this doc’s scope (that is a **separate product launch**: domain, branding, auth, billing).
- No **multi-turn conversation memory** server-side (each call is largely stateless unless you add it).
- No **streaming** tokens to the browser (would need SSE/WebSocket + API changes).
- No **user file uploads** / vision / code interpreter (tooling layer).
- No **pluggable provider abstraction** in one clean interface (OpenAI is wired directly in `macgyverLLM.ts` — swapping providers is a small refactor).

---

## 3. Why we are *not* flipping Ask MacGyver to a full separate live site *inside this task*

Shipping a **live** Ask MacGyver product implies:

- Domain, DNS, TLS, hosting strategy (same cluster vs separate).
- Auth (SSO, sessions, abuse prevention) and possibly **subscriptions**.
- Branding, legal (terms, privacy), content moderation at scale.
- Observability (logs, metrics, alerts) and cost controls per user.

The **Qwertymates monorepo** already exposes **`/api/macgyver/ask`** for an **embedded** assistant. A **standalone Ask MacGyver** can **reuse the same patterns** (or extract a package) once product decisions are fixed.

---

## 4. Roadmap: steps to reach “other AI clients” level

Work in **phases**. Later phases depend on earlier ones.

### Phase A — Product baseline (MVP parity with “simple chat”)

1. **Dedicated chat UI** — Threads list, message bubbles, empty state, errors, retry.
2. **Conversation persistence** — Store messages (user + assistant) in MongoDB or a chat service; thread id per user.
3. **Auth** — Same as Qwertymates users or separate Ask MacGyver accounts; rate limit per user/IP.
4. **Streaming** — Switch LLM integration to streaming responses (SSE from API → incremental UI).

### Phase B — Quality and trust

5. **Provider abstraction** — Interface `completeChat({ messages, model })` with adapters: OpenAI, Anthropic, Azure OpenAI, local Ollama/vLLM URL.
6. **Moderation** — Pre/post filters, blocklists, optional OpenAI moderation API or open-source classifiers.
7. **Evals** — Small fixed test set of prompts + expected themes; run on each prompt/model change.

### Phase C — “Power user” features (ChatGPT Plus–class patterns)

8. **RAG (retrieval)** — Ingest your docs / Qwertymates help / uploaded PDFs into a vector index; inject top chunks into context.
9. **Tools / function calling** — Let the model call **your** APIs (search platform, place order draft, check wallet) with strict schemas.
10. **Multi-modal** — Images/audio only after you define storage, scanning, and model support.

### Phase D — Cost, scale, and optional self-hosting

11. **Caching** — Similar question cache, embedding cache.
12. **Quota tiers** — Free vs paid token budgets (Stripe, internal credits).
13. **Self-hosted inference** — Deploy an open-weight model behind HTTPS; route low-risk traffic there; keep commercial API for hardest queries if needed.
14. **Fine-tuning** — Only after A–C are stable; needs data pipeline and evaluation.

### Phase E — Standalone “Ask MacGyver” product

15. **Extract or duplicate** — Either publish `macgyver-*` as an internal npm workspace package or copy the pattern into the Ask MacGyver repo.
16. **Public API + keys** — Developer API keys, OAuth, webhooks (if B2B).
17. **Marketing site** — Landing, pricing, status page.

---

## 5. If Ask MacGyver is a **separate repository**

Recommended **contract** between repos:

- **HTTP API**: `POST /v1/chat/completions` (OpenAI-compatible) *or* keep `POST /ask` with `{ query, threadId }`.
- **Shared types**: npm package or OpenAPI schema for request/response.
- **Secrets**: Never commit keys; use env + secret manager in CI/CD.

Qwertymates can remain the **first integration** (embedded assistant); Ask MacGyver repo becomes the **reference implementation** of the gateway + UI + billing.

---

## 6. Quick glossary

| Term | Meaning |
|------|---------|
| **Proprietary model** | Weights and training owned by a vendor (e.g. GPT-4.x internals). |
| **Open-weight model** | Model files are downloadable; you still need GPUs to run them. |
| **API-only integration** | Your code calls HTTP; you own orchestration, not the model. |
| **RAG** | Retrieval-Augmented Generation — fetch documents, then ask the LLM with citations context. |
| **Inference** | Running the model to generate text. |

---

## 7. Maintenance checklist (when you extend MacGyver)

- [ ] Update `macgyverKnowledge.ts` when product flows change (payments, TV, wallet).
- [ ] Keep system prompt in `macgyverLLM.ts` aligned with brand and safety rules.
- [ ] Monitor OpenAI errors (429 quota, 401 key) and map them to user-visible messages.
- [ ] Review `macgyverSearch.ts` query cost (indexes on frequently searched fields).

---

## 8. Related Qwertymates features (same AI dependency, different code)

- **QwertyTV AI News** — `backend/src/services/aiNewsService.ts` (RSS + OpenAI); different prompts and quotas.
- **Translate** — Separate route/service if present.

Splitting **API keys** (`OPENAI_API_KEY` vs `MACGYVER_OPENAI_KEY`) in production is optional but helps billing attribution.

---

*Last updated: preparation reference for Ask MacGyver / Qwertymates integration. Adjust phases to match your launch timeline and compliance requirements.*
