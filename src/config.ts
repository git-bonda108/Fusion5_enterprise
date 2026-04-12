const DEFAULT_AGENT_ENDPOINT =
  'https://197ec8e59d00eac5b672cf35f6882d.d9.environment.api.powerplatform.com/copilotstudio/dataverse-backed/authenticated/bots/crfaf_Fusion5SalesIntelligenceAgent/conversations?api-version=2022-03-01-preview'

const DEFAULT_SCOPES = ['https://api.powerplatform.com/.default']

export const appConfig = {
  agentName: 'Fusion5 Sales Intelligence Agent',
  brandColor: '#003366',
  agentEndpoint: import.meta.env.VITE_AGENT_ENDPOINT ?? DEFAULT_AGENT_ENDPOINT,
  authority:
    import.meta.env.VITE_AZURE_AUTHORITY ??
    'https://login.microsoftonline.com/common',
  clientId: import.meta.env.VITE_AZURE_CLIENT_ID ?? '',
  redirectUri: import.meta.env.VITE_REDIRECT_URI ?? 'http://localhost:5173',
  scopes:
    import.meta.env.VITE_AZURE_SCOPES?.split(',')
      .map((scope) => scope.trim())
      .filter(Boolean) ?? DEFAULT_SCOPES,
}

export const hasAuthConfiguration = appConfig.clientId.trim().length > 0
