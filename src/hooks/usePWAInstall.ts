import { useEffect, useState, useCallback } from 'react'

/**
 * Native browser event for installable PWA (Android / Chromium).
 * iOS Safari does NOT fire this — installation must go through
 * the Share menu manually.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'vitalcore_install_dismissed_until'
const SNOOZE_DAYS = 7

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    // iPadOS 13+ pretends to be macOS, but has touch
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isInStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false
  // Modern way (Android, iOS 13+)
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  // Legacy iOS Safari
  // @ts-expect-error — Safari-only API
  if (window.navigator.standalone === true) return true
  return false
}

function isDismissed(): boolean {
  try {
    const ts = localStorage.getItem(DISMISSED_KEY)
    if (!ts) return false
    return parseInt(ts, 10) > Date.now()
  } catch {
    return false
  }
}

export interface PWAInstall {
  /** App is already installed (running in standalone mode). */
  isStandalone: boolean
  /** True when running on iOS — install must be done via Share menu. */
  isIOS: boolean
  /** True when an Android-style native prompt is available. */
  canPromptAndroid: boolean
  /** Trigger the Android native install prompt. Returns 'accepted'/'dismissed'. */
  promptAndroid: () => Promise<'accepted' | 'dismissed' | 'unavailable'>
  /** True if the user has dismissed the prompt recently — caller should hide UI. */
  isSnoozed: boolean
  /** Snooze the prompt for `SNOOZE_DAYS` days. */
  snooze: () => void
}

export function usePWAInstall(): PWAInstall {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [standalone, setStandalone] = useState(() => isInStandaloneMode())
  const [snoozed, setSnoozed] = useState(() => isDismissed())

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstallEvent(null)
      setStandalone(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)

    // Watch display-mode changes (e.g. user installs while app is open)
    const mq = window.matchMedia?.('(display-mode: standalone)')
    const onMqChange = () => setStandalone(isInStandaloneMode())
    mq?.addEventListener?.('change', onMqChange)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
      mq?.removeEventListener?.('change', onMqChange)
    }
  }, [])

  const promptAndroid = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!installEvent) return 'unavailable'
    await installEvent.prompt()
    const { outcome } = await installEvent.userChoice
    setInstallEvent(null)
    if (outcome === 'dismissed') {
      // Don't snooze on dismiss here — the in-app modal handles snooze choice
    }
    return outcome
  }, [installEvent])

  const snooze = useCallback(() => {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now() + SNOOZE_DAYS * 86400000))
    } catch { /* ignore */ }
    setSnoozed(true)
  }, [])

  return {
    isStandalone: standalone,
    isIOS: isIOS(),
    canPromptAndroid: !!installEvent,
    promptAndroid,
    isSnoozed: snoozed,
    snooze,
  }
}
