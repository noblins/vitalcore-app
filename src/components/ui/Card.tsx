import React from 'react'
interface CardProps {
  children: React.ReactNode
  gradient?: boolean
  feature?: boolean
  className?: string
  onClick?: () => void
}

export default function Card({ children, gradient, feature, className = '', onClick }: CardProps) {
  return (
    <div
      className={`
        rounded-xl p-4 mb-4
        ${gradient
          ? 'bg-gradient-to-br from-primary to-secondary text-white border-none shadow-md'
          : feature
            ? 'bg-blue-50 border-none cursor-pointer hover:-translate-y-1 hover:shadow-md transition-all'
            : 'bg-white border border-slate-200 shadow-sm'
        }
        ${onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md transition-all' : ''}
        ${className}
      `}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

export function Alert({ type, children }: { type: 'error' | 'success'; children: React.ReactNode }) {
  const styles = {
    error: 'bg-red-50 text-red-700 border-l-4 border-red-500',
    success: 'bg-green-50 text-green-700 border-l-4 border-green-500',
  }
  return (
    <div className={`${styles[type]} p-3 rounded-lg text-sm mb-3`}>{children}</div>
  )
}

export function Spinner({ size = 8 }: { size?: number }) {
  return (
    <div className={`w-${size} h-${size} border-2 border-primary border-t-transparent rounded-full animate-spin`} />
  )
}
