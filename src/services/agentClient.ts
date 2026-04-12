import type {
  AgentResponse,
  ChatAttachment,
  ChatMessage,
  ToolCallStatus,
  ToolCallTrace,
} from '../types/chat'

interface SendMessageInput {
  accessToken: string
  userMessage: string
  conversationId?: string
  watermark?: string
  userDisplayName?: string
  agentEndpoint: string
}

interface SubmitCardActionInput {
  accessToken: string
  conversationId: string
  watermark?: string
  actionTitle?: string
  actionData?: unknown
  userDisplayName?: string
  agentEndpoint: string
}

interface ConversationResponse {
  conversationId?: string
  watermark?: string
}

interface ActivityFrom {
  id?: string
  role?: string
}

interface BotActivity {
  id?: string
  type?: string
  name?: string
  text?: string
  timestamp?: string
  from?: ActivityFrom
  attachments?: unknown
  channelData?: unknown
  entities?: unknown
  value?: unknown
}

interface ActivitiesResponse {
  activities?: BotActivity[]
  watermark?: string
  action?: string
}

const DEFAULT_API_VERSION = '2022-03-01-preview'

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

const toArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const normalizeStatus = (value: unknown): ToolCallStatus => {
  const normalized = String(value ?? 'info').toLowerCase()

  if (
    normalized.includes('complete') ||
    normalized.includes('success') ||
    normalized.includes('done')
  ) {
    return 'completed'
  }

  if (normalized.includes('fail') || normalized.includes('error')) {
    return 'failed'
  }

  if (normalized.includes('start') || normalized.includes('run')) {
    return 'started'
  }

  return 'info'
}

const parseEndpoint = (endpoint: string) => {
  const parsed = new URL(endpoint)
  const apiVersion = parsed.searchParams.get('api-version') ?? DEFAULT_API_VERSION
  const conversationsUrl = `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}`

  return {
    apiVersion,
    conversationsUrl,
  }
}

const buildConversationUrl = (conversationsUrl: string, apiVersion: string) =>
  `${conversationsUrl}?api-version=${encodeURIComponent(apiVersion)}`

const buildConversationActivityUrl = (
  conversationsUrl: string,
  conversationId: string,
  apiVersion: string,
  watermark?: string,
) => {
  const searchParams = new URLSearchParams({ 'api-version': apiVersion })
  if (watermark) {
    searchParams.set('watermark', watermark)
  }

  return `${conversationsUrl}/${conversationId}?${searchParams.toString()}`
}


const fetchJson = async <T>(
  input: RequestInfo | URL,
  init: RequestInit,
  errorContext: string,
): Promise<T> => {
  const response = await fetch(input, init)

  if (!response.ok) {
    const body = await response.text()
    throw new Error(
      `${errorContext} (${response.status} ${response.statusText}): ${body || 'No details returned.'}`,
    )
  }

  return (await response.json()) as T
}

const buildHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  'Content-Type': 'application/json',
})

const startConversation = async (
  accessToken: string,
  conversationsUrl: string,
  apiVersion: string,
): Promise<ConversationResponse> => {
  const response = await fetchJson<ConversationResponse>(
    buildConversationUrl(conversationsUrl, apiVersion),
    {
      method: 'POST',
      headers: buildHeaders(accessToken),
      body: JSON.stringify({}),
    },
    'Failed to start conversation',
  )

  if (!response.conversationId) {
    throw new Error('Conversation started but no conversationId was returned.')
  }

  return response
}

const postUserMessage = async (
  accessToken: string,
  conversationsUrl: string,
  conversationId: string,
  apiVersion: string,
  userMessage: string,
  userDisplayName?: string,
): Promise<ActivitiesResponse> => {
  const sender = userDisplayName?.trim() || 'User'

  return await fetchJson<ActivitiesResponse>(
    buildConversationActivityUrl(conversationsUrl, conversationId, apiVersion),
    {
      method: 'POST',
      headers: buildHeaders(accessToken),
      body: JSON.stringify({
        activity: {
          type: 'message',
          text: userMessage,
          from: {
            id: sender.toLowerCase().replace(/\s+/g, '-'),
            name: sender,
          },
          locale: 'en-US',
        },
      }),
    },
    'Failed to send message',
  )
}

