import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'

export default function WelcomeScreen() {
  const navigate = useNavigate()
  return (
    <div className="max-w-[430px] mx-auto bg-white min-h-screen flex flex-col">
      <div className="bg-gradient-to-br from-primary to-secondary text-white p-4 text-center">
        <h1 className="text-2xl font-bold mb-1">VitalCore</h1>
        <p className="text-sm opacity-90">Votre assistant santé et nutrition</p>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
        <div className="text-7xl mb-6">💚</div>
        <h2 className="text-xl font-bold text-slate-800 text-center mb-6">Bienvenue sur VitalCore</h2>
        <Button fullWidth onClick={() => navigate('/login')}>Se Connecter</Button>
        <Button fullWidth variant="secondary" onClick={() => navigate('/signup')}>S'inscrire</Button>
      </div>
    </div>
  )
}
