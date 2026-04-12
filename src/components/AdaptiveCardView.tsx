import type { AdaptiveCardSubmitAction, ChatAttachment } from '../types/chat'

interface AdaptiveCardViewProps {
  attachment: ChatAttachment
  disabled?: boolean
  onSubmitAction?: (action: AdaptiveCardSubmitAction) => void
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const toRecords = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : []

const readString = (value: unknown) =>
  typeof value === 'string' ? value : undefined

const textBlockClasses = (element: Record<string, unknown>) => {
  const classes = ['whitespace-pre-wrap', 'text-sm', 'text-slate-700', 'dark:text-slate-200']
  const size = readString(element.size)?.toLowerCase()
  const weight = readString(element.weight)?.toLowerCase()
  const isSubtle = Boolean(element.isSubtle)

  if (size === 'medium') {
    classes.push('text-base')
  } else if (size === 'large') {
    classes.push('text-lg')
  } else if (size === 'extraLarge'.toLowerCase()) {
    classes.push('text-xl')
  }

  if (weight === 'bolder') {
    classes.push('font-semibold')
  }

  if (isSubtle) {
    classes.push('text-slate-500', 'dark:text-slate-400')
  }

  return classes.join(' ')
}

const ActionButtons = ({
  actions,
  disabled,
  onSubmitAction,
}: {
  actions: Record<string, unknown>[]
  disabled?: boolean
  onSubmitAction?: (action: AdaptiveCardSubmitAction) => void
}) => {
  const submitActions = actions.filter(
    (action) => readString(action.type) === 'Action.Submit',
  )

  if (submitActions.length === 0) {
    return null
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {submitActions.map((action, index) => {
        const title = readString(action.title) ?? 'Submit'
        const style = readString(action.style)?.toLowerCase()
        const isPositive = style === 'positive'

        return (
          <button
            key={`${title}-${index}`}
            type="button"
            disabled={disabled}
            onClick={() =>
              onSubmitAction?.({
                type: 'Action.Submit',
                title,
                data: action.data,
              })
            }
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              isPositive
                ? 'bg-fusion5-primary text-white hover:bg-fusion5-secondary'
                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            {title}
          </button>
        )
      })}
    </div>
  )
}

const renderElement = (
  element: Record<string, unknown>,
  key: string,
  disabled?: boolean,
  onSubmitAction?: (action: AdaptiveCardSubmitAction) => void,
) => {
  const type = readString(element.type)

  if (type === 'TextBlock') {
    const text = readString(element.text)
    if (!text) {
      return null
    }

    return (
      <p key={key} className={textBlockClasses(element)}>
        {text}
      </p>
    )
  }

  if (type === 'Image') {
    const url = readString(element.url)
    if (!url) {
      return null
    }

    return (
      <img
        key={key}
        src={url}
        alt={readString(element.altText) ?? 'Adaptive card image'}
        className="max-h-10 w-auto object-contain"
      />
    )
  }

  if (type === 'ColumnSet') {
    const columns = toRecords(element.columns)
    if (columns.length === 0) {
      return null
    }

    return (
      <div
        key={key}
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
      >
        {columns.map((column, index) => (
          <div key={`${key}-column-${index}`} className="space-y-2">
            {toRecords(column.items)
              .map((item, itemIndex) =>
                renderElement(
                  item,
                  `${key}-column-${index}-item-${itemIndex}`,
                  disabled,
                  onSubmitAction,
                ),
              )
              .filter(Boolean)}
          </div>
        ))}
      </div>
    )
  }

  if (type === 'ActionSet') {
    return (
      <ActionButtons
        key={key}
        actions={toRecords(element.actions)}
        disabled={disabled}
        onSubmitAction={onSubmitAction}
      />
    )
  }

  const nestedItems = toRecords(element.items)
  if (nestedItems.length > 0) {
    return (
      <div key={key} className="space-y-2">
        {nestedItems
          .map((item, index) =>
            renderElement(item, `${key}-item-${index}`, disabled, onSubmitAction),
          )
          .filter(Boolean)}
      </div>
    )
  }

  return null
}

export const AdaptiveCardView = ({
  attachment,
  disabled,
  onSubmitAction,
}: AdaptiveCardViewProps) => {
  const card = attachment.content
  const body = toRecords(card.body)
  const rootActions = toRecords(card.actions)

  if (readString(card.type) !== 'AdaptiveCard') {
    return null
  }

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/40">
      <div className="space-y-2">
        {body
          .map((element, index) =>
            renderElement(element, `adaptive-element-${index}`, disabled, onSubmitAction),
          )
          .filter(Boolean)}
      </div>
      <ActionButtons
        actions={rootActions}
        disabled={disabled}
        onSubmitAction={onSubmitAction}
      />
    </div>
  )
}
