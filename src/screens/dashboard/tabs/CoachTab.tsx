import { useRef, useState } from 'react'
import { useAuth } from '../../../contexts/AuthContext'
import { getFreshToken, EDGE_URL } from '../../../lib/supabase'
import type { DashboardHook } from '../../../hooks/useDashboardData'

const CHIPS = ['Mon poids', 'Que manger?', 'Mes calories', 'Conseils injection', 'Jeûne']

export default function CoachTab({ data }: { data: DashboardHook }) {
  const { user } = useAuth()
  const { messages, setMessages } = data
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const scrollToEnd = () => setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)

  const send = async (text?: string) => {
    const msg = text ?? input
    if (!msg.trim() || !user) return
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setInput('')
    setTyping(true)
    scrollToEnd()

    try {
      const token = await getFreshToken()
      if (!token) {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Session expirée. Veuillez vous reconnecter.' }])
        setTyping(false)
        return
      }
      const res = await fetch(`${EDGE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: msg, user_id: user.id }),
      })
      const d = await res.json()
      const reply = d.reply ?? (d.error === 'limit_reached'
        ? 'Limite atteinte. Passez Premium pour continuer !'
        : `Erreur: ${d.details ?? d.error ?? 'Inconnu'}`)
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Erreur de connexion. Réessayez.' }])
    }
    setTyping(false)
    scrollToEnd()
  }

  return (
    <div className="flex flex-col h-screen max-h-screen">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary to-secondary text-white p-4 flex items-center gap-2 shrink-0">
        <h1 className="text-xl font-bold">Coach IA</h1>
        <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded">Claude</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 pb-0">
        {messages.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm text-center px-8">
            Posez une question à votre coach IA 💬
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
            m.role === 'user'
              ? 'self-end bg-primary text-white rounded-br-sm'
              : 'self-start bg-slate-100 text-slate-800 rounded-bl-sm'
          }`}>
            {m.content}
          </div>
        ))}
        {typing && (
          <div className="self-start bg-slate-100 px-3 py-2 rounded-2xl rounded-bl-sm flex gap-1 items-center">
            {[0, 1, 2].map(i => (
              <span key={i} className="typing-dot w-2 h-2 rounded-full bg-slate-400 inline-block" />
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Chips */}
      <div className="px-4 py-2 flex flex-wrap gap-1.5 shrink-0">
        {CHIPS.map(chip => (
          <button key={chip}
            className="bg-slate-100 hover:bg-primary hover:text-white text-slate-700 text-xs px-3 py-2 rounded-full border border-slate-200 transition-colors active:scale-95"
            onClick={() => send(chip)}>
            {chip}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="p-4 pt-0 flex gap-2 shrink-0 pb-safe">
        <input
          className="flex-1 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 bg-white transition-colors"
          placeholder="Posez une question..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
        />
        <button
          className="bg-primary text-white rounded-xl px-4 py-3 font-bold transition-colors hover:bg-primary-dark active:scale-95"
          onClick={() => send()}
        >➤</button>
      </div>
    </div>
  )
}
