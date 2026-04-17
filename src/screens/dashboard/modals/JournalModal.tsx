import { useEffect, useState } from 'react'
import { useAuth } from '../../../contexts/AuthContext'
import { sb } from '../../../lib/supabase'
import { todayISO, moodEmoji, moodColor } from '../../../utils/calculations'
import Button from '../../../components/ui/Button'
import { Alert } from '../../../components/ui/Card'
import type { JournalEntry } from '../../../types'

export default function JournalModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const [mood, setMood] = useState('')
  const [note, setNote] = useState('')
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!user) return
    sb.from('journal_entries').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(10)
      .then(({ data }) => setEntries(data ?? []))
  }, [user])

  const save = async () => {
    if (!mood || !user) return
    const { error } = await sb.from('journal_entries').insert({
      user_id: user.id, entry_date: todayISO(), mood: parseInt(mood), notes: note, energy: parseInt(mood),
    })
    if (!error) {
      setMsg('Entrée enregistrée ✓'); setMood(''); setNote('')
      setTimeout(() => setMsg(''), 3000)
      const { data } = await sb.from('journal_entries').select('*').eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(10)
      setEntries(data ?? [])
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl w-full max-w-[430px] p-6 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" />
        <h2 className="text-xl font-bold text-slate-800 mb-4">📔 Journal</h2>

        {msg && <Alert type="success">{msg}</Alert>}

        {/* Mood selector */}
        <p className="text-sm font-semibold text-slate-700 mb-2">Comment vous sentez-vous?</p>
        <div className="flex justify-center gap-3 mb-4">
          {[1, 2, 3, 4, 5].map(v => (
            <button key={v}
              className={`text-3xl p-2 rounded-xl border-2 transition-all ${
                mood === v.toString()
                  ? 'bg-blue-50 border-primary scale-110'
                  : 'border-transparent hover:border-slate-200'
              }`}
              onClick={() => setMood(v.toString())}>
              {moodEmoji(v)}
            </button>
          ))}
        </div>

        {/* Note */}
        <label className="text-sm font-semibold text-slate-700 block mb-1.5">Notes du jour</label>
        <textarea
          className="border border-slate-200 rounded-xl px-3 py-3 text-sm w-full min-h-[80px] mb-4 focus:outline-none focus:border-primary resize-none"
          placeholder="Comment s'est passée votre journée?"
          value={note}
          onChange={e => setNote(e.target.value)}
        />

        <Button fullWidth onClick={save} className="mb-2">Enregistrer</Button>
        <Button fullWidth variant="ghost" onClick={onClose}>Fermer</Button>

        {/* Mood chart */}
        {entries.length > 0 && (
          <div className="mt-6">
            <p className="text-sm font-semibold text-slate-700 mb-3">Évolution de l'humeur</p>
            <div className="flex items-end gap-1 h-20">
              {entries.slice(0, 7).reverse().map((e, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-t-md transition-all" style={{ height: `${(e.mood / 5) * 100}%`, background: moodColor(e.mood) }} />
                  <span className="text-[9px] text-slate-400">
                    {new Date(e.entry_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent entries */}
        {entries.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-semibold text-slate-700 mb-3">Dernières entrées</p>
            <div className="flex flex-col gap-2">
              {entries.slice(0, 5).map(e => (
                <div key={e.id} className="bg-slate-50 rounded-xl px-3 py-2.5 border-l-4" style={{ borderColor: moodColor(e.mood) }}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm">{moodEmoji(e.mood)} Humeur: {e.mood}/5</span>
                    <span className="text-xs text-slate-500">{new Date(e.entry_date).toLocaleDateString('fr-FR')}</span>
                  </div>
                  {e.notes && <p className="text-xs text-slate-600">{e.notes}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
