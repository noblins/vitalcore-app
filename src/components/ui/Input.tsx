import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  /** When type="number", set this to get the right mobile keyboard */
  numericKeyboard?: 'decimal' | 'numeric'
}

export default function Input({
  label,
  className = '',
  type,
  numericKeyboard,
  inputMode,
  ...props
}: InputProps) {
  // Auto-derive inputMode for number inputs (iOS/Android show decimal keypad)
  const computedInputMode =
    inputMode ?? (type === 'number' ? (numericKeyboard ?? 'decimal') : undefined)

  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-semibold text-slate-700">{label}</label>}
      <input
        type={type}
        inputMode={computedInputMode}
        className={`
          border border-slate-200 rounded-lg px-3 py-3 text-base w-full bg-white
          focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20
          transition-colors placeholder:text-slate-400
          disabled:opacity-50 disabled:cursor-not-allowed
          ${className}
        `}
        {...props}
      />
    </div>
  )
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
}

export function Select({ label, className = '', children, ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-semibold text-slate-700">{label}</label>}
      <select
        className={`
          border border-slate-200 rounded-lg px-3 py-3 text-base w-full bg-white
          focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20
          transition-colors appearance-none
          disabled:opacity-50 disabled:cursor-not-allowed
          ${className}
        `}
        {...props}
      >
        {children}
      </select>
    </div>
  )
}
