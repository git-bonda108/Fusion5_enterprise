# Hardening and Production Readiness

## Current posture (as built)

**Identity and secrets**
- Authentication is Microsoft Entra ID via MSAL as a public SPA client: no client secret exists or is needed anywhere in the app. Tokens are acquired per request (`acquireTokenSilent` with interactive fallback) and cached in `sessionStorage`, so they die with the tab.
- Every agent call sends `Authorization: Bearer <token>` to the Power Platform conversations endpoint; there are no API keys in the client.
- No credentials are committed at HEAD. `.env.example` contains placeholders only. The one baked-in value is a **default agent endpoint URL in `src/config.ts`** — an authenticated endpoint (useless without a valid token), but environment-specific; `VITE_AGENT_ENDPOINT` overrides it.
- The deploy workflow reads `VITE_*` values from GitHub repository *variables*, which is appropriate: all of them are public build-time values that ship in the JS bundle anyway. Nothing secret should ever be added as a `VITE_*` variable.
- The default authority is `login.microsoftonline.com/common` (multi-tenant): any Entra account can complete sign-in to the UI. Authorization is therefore delegated entirely to the endpoint's token validation.

**Error handling**
- Fetch failures throw with status, status text, and response body; the UI surfaces them as a banner plus an in-conversation system message, and always clears the busy state (`finally`).
- MSAL popup edge cases (in-progress interaction, popup timeout) have explicit fallbacks.
- Gaps: no fetch timeout/`AbortController`, no retry/backoff on transient errors, and backend error bodies are shown verbatim to the signed-in user.

**Output safety**
- Agent markdown renders through `react-markdown` without a raw-HTML plugin, so agent output cannot inject HTML/script.
- The custom Adaptive Card renderer only materializes a fixed element subset; unknown types render nothing. One note: `Image` elements render any URL the agent supplies — acceptable while the agent is the only author of cards, worth revisiting if card sources broaden.

**Observability**
- None. `console.error` on MSAL init failure is the only logging. No telemetry, no error reporting, no analytics. The trace panel is a user-facing debugging aid, not operational monitoring.

## Ladder to production

**Stage 1 — Identity and configuration**
1. Pin `VITE_AZURE_AUTHORITY` to the tenant (`…/<tenant-id>`) and restrict the app registration to single-tenant; add Conditional Access as policy requires.
2. Set `VITE_AGENT_ENDPOINT` explicitly in every environment and remove the hardcoded default from `src/config.ts` (small code change, deliberately not made in this docs pass) so a misconfigured build fails loudly instead of talking to the wrong environment.
3. Keep redirect URIs exact per environment (localhost for dev, the deployed origin for prod) on the app registration.
4. Review the granted scope (`https://api.powerplatform.com/.default`) against least privilege for the agent endpoint.

**Stage 2 — Monitoring**
1. Add a browser telemetry SDK (e.g., Application Insights web) wired to: MSAL event callbacks, `fetchJson` failures, and the poll-exhausted path in `collectAgentTurn` (the "no reply after 5 polls" case is the most likely production complaint and is currently invisible).
2. Add a React error boundary above `App` so a render crash degrades to a message instead of a blank page.
3. Alert on authentication failure rate and on non-2xx rates from the conversations endpoint.

**Stage 3 — Deployment**
1. In CI, replace `npm install` with `npm ci` (the lockfile exists; installs become reproducible) and add `npm run lint` plus the test suite (docs/EVALUATION.md) before the build step.
2. GitHub Pages cannot set response headers. For a production origin, host `dist/` somewhere header-capable (e.g., Azure Static Web Apps with `staticwebapp.config.json`) and add a Content-Security-Policy, `frame-ancestors`, and standard security headers.
3. Enable Dependabot/Renovate; MSAL and React majors move quickly.
4. Address the ~990 kB bundle before wide rollout (dynamic-import jsPDF; see ARCHITECTURE "Extending this system").

**Stage 4 — Compliance and data handling**
1. Conversation content (potentially sales data) exists in browser memory and in user-initiated PDF exports; nothing is stored by this app server-side. Document that boundary for data-protection review, and decide whether PDF export needs a policy gate.
2. Data-loss-prevention and audit for the agent itself belong to the hosting Power Platform environment (DLP policies, environment audit logs) — track them there, not in this repo.
3. Session policy: `sessionStorage` token cache means sign-in per tab/session; confirm that matches the organization's session-lifetime requirements before changing it to `localStorage` for convenience.

## Secrets at HEAD

A full sweep of tracked files at HEAD (patterns: API keys, tokens, connection strings, private keys, committed `.env`) found **no credentials**. Two hygiene notes from this pass:
- `.env.example` previously carried a real environment-specific agent endpoint URL as its `VITE_AGENT_ENDPOINT` value; it has been replaced with a schematic placeholder. The URL was not a credential (the endpoint requires a bearer token), so no rotation is required.
- The same real endpoint remains as the code-level default in `src/config.ts`; removal is recommended in Stage 1 above but was out of scope for a documentation-only change.
