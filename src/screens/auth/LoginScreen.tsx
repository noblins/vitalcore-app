import { useState, useRef, useEffect } from 'react'
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
  const [slowHint, setSlowHint] = useState(false)
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Show "slow connection" hint after 5s
  useEffect(() => {
    if (loading) {
      slowTimer.current = setTimeout(() => setSlowHint(true), 5000)
    } else {
      setSlowHint(false)
      if (slowTimer.current) clearTimeout(slowTimer.current)
    }
    return () => {
      if (slowTimer.current) clearTimeout(slowTimer.current)
    }
  }, [loading])

  const handleLogin = async () => {
    if (loading) return
    setError('')
    setSlowHint(false)
    setLoading(true)
    try {
      const result = await login(email, password)
      if (result.error) {
        setError(result.error)
      } else {
        navigate('/dashboard', { replace: true })
      }
    } catch (e: any) {
      setError(e?.message || 'Erreur inattendue. Réessayez.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-[430px] mx-auto bg-white min-h-dvh flex flex-col">
      <div className="bg-gradient-to-br from-primary to-secondary text-white p-4 text-center">
        <h1 className="text-2xl font-bold">Connexion</h1>
      </div>
      <form
        className="flex-1 flex flex-col gap-4 px-6 pt-8"
        onSubmit={e => { e.preventDefault(); handleLogin() }}
      >
        {error && <Alert type="error">{error}</Alert>}
        {slowHint && !error && (
          <Alert type="error">
            La connexion prend du temps. Vérifiez votre connexion internet.
          </Alert>
        )}
        <Input
          label="Email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          placeholder="votre@email.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          autoComplete="email"
          disabled={loading}
          required
        />
        <Input
          label="Mot de passe"
          type="password"
          enterKeyHint="go"
          placeholder="••••••••"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoComplete="current-password"
          disabled={loading}
          required
        />
        <Button type="submit" fullWidth disabled={loading}>
          {loading ? 'Connexion...' : 'Se Connecter'}
        </Button>
        <Button
          type="button"
          fullWidth
          variant="ghost"
          onClick={() => navigate('/welcome')}
          disabled={loading}
        >
          Retour
        </Button>
      </form>
    </div>
  )
}
