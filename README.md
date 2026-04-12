# Fusion5 Sales Intelligence Agent Web App

Branded React web app for embedding the Fusion5 Sales Intelligence Agent with Microsoft Entra ID authentication.

## Included Features
- MSAL authentication with `@azure/msal-browser` and `@azure/msal-react`
- Chat UI with user/agent bubbles
- Markdown rendering for agent responses (including tables via GFM)
- Thinking indicator while waiting for responses
- MCP/tool call trace panel with collapsible event details
- Dark/light theme toggle
- Fusion5 navy primary branding (`#003366`)
- Responsive layout for mobile and desktop
- Header title: `Fusion5 Sales Intelligence Agent`
- Conversation export to PDF

## Tech Stack
- React + TypeScript + Vite
- Tailwind CSS
- MSAL for Entra auth
- `react-markdown` + `remark-gfm`
- `jspdf`

## Quick Start
1. Install dependencies:
   `npm install`
2. Copy env template:
   `cp .env.example .env`
3. Update `.env` values:
   - `VITE_AZURE_CLIENT_ID` (required for real sign-in)
   - `VITE_AZURE_AUTHORITY` (default: `https://login.microsoftonline.com/common`)
   - `VITE_AZURE_SCOPES` (default: `https://api.powerplatform.com/.default`)
   - `VITE_REDIRECT_URI` (default: `http://localhost:5173`)
   - `VITE_AGENT_ENDPOINT` (Fusion5 agent endpoint)
4. Run locally:
   `npm run dev`

## Build
- `npm run build`
- `npm run preview`

## Azure Static Web Apps
Deploy this Vite app to Azure Static Web Apps and set the same `VITE_*` variables in the SWA environment configuration for production builds.
