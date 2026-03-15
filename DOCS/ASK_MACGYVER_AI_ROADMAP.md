# Ask MacGyver AI Roadmap
**Goal:** Build Ask MacGyver into a Facebook AI / Grok-style assistant, starting small and growing gradually.

**Current state:** Unified keyword search across products, users, TV posts, music. "Ask MacGyver" button opens a placeholder modal.

---

## Overview: 6 Stages

| Stage | Name | What it does | Effort |
|-------|------|--------------|--------|
| 0 | **Search** | Keyword search (current) | Done |
| 1 | **Smart Help** | Rule-based answers for common questions | 1–2 weeks |
| 2 | **Intent + LLM** | Natural language understanding + simple Q&A | 2–3 weeks |
| 3 | **RAG** | Answer using platform data (products, users, etc.) | 3–4 weeks |
| 4 | **Chat** | Multi-turn conversation with memory | 2–3 weeks |
| 5 | **Actions & Proactive** | Execute actions, suggest next steps | 4+ weeks |

---

## Stage 1: Smart Help (Start Here)

**Goal:** Answer common questions without an LLM. Use pattern matching and templates.

### What to build

1. **Intent detection (rule-based)**
   - Detect patterns like: "how do I", "where is", "what is", "help me find", "how to pay", etc.
   - Map to predefined intents: `HOW_TO`, `WHERE_IS`, `WHAT_IS`, `FIND_PRODUCT`, `PAYMENT_HELP`, `GENERAL_SEARCH`

2. **Response templates**
   - For each intent, return a short answer + links
   - Example: "How do I add to cart?" → "Tap the cart icon on any product. [Go to Marketplace]"

3. **Platform knowledge base**
   - Create `backend/src/data/macgyverKnowledge.ts` with FAQs:
     - How to create a store
     - How to use ACBPayWallet
     - How to post on QwertyTV
     - How to request an errand
     - How to add products as a supplier

### Where to start

- **Backend:** `backend/src/routes/macgyver.ts` – new route `POST /api/macgyver/ask`
- **Logic:** `backend/src/services/macgyverService.ts` – intent detection + template responses
- **Frontend:** Replace the placeholder MacGyver modal with a real chat-style UI that:
  - Sends the user query to `/api/macgyver/ask`
  - Displays the response (text + links)

### Example flow

```
User: "How do I pay for a product?"
→ Intent: PAYMENT_HELP
→ Response: "You can pay with ACBPayWallet or card. Top up your wallet at /wallet, or add a card at checkout. [Open Wallet]"
```

---

## Stage 2: Intent + LLM

**Goal:** Use an LLM to understand intent and generate answers for questions that don’t match templates.

### What to add

1. **LLM integration**
   - Use OpenAI API, Anthropic, or a local model (Ollama)
   - Start with a small model (e.g. GPT-3.5-turbo or GPT-4o-mini) for cost control

2. **System prompt**
   - Define MacGyver’s role: “You are MacGyver, the Qwertymates assistant. You help users find products, users, content, and answer questions about the platform.”

3. **Fallback**
   - If Stage 1 templates match → use template
   - Else → send to LLM with a short system prompt

### Where to add

- `backend/src/services/macgyverLLM.ts` – LLM client
- `backend/.env` – `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`
- `macgyverService.ts` – call LLM when no template matches

### Cost control

- Use a small model first
- Set a limit on tokens per request
- Cache common answers

---

## Stage 3: RAG (Retrieve + Generate)

**Goal:** Answer using real platform data (products, users, posts, etc.).

### What to add

1. **Retrieval**
   - When the user asks “Find me running shoes” or “Who sells electronics?”:
     - Fetch products/users from existing APIs
     - Pass the top results as context to the LLM

2. **Context injection**
   - Build a prompt like: “Here are products: [list]. Answer the user’s question using this data.”

3. **Unified search**
   - Reuse your existing search (products, users, TV, music) as the retrieval step

### Where to add

- `macgyverService.ts` – call `productsAPI`, `usersAPI`, `tvAPI`, `musicAPI` before LLM
- Build a context string from search results
- Pass context + user query to LLM

### Example flow

```
User: "What running shoes do you have under R500?"
→ Search products with q="running shoes", filter by price
→ LLM: "We have 3 running shoes under R500: [Product A], [Product B], [Product C]. [View in Marketplace]"
```

---

## Stage 4: Chat

**Goal:** Multi-turn conversation with context and memory.

### What to add

1. **Conversation history**
   - Store: `MacGyverConversation` model (userId, messages[], createdAt)
   - Each message: `{ role: 'user'|'assistant', content: string }`

