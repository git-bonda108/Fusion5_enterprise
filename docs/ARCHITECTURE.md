# Architecture

This repository is a browser-only chat client for a sales-intelligence agent hosted on Microsoft Copilot Studio, built for an enterprise services client (referred to generically throughout these docs; the client's name appears in some code identifiers and brand tokens, which are left untouched). There is no backend code here: the trust boundary is the browser, and everything server-side belongs to Entra ID and the Power Platform conversations API.

## Component map

| Module | Responsibility |
|---|---|
| `src/main.tsx` | Bootstrap: initializes MSAL (`initialize()` → `handleRedirectPromise()`), selects an active account, then renders the app inside `MsalProvider`. Renders even if MSAL initialization fails (logged to console). |
| `src/msalConfig.ts` | `PublicClientApplication` configuration (sessionStorage token cache), login request scopes, and a `LOGIN_SUCCESS` event callback that pins the active account. |
| `src/config.ts` | Central app config from `VITE_*` env vars with hardcoded defaults (agent display name, brand color, agent endpoint, authority, scopes, redirect URI). Exposes `hasAuthConfiguration` (client ID present). |
| `src/App.tsx` | The single stateful component: owns messages, traces, conversation identity (`conversationId`, `watermark`), theme, error and "thinking" state; implements sign-in/out, token acquisition, send-message and card-action flows. |
| `src/services/agentClient.ts` | The protocol client. Parses the endpoint, starts conversations, posts message/card/continue activities, filters agent activities, extracts Adaptive Card attachments and tool-call traces, and runs the bounded polling loop. No React dependency. |
| `src/components/MessageBubble.tsx` | Renders one message: plain text for the user, markdown (GFM tables, lists) for the agent via `react-markdown` + `remark-gfm`, plus any Adaptive Card attachments. System messages render as amber notices. |
| `src/components/AdaptiveCardView.tsx` | A minimal, hand-rolled Adaptive Card renderer covering the subset the agent actually sends: `TextBlock`, `Image`, `ColumnSet`, `ActionSet`, nested `items`, and `Action.Submit` buttons (used for consent approve/decline). |
| `src/components/TracePanel.tsx` | Collapsible side panel showing the last 30 tool-call traces with status badges and expandable JSON input/output. |
| `src/utils/exportConversationPdf.ts` | Client-side PDF export with jsPDF: strips markdown, paginates, and saves a timestamped file. |
| `src/types/chat.ts` | Shared types: `ChatMessage`, `ChatAttachment`, `ToolCallTrace` (+ status union), `AdaptiveCardSubmitAction`, `AgentResponse`. |

`index.html`, `vite.config.ts`, `tailwind.config.js` (brand palette tokens), `postcss.config.js`, `eslint.config.js`, and the three `tsconfig*.json` files are standard Vite/Tailwind scaffolding. `src/assets/` contains template leftovers not referenced by the app.

## Data flow, end to end

1. **Auth.** On any send, `App.getAccessToken()` calls `acquireTokenSilent`; on `InteractionRequiredAuthError` it falls back to `acquireTokenPopup`. Sign-in itself falls back from popup to full redirect on popup-timeout error codes.
2. **Conversation start (lazy).** The first send with no `conversationId` POSTs to the conversations URL; a missing `conversationId` in the response is a hard error.
3. **User turn.** `postUserMessage` POSTs a `message` activity (text, sender derived from the Entra display name, `en-US` locale) with the bearer token. Adaptive Card button presses go through `postAdaptiveCardSubmit` instead, carrying the card's `data` payload in `activity.value` — this is the consent-handling path: the card's Approve/Decline `Action.Submit` buttons post their payload back into the same conversation.
4. **Collect the agent turn.** `collectAgentTurn` reads activities from the immediate response. If no agent message arrived and the service says `action: "waiting"`, it polls: up to 5 `ContinueConversation` event POSTs, 1.2 s apart, accumulating activities and advancing the watermark, stopping early once a message lands or the action changes.
5. **Parse.** Agent activities are identified by `type === "message"` plus a bot/assistant role or a sender id containing "bot"/"agent". Attachments keep only well-formed `{contentType, content}` pairs. Tool traces are harvested defensively from several possible shapes: `channelData.toolCalls` / `.mcpToolCalls` / `.traces` / `.trace` / `.toolCall`, plus `entities` and `value` arrays; statuses normalize onto `started | completed | failed | info` by substring match.
6. **Render.** `App.applyAgentResponse` stores the new conversation identity, dedupes traces by id (capped at the latest 80; the panel shows 30), and appends messages. An empty turn yields a system notice pointing at the trace panel rather than silence.

## Orchestration analysis: what is parallel, sequential, async

- **Strictly sequential per turn:** start-conversation → post activity → poll loop. Each network call awaits the previous; the poll loop is a deliberate bounded retry (5 × 1.2 s ≈ 6 s ceiling), not an unbounded spin.
- **No client-side parallelism:** one conversation, one in-flight turn — `isThinking` gates the composer, the send button, and card buttons, so overlapping turns cannot be issued.
- **Async only at the UI seam:** React state updates and smooth-scroll effects; MSAL's popup/redirect flows.
- **Why:** the conversations API is a request/short-poll protocol (watermark-based deltas). A bounded poll keeps the client simple and predictable; the trade-off is up to ~6 s of added latency for slow agent turns and no streaming tokens.

## State and context engineering

- **Session state:** all in React `useState` — messages, traces, `conversationId`, `watermark`, error, thinking, theme. Nothing conversational is persisted; a refresh drops the conversation (the hosted service still holds its own history under the old id, but the client can no longer address it).
- **Context assembly:** the client sends only the current user utterance (or card payload). Conversational context is assembled server-side; the watermark ensures the client reads only activity deltas. This keeps the client stateless with respect to prompt construction — there is no prompt template, token budget, or truncation logic in this repo, by design.
- **Bounding:** traces are bounded twice (dedupe cap 80 in state, last 30 rendered); polling is bounded; PDF export excludes system messages.
- **Ancillary persistence:** MSAL token cache in `sessionStorage` (cleared when the tab closes); theme in `localStorage` under a namespaced key.

## Design decisions and trade-offs visible in the code

- **Hand-rolled Adaptive Card subset instead of the official renderer.** `AdaptiveCardView` implements exactly the elements the agent emits (text, image, columns, action sets, submit buttons). Trade-off: tiny bundle cost and full styling control versus silent no-render for unsupported element types (unknown types return `null`).
- **Defensive `unknown`-first parsing.** `agentClient` never trusts the wire shape: `toRecord`/`toArray` guards, multiple candidate locations for traces, substring status normalization. Trade-off: resilient to schema drift across service versions at the cost of some permissiveness (e.g., any `value` array is scanned for traces).
- **Polling over streaming.** Matches what the endpoint offers; avoids websocket/SSE infrastructure. Cost: no token streaming, bounded extra latency.
- **Config defaults baked into `src/config.ts`.** The app runs with zero configuration against one specific environment. Convenient for demos; a production concern (see HARDENING).
- **Per-request token acquisition.** Every turn calls MSAL silent-acquire, so token refresh is automatic and no token is stored in app state.
- **Markdown rendering without raw HTML.** `react-markdown` with `remark-gfm` only — no `rehype-raw` — so agent output cannot inject HTML into the DOM.
- **PDF export fully client-side.** jsPDF with a regex markdown stripper: no conversation content leaves the browser to produce the export.

## Extending this system

Grounded next steps the current structure makes easy:

1. **Conversation resume across refresh.** `conversationId` and `watermark` are already the complete resume token; persisting them to `sessionStorage` in `applyAgentResponse` and rehydrating on mount would survive refreshes without touching the protocol client.
2. **Streaming or adaptive backoff in `collectAgentTurn`.** The poll loop is isolated in one function with a fixed 5 × 1.2 s schedule; swapping in exponential backoff (or an SSE/WebSocket transport if the channel gains one) changes nothing outside `agentClient.ts`.
3. **Broader Adaptive Card coverage behind the same seam.** `ChatAttachment` filtering already isolates card content; either extend `renderElement` (e.g., `Input.*` elements, `FactSet`) or drop in the official `adaptivecards` renderer behind `AdaptiveCardView`'s props without touching message flow.
4. **Code-splitting the bundle.** The build warns at ~990 kB; `exportConversationPdf` (jsPDF) is the obvious dynamic-import candidate since it is only needed on button press.
5. **A test harness for the protocol client.** `agentClient.ts` is pure (fetch + data mapping, no React), which makes it directly unit-testable with mocked `fetch` — see docs/EVALUATION.md for the proposed golden-fixture design.
