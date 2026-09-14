import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MsalProvider } from '@azure/msal-react'
import App from './App.tsx'
import './index.css'
import { msalInstance } from './msalConfig'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Missing root element.')
}

const root = createRoot(rootElement)

const renderApp = () => {
  root.render(
    <StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </StrictMode>,
  )
}

msalInstance
  .initialize()
  .then(() => {
    return msalInstance.handleRedirectPromise()
  })
  .then((response) => {
    if (response?.account) {
      msalInstance.setActiveAccount(response.account)
    } else {
      const [firstAccount] = msalInstance.getAllAccounts()
      if (firstAccount) {
        msalInstance.setActiveAccount(firstAccount)
      }
    }
    renderApp()
  })
  .catch((error: unknown) => {
    console.error('MSAL initialization failed.', error)
    renderApp()
  })