2. **Context window**
   - Send last N messages (e.g. 10) to the LLM

3. **UI**
   - Chat-style list of messages
   - Input at bottom, send button

### Where to add

- `backend/src/data/models/MacGyverConversation.ts`
- `POST /api/macgyver/chat` – create/continue conversation
- `GET /api/macgyver/chat/:id` – get history
- Frontend: `MacGyverChat` component with message list + input

---

## Stage 5: Actions & Proactive

**Goal:** Execute actions (e.g. add to cart, follow user) and suggest next steps.

### What to add

1. **Action detection**
   - Detect intents like “Add X to cart”, “Follow user Y”, “Show me my wallet”
   - Call existing APIs (cart, follows, wallet)

2. **Proactive suggestions**
   - “You might like this product” after a search
   - “Your cart has 3 items – ready to checkout?”

3. **Personalization**
   - Use user’s history, cart, follows to personalize answers

---

## MacGyver System Prompt

MacGyver is **Mr Know-it-all, Mr Fix-it-all** – inspired by the sitcom character who solves complex problems with ingenuity and whatever is at hand. Modernized into a powerful AI that answers both Qwertymates queries and general knowledge questions.

### Full System Prompt

```
You are MacGyver, the AI assistant for Qwertymates. You are Mr Know-it-all and Mr Fix-it-all – like the classic MacGyver who solves complex problems with creativity and whatever resources are available. You have been modernized into a powerful, versatile AI.

Your capabilities:
- **Qwertymates:** You help users navigate the platform – find products, users, TV posts, music; explain how to use ACBPayWallet, create a store, request errands, post on QwertyTV; and answer any question about Qwertymates features.
- **General knowledge:** You are not limited to Qwertymates. You can answer questions about the world – geography, culture, history, current events, science, people, places. Examples: the people of Omo Valley in Ethiopia, geopolitical developments, historical events, how things work.
- **Problem-solving:** When users face a challenge – on the platform or in life – you think creatively and offer practical, actionable solutions. You adapt your tone: helpful and concise for quick queries, more detailed when the question warrants it.

Guidelines:
- Be accurate. If unsure, say so. Do not invent facts.
- For Qwertymates questions, include relevant links or next steps when helpful (e.g. "Go to Marketplace", "Open your Wallet").
- For sensitive topics (conflict, politics, etc.), provide balanced, factual information without promoting harm.
- Stay helpful, respectful, and constructive.
```

### Usage

- Use this prompt as the `system` message when calling the OpenAI API (Stage 2+).
- Store in `backend/src/services/macgyverLLM.ts` as `MACGYVER_SYSTEM_PROMPT`.

---

## Implementation Order

### Phase A (1–2 weeks) – Start here

1. Create `backend/src/routes/macgyver.ts` and `backend/src/services/macgyverService.ts`
2. Implement Stage 1: intent detection + templates
3. Wire the MacGyver modal to call `/api/macgyver/ask`
4. Add 10–15 FAQ templates

### Phase B (2–3 weeks)

1. Add LLM integration (OpenAI or Anthropic)
2. Fallback to LLM when no template matches
3. Add system prompt and basic error handling

### Phase C (3–4 weeks)

1. Add RAG: search products/users/TV/music before LLM
2. Inject search results into the prompt
3. Improve answer quality

### Phase D (2–3 weeks)

1. Add `MacGyverConversation` model
2. Implement chat endpoints
3. Build chat UI with history

---

## Files to Create

| File | Purpose |
|------|---------|
| `backend/src/routes/macgyver.ts` | API routes for `/api/macgyver/*` |
| `backend/src/services/macgyverService.ts` | Intent detection, templates, orchestration |
| `backend/src/services/macgyverLLM.ts` | LLM client (Stage 2+) |
| `backend/src/data/models/MacGyverConversation.ts` | Chat history (Stage 4+) |
| `frontend/components/MacGyverChat.tsx` | Chat UI component |
| `frontend/lib/api.ts` | Add `macgyverAPI.ask()`, `macgyverAPI.chat()` |

---

## Environment Variables

```env
# Stage 2+ (optional)
OPENAI_API_KEY=sk-...
# or
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Quick Start: Stage 1

1. Create `backend/src/services/macgyverService.ts` – intent detection + template responses
2. Create `backend/src/routes/macgyver.ts` – `POST /api/macgyver/ask`
3. Register route in `server.ts`
4. Update `frontend/app/search/page.tsx` – MacGyver modal calls API and shows response
5. Add 5–10 FAQ templates

This gives you a working “Ask MacGyver” that answers common questions without any LLM cost.
