import React from 'react'
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export default function Input({ label, className = '', ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-semibold text-slate-700">{label}</label>}
      <input
        className={`
          border border-slate-200 rounded-lg px-3 py-3 text-sm w-full bg-white
          focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20
          transition-colors placeholder:text-slate-400
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
          border border-slate-200 rounded-lg px-3 py-3 text-sm w-full bg-white
          focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20
          transition-colors appearance-none
          ${className}
        `}
        {...props}
      >
        {children}
      </select>
    </div>
  )
}
