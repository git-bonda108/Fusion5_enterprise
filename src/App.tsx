import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { InteractionRequiredAuthError } from '@azure/msal-browser'
import { useIsAuthenticated, useMsal } from '@azure/msal-react'
import { MessageBubble } from './components/MessageBubble'
import { TracePanel } from './components/TracePanel'
import { appConfig, hasAuthConfiguration } from './config'
import { loginRequest } from './msalConfig'
import {
  sendMessageToAgent,
  submitAdaptiveCardAction,
} from './services/agentClient'
import type {
  AdaptiveCardSubmitAction,
  AgentResponse,
  ChatMessage,
  ToolCallTrace,
} from './types/chat'
import { exportConversationPdf } from './utils/exportConversationPdf'

type Theme = 'light' | 'dark'

const getInitialTheme = (): Theme => {
  if (typeof window === 'undefined') {
    return 'light'
  }

  const persisted = localStorage.getItem('fusion5-theme')
  if (persisted === 'light' || persisted === 'dark') {
    return persisted
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

const formatError = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong.'

const getErrorCode = (error: unknown) => {
  if (typeof error !== 'object' || error === null || !('errorCode' in error)) {
    return ''
  }

  return String((error as { errorCode?: unknown }).errorCode ?? '').toLowerCase()
}

const dedupeTraces = (traces: ToolCallTrace[]) => {
  const traceMap = new Map<string, ToolCallTrace>()

  for (const trace of traces) {
    traceMap.set(trace.id, trace)
  }

  return Array.from(traceMap.values()).slice(-80)
}

const buildWelcomeMessage = (): ChatMessage => ({
  id: crypto.randomUUID(),
  role: 'agent',
  text: `Welcome to ${appConfig.agentName}. Sign in, ask a question, and I’ll return answers with markdown and MCP traces.`,
  createdAt: new Date().toISOString(),
})

function App() {
  const { accounts, instance } = useMsal()
  const isAuthenticated = useIsAuthenticated()
  const activeAccount = useMemo(
    () => instance.getActiveAccount() ?? accounts[0] ?? null,
    [accounts, instance],
  )

  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [inputValue, setInputValue] = useState('')
  const [conversationId, setConversationId] = useState<string>()
  const [watermark, setWatermark] = useState<string>()
  const [isThinking, setIsThinking] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [traces, setTraces] = useState<ToolCallTrace[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([buildWelcomeMessage()])
  const chatBottomRef = useRef<HTMLDivElement | null>(null)

  const exportableMessages = messages.filter((message) => message.role !== 'system')

  useEffect(() => {
    if (!instance.getActiveAccount() && accounts.length > 0) {
      instance.setActiveAccount(accounts[0])
    }
  }, [accounts, instance])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('fusion5-theme', theme)
  }, [theme])

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking])

  const getAccessToken = async () => {
    if (!activeAccount) {
      throw new Error('No active account found. Please sign in again.')
    }

    try {
      const tokenResult = await instance.acquireTokenSilent({
        ...loginRequest,
        account: activeAccount,
      })
      return tokenResult.accessToken
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        const tokenResult = await instance.acquireTokenPopup(loginRequest)
        return tokenResult.accessToken
      }

      throw error
    }
  }

  const handleAdaptiveCardAction = async (action: AdaptiveCardSubmitAction) => {
    if (isThinking) {
      return
    }

    if (!isAuthenticated) {
      setErrorMessage('Please sign in with Microsoft Entra ID before chatting.')
      return
    }

    if (!conversationId) {
      setErrorMessage('No active conversation found for this card action.')
      return
    }

    const actionLabel = action.title?.trim() || 'Submit'

    setErrorMessage(null)
    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: 'user',
        text: actionLabel,
        createdAt: new Date().toISOString(),
      },
    ])
    setIsThinking(true)

    try {
      const accessToken = await getAccessToken()
      const response = await submitAdaptiveCardAction({
        accessToken,
        conversationId,
        watermark,
        actionTitle: actionLabel,
        actionData: action.data,
        userDisplayName: activeAccount?.name ?? activeAccount?.username,
        agentEndpoint: appConfig.agentEndpoint,
      })
      applyAgentResponse(response)
    } catch (error) {
      const message = formatError(error)
      setErrorMessage(message)
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'system',
          text: `Request failed: ${message}`,
          createdAt: new Date().toISOString(),
        },
      ])
    } finally {
      setIsThinking(false)
    }
  }

  const handleSignIn = async () => {
    setErrorMessage(null)

    if (!hasAuthConfiguration) {
      setErrorMessage('Add VITE_AZURE_CLIENT_ID to your .env file before signing in.')
      return
    }

    try {
      await instance.loginPopup(loginRequest)
    } catch (error) {
      const errorCode = getErrorCode(error)

      if (errorCode === 'interaction_in_progress') {
        setErrorMessage(
          'A sign-in interaction is already in progress. Complete or close the other auth window and try again.',
        )
        return
      }

      if (errorCode === 'timed_out' || errorCode === 'monitor_popup_timeout') {
        await instance.loginRedirect(loginRequest)
        return
      }
      setErrorMessage(formatError(error))
    }
  }

  const handleSignOut = async () => {
    setErrorMessage(null)
    await instance.logoutPopup({
      mainWindowRedirectUri: appConfig.redirectUri,
    })
  }

  const applyAgentResponse = (response: AgentResponse) => {
    setConversationId(response.conversationId)
    setWatermark(response.watermark)
    setTraces((current) => dedupeTraces([...current, ...response.traces]))

    if (response.messages.length === 0) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'system',
          text: 'No textual reply was returned yet. Check the trace panel for backend events.',
          createdAt: new Date().toISOString(),
        },
      ])
      return
    }

    setMessages((current) => [...current, ...response.messages])
  }

  const handleSendMessage = async () => {
    const trimmedInput = inputValue.trim()
    if (!trimmedInput || isThinking) {
      return
    }

    if (!isAuthenticated) {
      setErrorMessage('Please sign in with Microsoft Entra ID before chatting.')
      return
    }

    if (!hasAuthConfiguration) {
      setErrorMessage('Missing VITE_AZURE_CLIENT_ID. Update your environment config.')
      return
    }

    setErrorMessage(null)
    setInputValue('')

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: trimmedInput,
      createdAt: new Date().toISOString(),
    }
    setMessages((current) => [...current, userMessage])
    setIsThinking(true)

    try {
      const accessToken = await getAccessToken()
      const response = await sendMessageToAgent({
        accessToken,
        userMessage: trimmedInput,
        conversationId,
        watermark,
        userDisplayName: activeAccount?.name ?? activeAccount?.username,
        agentEndpoint: appConfig.agentEndpoint,
      })
      applyAgentResponse(response)
    } catch (error) {
      const message = formatError(error)
      setErrorMessage(message)
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'system',
          text: `Request failed: ${message}`,
          createdAt: new Date().toISOString(),
        },
      ])
    } finally {
      setIsThinking(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void handleSendMessage()
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSendMessage()
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-fusion5-secondary dark:text-fusion5-accent">
              Fusion5
            </p>
            <h1 className="text-lg font-semibold">{appConfig.agentName}</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setTheme((current) => (current === 'light' ? 'dark' : 'light'))
              }
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {theme === 'light' ? 'Dark mode' : 'Light mode'}
            </button>

            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-100"
              >
                Sign out
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleSignIn()}
                disabled={!hasAuthConfiguration}
                className="rounded-lg bg-fusion5-primary px-3 py-2 text-sm font-semibold text-white transition hover:bg-fusion5-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 lg:flex-row">
        <TracePanel traces={traces} />

        <section className="flex min-h-[70vh] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {!hasAuthConfiguration ? (
              <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-100">
                Add <code>VITE_AZURE_CLIENT_ID</code> to your <code>.env</code>{' '}
                file to enable Entra ID authentication.
              </p>
            ) : null}

            <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  disableActions={isThinking}
                  onAdaptiveCardAction={(action) =>
                    void handleAdaptiveCardAction(action)
                  }
                />
              ))}

              {isThinking ? (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-fusion5-primary [animation-delay:-0.3s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-fusion5-primary [animation-delay:-0.15s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-fusion5-primary" />
                    Thinking…
                  </div>
                </div>
              ) : null}

              <div ref={chatBottomRef} />
            </div>
          </div>

          <div className="border-t border-slate-200 p-4 dark:border-slate-800">
            {errorMessage ? (
              <p className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-100">
                {errorMessage}
              </p>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-3">
              <textarea
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Ask about pipeline trends, account risks, or revenue forecasts..."
                rows={3}
                className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-fusion5-primary transition focus:ring-2 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isAuthenticated
                    ? `Signed in as ${activeAccount?.name ?? activeAccount?.username}.`
                    : 'Sign in to start chatting with the agent.'}
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      exportConversationPdf(exportableMessages, appConfig.agentName)
                    }
                    disabled={exportableMessages.length < 2}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Export PDF
                  </button>
                  <button
                    type="submit"
                    disabled={
                      isThinking ||
                      !isAuthenticated ||
                      !hasAuthConfiguration ||
                      inputValue.trim().length === 0
                    }
                    className="rounded-lg bg-fusion5-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-fusion5-secondary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Send
                  </button>
                </div>
              </div>
            </form>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
