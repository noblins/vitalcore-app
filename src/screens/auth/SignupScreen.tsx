import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import { Alert } from '../../components/ui/Card'

export default function SignupScreen() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [slowHint, setSlowHint] = useState(false)
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const handleSignup = async () => {
    if (loading) return
    setError(''); setSuccess(''); setSlowHint(false)
    setLoading(true)
    try {
      const result = await signup(email, password)
      if (result.error) setError(result.error)
      else if (result.success) setSuccess(result.success)
      else navigate('/onboarding', { replace: true })
    } catch (e: any) {
      setError(e?.message || 'Erreur inattendue. Réessayez.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-[430px] mx-auto bg-white min-h-dvh flex flex-col">
      <div className="bg-gradient-to-br from-primary to-secondary text-white p-4 text-center">
        <h1 className="text-2xl font-bold">Inscription</h1>
      </div>
      <form
        className="flex-1 flex flex-col gap-4 px-6 pt-8"
        onSubmit={e => { e.preventDefault(); handleSignup() }}
      >
        {success && <Alert type="success">{success}</Alert>}
        {error && <Alert type="error">{error}</Alert>}
        {slowHint && !error && !success && (
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
          label="Mot de passe (min 8 caractères)"
          type="password"
          enterKeyHint="go"
          placeholder="••••••••"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          disabled={loading}
          required
        />
        <Button type="submit" fullWidth disabled={loading}>
          {loading ? 'Inscription...' : "S'inscrire"}
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
