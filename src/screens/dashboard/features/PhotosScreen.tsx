import React from 'react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import { sb } from '../../../lib/supabase'
import Card from '../../../components/ui/Card'
import Button from '../../../components/ui/Button'
import Input from '../../../components/ui/Input'
import type { DashboardHook } from '../../../hooks/useDashboardData'

export default function PhotosScreen({ data }: { data: DashboardHook }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { photos, reload } = data
  const fileRef = useRef<HTMLInputElement>(null)
  const [weight, setWeight] = useState('')
  const [note, setNote] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploadError('')
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('L\'image ne doit pas dépasser 10 Mo.')
      e.target.value = ''
      return
    }
    if (!file.type.startsWith('image/')) {
      setUploadError('Veuillez sélectionner un fichier image.')
      e.target.value = ''
      return
    }
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${user.id}/progress/${Date.now()}.${ext}`
      const { error: uploadErr } = await sb.storage.from('photos').upload(path, file)
      if (uploadErr) { setUploadError('Erreur lors de l\'envoi de la photo.'); return }
      const { data: urlData } = sb.storage.from('photos').getPublicUrl(path)
      await sb.from('progress_photos').insert({
        user_id: user.id, photo_url: urlData.publicUrl,
        taken_at: new Date().toISOString(),
        weight_kg: weight ? parseFloat(weight) : null, notes: note || null,
      })
      setWeight(''); setNote('')
      await reload()
    } catch {
      setUploadError('Une erreur est survenue. Réessayez.')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-br from-primary to-secondary text-white p-4 flex items-center gap-3">
        <button onClick={() => navigate('/dashboard')} className="text-white/80 text-xl leading-none">←</button>
        <h1 className="text-xl font-bold">Progression Photos</h1>
      </div>

      <div className="p-4">
        {/* Upload form */}
        <Card>
          <div className="flex flex-col gap-3">
            <Input label="Poids (kg)" type="number" placeholder="75" value={weight} onChange={e => setWeight(e.target.value)} />
            <Input label="Notes" placeholder="Ex: Après 1 mois" value={note} onChange={e => setNote(e.target.value)} />
            {uploadError && (
              <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{uploadError}</p>
            )}
            <Button fullWidth onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? 'Envoi en cours...' : '📸 Sélectionner une photo'}
            </Button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={upload} />
          </div>
        </Card>

        {/* Before / After */}
        {photos.length >= 2 && (
          <Card>
            <p className="text-sm font-semibold text-slate-700 mb-3">Avant / Après</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <img src={photos[photos.length - 1].photo_url} className="w-full h-36 object-cover rounded-xl" alt="avant" />
                <p className="text-xs text-slate-500 mt-1 text-center">Avant</p>
              </div>
              <div>
                <img src={photos[0].photo_url} className="w-full h-36 object-cover rounded-xl" alt="après" />
                <p className="text-xs text-slate-500 mt-1 text-center">Après</p>
              </div>
            </div>
          </Card>
        )}

        {/* Gallery */}
        {photos.length > 0 && (
          <Card>
            <p className="text-sm font-semibold text-slate-700 mb-3">Galerie</p>
            <div className="grid grid-cols-2 gap-3">
              {photos.map(p => (
                <div key={p.id} className="relative rounded-xl overflow-hidden aspect-square">
                  <img src={p.photo_url} className="w-full h-full object-cover" alt="progress" />
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-2">
                    {new Date(p.taken_at).toLocaleDateString('fr-FR')}
                    {p.weight_kg ? ` · ${p.weight_kg}kg` : ''}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