const postAdaptiveCardSubmit = async (
  accessToken: string,
  conversationsUrl: string,
  conversationId: string,
  apiVersion: string,
  actionTitle?: string,
  actionData?: unknown,
  userDisplayName?: string,
): Promise<ActivitiesResponse> => {
  const sender = userDisplayName?.trim() || 'User'

  return await fetchJson<ActivitiesResponse>(
    buildConversationActivityUrl(conversationsUrl, conversationId, apiVersion),
    {
      method: 'POST',
      headers: buildHeaders(accessToken),
      body: JSON.stringify({
        activity: {
          type: 'message',
          text: actionTitle ?? 'Submit',
          value: actionData ?? { action: actionTitle ?? 'Submit' },
          from: {
            id: sender.toLowerCase().replace(/\s+/g, '-'),
            name: sender,
          },
          locale: 'en-US',
        },
      }),
    },
    'Failed to submit adaptive card action',
  )
}

const continueConversation = async (
  accessToken: string,
  conversationsUrl: string,
  conversationId: string,
  apiVersion: string,
  watermark?: string,
): Promise<ActivitiesResponse> => {
  return await fetchJson<ActivitiesResponse>(
    buildConversationActivityUrl(
      conversationsUrl,
      conversationId,
      apiVersion,
      watermark,
    ),
    {
      method: 'POST',
      headers: buildHeaders(accessToken),
      body: JSON.stringify({
        activity: {
          type: 'event',
          name: 'ContinueConversation',
        },
      }),
    },
    'Failed to continue conversation',
  )
}

const isAgentActivity = (activity: BotActivity) => {
  const type = activity.type?.toLowerCase() ?? ''
  const role = activity.from?.role?.toLowerCase() ?? ''
  const senderId = activity.from?.id?.toLowerCase() ?? ''

  if (type !== 'message') {
    return false
  }

  return (
    role === 'bot' ||
    role === 'assistant' ||
    senderId.includes('bot') ||
    senderId.includes('agent')
  )
}

const extractAttachments = (activity: BotActivity): ChatAttachment[] =>
  toArray(activity.attachments)
    .map((value): ChatAttachment | null => {
      const record = toRecord(value)
      if (!record) {
        return null
      }

      const contentType =
        typeof record.contentType === 'string' ? record.contentType : ''
      const content = toRecord(record.content)

      if (!contentType || !content) {
        return null
      }

      return { contentType, content }
    })
    .filter((attachment): attachment is ChatAttachment => Boolean(attachment))

const toChatMessage = (activity: BotActivity): ChatMessage | null => {
  const text = activity.text?.trim() ?? ''
  const attachments = extractAttachments(activity)

  if (!text && attachments.length === 0) {
    return null
  }

  return {
    id: activity.id ?? crypto.randomUUID(),
    role: 'agent',
    text,
    createdAt: activity.timestamp ?? new Date().toISOString(),
    attachments,
  }
}

const extractToolCalls = (activity: BotActivity): ToolCallTrace[] => {
  const candidates: unknown[] = []
  const channelData = toRecord(activity.channelData)

  if (channelData) {
    candidates.push(
      ...toArray(channelData.toolCalls),
      ...toArray(channelData.mcpToolCalls),
      ...toArray(channelData.traces),
      ...toArray(channelData.trace),
    )

    const singleCall = toRecord(channelData.toolCall)
    if (singleCall) {
      candidates.push(singleCall)
    }
  }

  candidates.push(...toArray(activity.entities), ...toArray(activity.value))

  return candidates
    .map((candidate): ToolCallTrace | null => {
      const traceData = toRecord(candidate)
      if (!traceData) {
        return null
      }

      const status = normalizeStatus(
        traceData.status ?? traceData.state ?? traceData.result,
      )
      const timestamp =
        typeof traceData.timestamp === 'string'
          ? traceData.timestamp
          : (activity.timestamp ?? new Date().toISOString())

      return {
        id:
          typeof traceData.id === 'string'
            ? traceData.id
            : `${activity.id ?? crypto.randomUUID()}-${crypto.randomUUID()}`,
        name: String(traceData.name ?? traceData.toolName ?? 'Tool Call'),
        status,
        timestamp,
        input: traceData.input ?? traceData.arguments ?? traceData.request,
        output: traceData.output ?? traceData.response ?? traceData.result,
      }
    })
    .filter((trace): trace is ToolCallTrace => Boolean(trace))
}


