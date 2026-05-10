import { useEffect } from 'react'
import { usePWAInstall } from '../hooks/usePWAInstall'

interface Props {
  onClose: () => void
}

/**
 * Bottom-sheet modal that explains how to install the PWA.
 * - On Android/Chromium : triggers the native install prompt.
 * - On iOS Safari : shows manual instructions (Apple doesn't allow JS install).
 */
export default function InstallPromptModal({ onClose }: Props) {
  const { isIOS, canPromptAndroid, promptAndroid, snooze } = usePWAInstall()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleAndroidInstall = async () => {
    const outcome = await promptAndroid()
    if (outcome !== 'unavailable') onClose()
  }

  const handleSnooze = () => { snooze(); onClose() }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-modal-title"
      className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl w-full max-w-[430px] p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" aria-hidden />

        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-2xl">
            📲
          </div>
          <div>
            <h2 id="install-modal-title" className="text-lg font-bold text-slate-800">
              Installer VitalCore
            </h2>
            <p className="text-xs text-slate-500">Comme une vraie app — sans la barre Safari</p>
          </div>
        </div>

        <p className="text-sm text-slate-600 mb-5 leading-relaxed">
          Lancez l'app en plein écran depuis votre écran d'accueil, sans barre URL ni onglets.
          Plus rapide, plus immersif, exactement comme une application native.
        </p>

        {isIOS ? (
          // iOS — Safari ne permet pas l'install programmatique : instructions visuelles
          <div className="bg-slate-50 rounded-2xl p-4 mb-4 border border-slate-200">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">
              Sur iPhone / iPad
            </p>
            <ol className="flex flex-col gap-3 text-sm text-slate-700">
              <li className="flex items-start gap-3">
                <span className="shrink-0 w-7 h-7 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">1</span>
                <span>
                  Touchez l'icône <span className="inline-flex items-baseline gap-0.5"><span className="text-blue-500 font-bold">⬆️</span></span> <strong>Partager</strong> en bas de Safari
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="shrink-0 w-7 h-7 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">2</span>
                <span>Faites défiler et choisissez <strong>« Sur l'écran d'accueil »</strong></span>
              </li>
              <li className="flex items-start gap-3">
                <span className="shrink-0 w-7 h-7 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">3</span>
                <span>Touchez <strong>Ajouter</strong> en haut à droite</span>
              </li>
            </ol>
            <p className="text-xs text-slate-400 mt-3 italic">
              Ouvrez ensuite VitalCore depuis l'icône d'écran d'accueil — la barre Safari disparaîtra.
            </p>
          </div>
        ) : canPromptAndroid ? (
          // Android — native prompt available
          <button
            onClick={handleAndroidInstall}
            className="w-full bg-gradient-to-r from-primary to-secondary text-white rounded-xl py-3.5 font-bold mb-3 active:scale-95 transition-transform"
          >
            📲 Installer l'application
          </button>
        ) : (
          // Other browsers / desktop — generic instructions
          <div className="bg-slate-50 rounded-2xl p-4 mb-4 border border-slate-200">
            <p className="text-sm text-slate-700">
              Ouvrez le menu de votre navigateur et cherchez <strong>« Installer l'application »</strong> ou <strong>« Ajouter à l'écran d'accueil »</strong>.
            </p>
          </div>
        )}

        <button
          onClick={handleSnooze}
          className="w-full text-sm text-slate-400 hover:text-slate-600 py-3 min-h-[44px] mb-1"
        >
          Ne pas me redemander cette semaine
        </button>
        <button
          onClick={onClose}
          className="w-full text-sm text-slate-500 hover:text-slate-700 py-3 min-h-[44px] font-semibold"
        >
          Plus tard
        </button>
      </div>
    </div>
  )
}
