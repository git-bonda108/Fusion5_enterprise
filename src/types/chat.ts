export type MessageRole = 'user' | 'agent' | 'system'
export interface ChatAttachment {
  contentType: string
  content: Record<string, unknown>
}

export interface AdaptiveCardSubmitAction {
  type: string
  title: string
  data?: unknown
}

export interface ChatMessage {
  id: string
  role: MessageRole
  text: string
  createdAt: string
  attachments?: ChatAttachment[]
}

export type ToolCallStatus = 'started' | 'completed' | 'failed' | 'info'

export interface ToolCallTrace {
  id: string
  name: string
  status: ToolCallStatus
  timestamp: string
  input?: unknown
  output?: unknown
}

export interface AgentResponse {
  conversationId: string
  messages: ChatMessage[]
  traces: ToolCallTrace[]
  watermark?: string
}