const collectAgentTurn = async (
  accessToken: string,
  conversationsUrl: string,
  conversationId: string,
  apiVersion: string,
  initialResponse: ActivitiesResponse,
  watermark?: string,
) => {
  const allActivities = [...(initialResponse.activities ?? [])]
  const allTraces = [...allActivities.flatMap(extractToolCalls)]
  let nextWatermark = initialResponse.watermark ?? watermark
  let action = initialResponse.action?.toLowerCase() ?? ''

  let messages = allActivities
    .filter(isAgentActivity)
    .map(toChatMessage)
    .filter((message): message is ChatMessage => Boolean(message))

  if (messages.length === 0 && action === 'waiting') {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await wait(1200)

      const continuation = await continueConversation(
        accessToken,
        conversationsUrl,
        conversationId,
        apiVersion,
        nextWatermark,
      )

      const continuationActivities = continuation.activities ?? []
      if (continuationActivities.length > 0) {
        allActivities.push(...continuationActivities)
        allTraces.push(...continuationActivities.flatMap(extractToolCalls))
      }

      nextWatermark = continuation.watermark ?? nextWatermark
      action = continuation.action?.toLowerCase() ?? action

      messages = allActivities
        .filter(isAgentActivity)
        .map(toChatMessage)
        .filter((message): message is ChatMessage => Boolean(message))

      if (messages.length > 0 || action !== 'waiting') {
        break
      }
    }
  }

  return {
    messages,
    traces: allTraces,
    watermark: nextWatermark,
  }
}

export const sendMessageToAgent = async ({
  accessToken,
  userMessage,
  conversationId,
  watermark,
  userDisplayName,
  agentEndpoint,
}: SendMessageInput): Promise<AgentResponse> => {
  const { conversationsUrl, apiVersion } = parseEndpoint(agentEndpoint)

  let nextConversationId = conversationId
  let nextWatermark = watermark

  if (!nextConversationId) {
    const conversation = await startConversation(
      accessToken,
      conversationsUrl,
      apiVersion,
    )

    nextConversationId = conversation.conversationId
    nextWatermark = conversation.watermark
  }

  if (!nextConversationId) {
    throw new Error('Unable to resolve a conversation ID for the agent session.')
  }

  const postResponse = await postUserMessage(
    accessToken,
    conversationsUrl,
    nextConversationId,
    apiVersion,
    userMessage,
    userDisplayName,
  )

  const turn = await collectAgentTurn(
    accessToken,
    conversationsUrl,
    nextConversationId,
    apiVersion,
    postResponse,
    nextWatermark,
  )

  return {
    conversationId: nextConversationId,
    messages: turn.messages,
    traces: turn.traces,
    watermark: turn.watermark,
  }
}

export const submitAdaptiveCardAction = async ({
  accessToken,
  conversationId,
  watermark,
  actionTitle,
  actionData,
  userDisplayName,
  agentEndpoint,
}: SubmitCardActionInput): Promise<AgentResponse> => {
  const { conversationsUrl, apiVersion } = parseEndpoint(agentEndpoint)

  const submitResponse = await postAdaptiveCardSubmit(
    accessToken,
    conversationsUrl,
    conversationId,
    apiVersion,
    actionTitle,
    actionData,
    userDisplayName,
  )

  const turn = await collectAgentTurn(
    accessToken,
    conversationsUrl,
    conversationId,
    apiVersion,
    submitResponse,
    watermark,
  )

  return {
    conversationId,
    messages: turn.messages,
    traces: turn.traces,
    watermark: turn.watermark,
  }
}
