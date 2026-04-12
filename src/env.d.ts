interface ImportMetaEnv {
  readonly VITE_AZURE_CLIENT_ID?: string
  readonly VITE_AZURE_AUTHORITY?: string
  readonly VITE_AZURE_SCOPES?: string
  readonly VITE_REDIRECT_URI?: string
  readonly VITE_AGENT_ENDPOINT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
