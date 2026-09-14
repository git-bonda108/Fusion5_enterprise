import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AdaptiveCardView } from './AdaptiveCardView'
import type { AdaptiveCardSubmitAction, ChatMessage } from '../types/chat'

interface MessageBubbleProps {
  message: ChatMessage
  disableActions?: boolean
  onAdaptiveCardAction?: (action: AdaptiveCardSubmitAction) => void
}

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
  ),
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-md border border-slate-300 dark:border-slate-700">
      <table className="min-w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-slate-100 dark:bg-slate-900">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="border-b border-slate-300 px-2 py-1 font-semibold dark:border-slate-700">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-slate-200 px-2 py-1 align-top dark:border-slate-800">
      {children}
    </td>
  ),
}

const formatMessageTime = (value: string) =>
  new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

export const MessageBubble = ({
  message,
  disableActions,
  onAdaptiveCardAction,
}: MessageBubbleProps) => {
  if (message.role === 'system') {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-100">
        {message.text}
      </div>
    )
  }

  const isUser = message.role === 'user'
  const adaptiveCardAttachments = (message.attachments ?? []).filter(
    (attachment) => attachment.contentType === 'application/vnd.microsoft.card.adaptive',
  )

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm sm:max-w-[75%] ${
          isUser
            ? 'bg-fusion5-primary text-white'
            : 'border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100'
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.text}</p>
        ) : (
          <div className="leading-relaxed">
            {message.text ? (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
              >
                {message.text}
              </ReactMarkdown>
            ) : null}
            {adaptiveCardAttachments.map((attachment, index) => (
              <AdaptiveCardView
                key={`${message.id}-adaptive-${index}`}
                attachment={attachment}
                disabled={disableActions}
                onSubmitAction={onAdaptiveCardAction}
              />
            ))}
          </div>
        )}
        <div
          className={`mt-2 text-[11px] ${
            isUser ? 'text-slate-200' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {formatMessageTime(message.createdAt)}
        </div>
      </div>
    </div>
  )
}
