import { ChatTeardropText } from '@phosphor-icons/react'

export function Chat() {
  return (
    <div className="route-placeholder">
      <ChatTeardropText size={64} weight="thin" />
      <h1>What&rsquo;s on your mind?</h1>
      <p>Start a conversation. Your indexed files provide the context.</p>
    </div>
  )
}
