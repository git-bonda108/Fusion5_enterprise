# Evaluation and Testing

## What exists today

**There is no automated test suite in this repository.** No test files, no test runner dependency, and no `test` script in `package.json`. No metrics (latency, accuracy, coverage) are recorded anywhere in the code or docs, so none are quoted here.

The checks that do exist:

| Check | How to run | What it covers |
|---|---|---|
| TypeScript type-check | `npm run build` (runs `tsc -b` before Vite) | Full strict-mode type checking of `src/` via `tsconfig.app.json` |
| ESLint | `npm run lint` | ESLint 9 recommended + `typescript-eslint` + `react-hooks` + `react-refresh` rules over the repo |
| Production build | `npm run build` | Vite bundling succeeds; surfaces import errors and the chunk-size warning |

CI (`.github/workflows/deploy-pages.yml`) runs `npm run build` on every push to `main`, so type-check and bundling gate deployment. Lint is not run in CI.

Evaluation of the agent's answer quality is out of scope for this repo: the agent, its prompts, and its tools live in Copilot Studio, not here.

## Edge cases the code visibly handles

Enumerated from the source, not from intention:

**Auth (`src/App.tsx`, `src/main.tsx`)**
- Silent token acquisition falls back to interactive popup on `InteractionRequiredAuthError`.
- Sign-in popup falls back to full-page redirect on `timed_out` / `monitor_popup_timeout` error codes; `interaction_in_progress` gets a specific user-facing message instead of a retry.
- Missing client ID: the app renders with a warning banner, and Sign in / Send are disabled rather than failing at runtime.
- MSAL initialization failure is caught and logged; the app still renders.
- Active-account selection handles the no-active-account and redirect-return cases.

**Protocol (`src/services/agentClient.ts`)**
- Non-2xx responses throw with status, status text, and the response body (or "No details returned." when the body is empty).
- Conversation start without a returned `conversationId` is a hard error; so is failing to resolve one before a send.
- `action: "waiting"` with no message triggers the bounded poll: at most 5 `ContinueConversation` attempts at 1.2 s intervals, exiting early on a message or an action change.
- Activities with neither text nor well-formed attachments are dropped (`toChatMessage` returns `null`).
- Malformed attachments (wrong types, non-object content) are filtered out rather than crashing the renderer.
- Tool traces are accepted from five different `channelData` shapes plus `entities` and `value`; unknown status strings normalize to `info`; missing trace ids get generated ones.
- The endpoint's `api-version` query parameter is preserved if present, defaulted otherwise; trailing slashes are trimmed.

**UI (`src/App.tsx`, components)**
- Empty/whitespace-only input and sends-while-thinking are no-ops; the send button is also disabled in those states.
- A turn that returns no messages produces a visible system notice pointing at the trace panel.
- Card actions without an active conversation, or before sign-in, produce user-facing errors instead of requests.
- Request failures append a system message and set the error banner; the thinking state is cleared in `finally`.
- Traces are deduplicated by id and capped (80 kept, 30 shown).
- PDF export is disabled until the conversation has at least two exportable messages; system messages are excluded.
- Unknown Adaptive Card element types render nothing rather than throwing; non-`AdaptiveCard` attachments render nothing.
- Missing `#root` element throws explicitly at bootstrap.

Known gaps, also visible in the code: no request timeout or `AbortController` on fetches (a hung network request leaves the UI "thinking" until the browser gives up), no retry on transient HTTP errors, and conversation state does not survive a page refresh.

## Proposed evaluation harness

*This section is a design proposal; none of it exists yet.*

**Layer 1 — unit tests for the protocol client (highest value first).** `agentClient.ts` is pure fetch-plus-mapping, so with Vitest and a mocked `fetch`:
- Golden fixtures: captured JSON `ActivitiesResponse` payloads for (a) plain text reply, (b) reply with GFM table markdown, (c) Adaptive Card consent card with Approve/Decline `Action.Submit`, (d) `action: "waiting"` then message on poll N, (e) tool traces in each supported `channelData` shape, (f) empty turn, (g) HTTP 401/429/500 with and without body.
- Asserts: message filtering (bot-role detection), attachment filtering, trace extraction and status normalization, watermark advancement, poll bounding (fake timers: exactly 5 attempts, early exit).

**Layer 2 — component tests.** React Testing Library for: disabled-state matrix of the composer (auth × config × thinking × empty input), card action dispatch payloads, empty-turn system notice, error-path rendering, and that agent markdown renders without raw HTML injection.

**Layer 3 — end-to-end smoke.** Playwright against a stub conversations server (the endpoint is one env var, so the stub just implements start/post/continue): sign-in mocked at the MSAL boundary, one scripted conversation including a consent card round-trip and a PDF export click.

**Gates.** CI order: `npm run lint` → `tsc -b` → unit + component tests → build → deploy. Fail the pipeline on any test failure; add a coverage floor only after the suite exists (a floor with zero tests is theater).

**Agent-quality evaluation (service-side, out of repo).** If the hosted agent's behavior needs regression coverage, that harness belongs with the agent definition: a golden set of sales-intelligence prompts with expected tool invocations and answer rubrics, run against a non-production environment. This repo's contribution is the trace panel, which already surfaces the raw tool-call evidence such an evaluation would score.
