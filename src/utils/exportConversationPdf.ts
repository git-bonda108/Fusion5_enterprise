import { jsPDF } from 'jspdf'
import type { ChatMessage } from '../types/chat'

const stripMarkdown = (value: string) =>
  value
    .replace(/```([\s\S]*?)```/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/^>\s?/gm, '')
    .replace(/\|/g, ' | ')
    .trim()

const roleLabel = (role: ChatMessage['role']) => {
  if (role === 'user') {
    return 'You'
  }

  if (role === 'agent') {
    return 'Agent'
  }

  return 'System'
}

export const exportConversationPdf = (
  messages: ChatMessage[],
  agentName: string,
) => {
  const document = new jsPDF({
    unit: 'pt',
    format: 'a4',
  })

  const pageWidth = document.internal.pageSize.getWidth()
  const pageHeight = document.internal.pageSize.getHeight()
  const margin = 40
  const maxLineWidth = pageWidth - margin * 2

  let cursorY = margin

  document.setFontSize(16)
  document.text(agentName, margin, cursorY)

  cursorY += 22
  document.setFontSize(11)
  document.text(
    `Exported ${new Date().toLocaleString()}`,
    margin,
    cursorY,
  )
  cursorY += 24

  for (const message of messages) {
    const heading = `${roleLabel(message.role)} • ${new Date(message.createdAt).toLocaleTimeString()}`
    const cleanText = stripMarkdown(message.text)
    const bodyLines = document.splitTextToSize(cleanText, maxLineWidth)
    const headingLines = document.splitTextToSize(heading, maxLineWidth)
    const blockHeight = (headingLines.length + bodyLines.length + 2) * 14

    if (cursorY + blockHeight > pageHeight - margin) {
      document.addPage()
      cursorY = margin
    }

    document.setFontSize(11)
    document.setTextColor(30, 64, 175)
    document.text(headingLines, margin, cursorY)

    cursorY += headingLines.length * 14
    document.setTextColor(15, 23, 42)
    document.text(bodyLines, margin, cursorY + 4)
    cursorY += (bodyLines.length + 2) * 14
  }

  const exportName = `fusion5-conversation-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.pdf`
  document.save(exportName)
}
