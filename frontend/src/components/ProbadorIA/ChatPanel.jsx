import { useTranslation } from 'react-i18next'
import { MessageSquare, Send } from 'lucide-react'
import MessageBubble from './MessageBubble'

export default function ChatPanel({
  messages,
  input,
  setInput,
  loading,
  onSend,
  onReset,
  correcting,
  setCorrecting,
  onSubmitCorrection,
  submitting,
  onRetest,
  endRef
}) {
  const { t } = useTranslation('learning')

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  return (
    <>
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-400">{t('probador.emptyChat')}</p>
            <p className="text-xs text-gray-300 mt-1">{t('probador.emptyChatSub')}</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble
            key={i}
            message={msg}
            index={i}
            correcting={correcting}
            onStartCorrection={(idx) => setCorrecting(idx)}
            onSubmitCorrection={onSubmitCorrection}
            onCancelCorrection={() => setCorrecting(null)}
            onRetest={onRetest}
            submitting={submitting}
          />
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input bar */}
      <div className="border-t border-gray-200 p-3 bg-white flex-shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('probador.inputPlaceholder')}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            disabled={loading}
            autoFocus
          />
          <button
            onClick={onSend}
            disabled={loading || !input.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white p-2.5 rounded-xl transition disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  )
}
