import { useMemo, useState } from 'react'
import type { ToolCallTrace } from '../types/chat'

interface TracePanelProps {
  traces: ToolCallTrace[]
}

const statusClasses: Record<ToolCallTrace['status'], string> = {
  started:
    'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-100',
  completed:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-100',
  failed: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-100',
  info: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
}

const formatTraceTime = (value: string) =>
  new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

export const TracePanel = ({ traces }: TracePanelProps) => {
  const [isOpen, setIsOpen] = useState(true)

  const recentTraces = useMemo(() => [...traces].slice(-30).reverse(), [traces])

  return (
    <aside className="w-full rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:w-[330px]">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          MCP Tool Trace
        </span>
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {recentTraces.length} events
        </span>
      </button>

      {isOpen ? (
        <div className="max-h-[420px] space-y-3 overflow-y-auto border-t border-slate-200 px-3 py-3 dark:border-slate-800">
          {recentTraces.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Tool events will appear here when the agent invokes MCP operations.
            </p>
          ) : (
            recentTraces.map((trace, index) => (
              <details
                key={`${trace.id}-${index}`}
                className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/70"
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {trace.name}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClasses[trace.status]}`}
                    >
                      {trace.status}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {formatTraceTime(trace.timestamp)}
                    </span>
                  </div>
                </summary>
                <div className="mt-2 space-y-2">
                  {trace.input !== undefined ? (
                    <div>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Input
                      </p>
                      <pre className="overflow-x-auto rounded-md bg-slate-900 p-2 text-[11px] text-slate-100">
                        {JSON.stringify(trace.input, null, 2)}
                      </pre>
                    </div>
                  ) : null}

                  {trace.output !== undefined ? (
                    <div>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Output
                      </p>
                      <pre className="overflow-x-auto rounded-md bg-slate-900 p-2 text-[11px] text-slate-100">
                        {JSON.stringify(trace.output, null, 2)}
                      </pre>
                    </div>
                  ) : null}
                </div>
              </details>
            ))
          )}
        </div>
      ) : null}
    </aside>
  )
}
