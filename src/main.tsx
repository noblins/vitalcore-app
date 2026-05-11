import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import App from './App'
import './index.css'

// One-time migration : copy any legacy `vitalcore_*` localStorage keys to `hirow_*`
// so existing users keep their water goal, food prefs and PWA install snooze.
;(function migrateLocalStorageKeys() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith('vitalcore_')) continue
      const newKey = 'hirow_' + key.slice('vitalcore_'.length)
      if (localStorage.getItem(newKey) == null) {
        const val = localStorage.getItem(key)
        if (val != null) localStorage.setItem(newKey, val)
      }
    }
  } catch { /* localStorage unavailable in some private modes — ignore */ }
})()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
