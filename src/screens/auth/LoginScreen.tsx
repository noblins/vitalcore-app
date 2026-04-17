import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import { Alert } from '../../components/ui/Card'

export default function LoginScreen() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setError('')
    setLoading(true)
    const result = await login(email, password)
    setLoading(false)
    if (result.error) setError(result.error)
    else navigate('/dashboard', { replace: true })
  }

  return (
    <div className="max-w-[430px] mx-auto bg-white min-h-screen flex flex-col">
      <div className="bg-gradient-to-br from-primary to-secondary text-white p-4 text-center">
        <h1 className="text-2xl font-bold">Connexion</h1>
      </div>
      <div className="flex-1 flex flex-col gap-4 px-6 pt-8">
        {error && <Alert type="error">{error}</Alert>}
        <Input label="Email" type="email" placeholder="votre@email.com" value={email}
          onChange={e => setEmail(e.target.value)} autoComplete="email" />
        <Input label="Mot de passe" type="password" placeholder="••••••••" value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
          autoComplete="current-password" />
        <Button fullWidth onClick={handleLogin} disabled={loading}>
          {loading ? 'Connexion...' : 'Se Connecter'}
        </Button>
        <Button fullWidth variant="ghost" onClick={() => navigate('/welcome')}>Retour</Button>
      </div>
    </div>
  )
}
