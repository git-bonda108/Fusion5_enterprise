import {
  EventType,
  PublicClientApplication,
  type AccountInfo,
  type Configuration,
  type PopupRequest,
} from '@azure/msal-browser'
import { appConfig } from './config'

const msalConfig: Configuration = {
  auth: {
    clientId: appConfig.clientId || '00000000-0000-0000-0000-000000000000',
    authority: appConfig.authority,
    redirectUri: appConfig.redirectUri,
  },
  cache: {
    cacheLocation: 'sessionStorage',
  },
}

export const loginRequest: PopupRequest = {
  scopes: appConfig.scopes,
}

export const msalInstance = new PublicClientApplication(msalConfig)

msalInstance.addEventCallback((event) => {
  if (event.eventType !== EventType.LOGIN_SUCCESS) {
    return
  }

  const payload = event.payload as { account?: AccountInfo } | null
  if (payload?.account) {
    msalInstance.setActiveAccount(payload.account)
  }
})
