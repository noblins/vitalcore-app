import React from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { sb } from '../../lib/supabase'
import { calcAge, calcBMR, calcTDEE } from '../../utils/calculations'
import Button from '../../components/ui/Button'
import Input, { Select } from '../../components/ui/Input'

interface ObData {
  gender: string; dob: string; height: string; weight: string
  goal: string; targetWeight: string; activity: string; glp1: string; diet: string
}

export default function OnboardingScreen() {
  const { user, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<ObData>({
    gender: '', dob: '', height: '', weight: '', goal: '',
    targetWeight: '', activity: '', glp1: '', diet: '',
  })

  const set = (k: keyof ObData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setData(p => ({ ...p, [k]: e.target.value }))

  const steps = [
    { title: 'Genre',
      body: <Select label="Sélectionnez votre genre" value={data.gender} onChange={set('gender')}>
        <option value="">Choisir</option>
        <option value="male">Homme</option>
        <option value="female">Femme</option>
        <option value="other">Autre</option>
      </Select> },
    { title: 'Date de naissance',
      body: <Input label="Votre date de naissance" type="date" value={data.dob} onChange={set('dob')} /> },
    { title: 'Mesures',
      body: <div className="flex flex-col gap-3">
        <Input label="Taille (cm)" type="number" placeholder="170" value={data.height} onChange={set('height')} />
        <Input label="Poids (kg)" type="number" placeholder="75" value={data.weight} onChange={set('weight')} />
      </div> },
    { title: 'Objectif',
      body: <Select label="Quel est votre objectif?" value={data.goal} onChange={set('goal')}>
        <option value="">Choisir</option>
        <option value="lose">Perdre du poids</option>
        <option value="maintain">Maintenir</option>
        <option value="gain">Gagner du muscle</option>
        <option value="health">Santé générale</option>
      </Select> },
    { title: 'Poids cible',
      body: <Input label="Poids cible (kg)" type="number" placeholder="70" value={data.targetWeight} onChange={set('targetWeight')} /> },
    { title: "Niveau d'activité",
      body: <Select label="Niveau d'activité" value={data.activity} onChange={set('activity')}>
        <option value="">Choisir</option>
        <option value="sedentary">Sédentaire</option>
        <option value="light">Léger</option>
        <option value="moderate">Modéré</option>
        <option value="active">Actif</option>
        <option value="very_active">Très actif</option>
      </Select> },
    { title: 'Médicament GLP-1',
      body: <Select label="Utilisez-vous un médicament GLP-1?" value={data.glp1} onChange={set('glp1')}>
        <option value="">Non</option>
        <option value="ozempic">Ozempic</option>
        <option value="mounjaro">Mounjaro</option>
        <option value="saxenda">Saxenda</option>
        <option value="wegovy">Wegovy</option>
      </Select> },
    { title: 'Régime alimentaire',
      body: <Select label="Type de régime" value={data.diet} onChange={set('diet')}>
        <option value="">Choisir</option>
        <option value="standard">Standard</option>
        <option value="keto">Cétogène</option>
        <option value="vegetarian">Végétarien</option>
        <option value="vegan">Vegan</option>
        <option value="mediterranean">Méditerranéen</option>
        <option value="gluten_free">Sans gluten</option>
      </Select> },
  ]

  const handleFinish = async () => {
    if (!user) return
    setError('')

    // Validate DOB
    const age = calcAge(data.dob)
    if (!data.dob || age < 10 || age > 110) {
      setError('Veuillez entrer une date de naissance valide.')
      return
    }
    const w = parseFloat(data.weight)
    const h = parseFloat(data.height)
    if (!w || w < 20 || w > 500) { setError('Poids invalide (entre 20 et 500 kg).'); return }
    if (!h || h < 100 || h > 250) { setError('Taille invalide (entre 100 et 250 cm).'); return }

    setLoading(true)
    try {
      const bmr = calcBMR(data.gender, w, h, age)
      const tdee = calcTDEE(bmr, data.activity)

      const { error: updateErr } = await sb.from('profiles').update({
        gender: data.gender, date_of_birth: data.dob, age,
        height_cm: h, weight_kg: w,
        target_weight_kg: parseFloat(data.targetWeight) || w,
        goal: data.goal, activity_level: data.activity,
        diet: data.diet, tdee, onboarding_completed: true,
      }).eq('id', user.id)

      if (updateErr) { setError('Erreur lors de l\'enregistrement. Réessayez.'); return }

      if (data.glp1) {
        const nextInj = new Date(); nextInj.setDate(nextInj.getDate() + 7)
        await sb.from('medications').insert({
          user_id: user.id,
          medication_name: data.glp1.charAt(0).toUpperCase() + data.glp1.slice(1),
          dose_current: '0.25', dose_unit: 'mg', injection_day: 'Lundi',
          start_date: new Date().toISOString().split('T')[0],
          next_injection: nextInj.toISOString().split('T')[0],
          active: true,
        })
      }

      await refreshProfile(user.id)
      navigate('/dashboard', { replace: true })
    } catch {
      setError('Une erreur est survenue. Vérifiez votre connexion.')
    } finally {
      setLoading(false)
    }
  }

  const current = steps[step]
  const progress = ((step + 1) / steps.length) * 100

  return (
    <div className="max-w-[430px] mx-auto bg-white min-h-screen flex flex-col">
      <div className="p-6 flex flex-col gap-6 pt-10 flex-1">
        <div>
          <div className="w-full h-2 bg-slate-100 rounded-full mb-6 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }} />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-6">{current.title}</h2>
          {current.body}
        </div>
      </div>
      {error && (
        <div className="mx-6 mb-2 bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>
      )}
      <div className="p-6 flex gap-3">
        {step > 0 && (
          <Button variant="secondary" className="flex-1" onClick={() => setStep(s => s - 1)}>Précédent</Button>
        )}
        {step < steps.length - 1 ? (
          <Button className="flex-1" onClick={() => { setError(''); setStep(s => s + 1) }}>Suivant</Button>
        ) : (
          <Button className="flex-1" onClick={handleFinish} disabled={loading}>
            {loading ? 'Enregistrement...' : 'Terminer'}
          </Button>
        )}
      </div>
    </div>
  )
}
