'use client'
import * as React from 'react'
import { cn } from '@/lib/utils'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  helperText?: string
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, helperText, id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className="block text-xs font-semibold uppercase tracking-wider text-soft mb-1.5">
            {label}
          </label>
        )}
        <textarea
          id={textareaId}
          className={cn(
            'w-full rounded-xl border bg-white px-4 py-3 text-sm outline-none transition-all duration-200 resize-y min-h-[80px]',
            'placeholder:text-gray-400',
            'disabled:bg-mist disabled:cursor-not-allowed',
            error
              ? 'border-red-300 text-red-900 focus:border-red-500 focus:ring-2 focus:ring-red-200'
              : 'border-line focus:border-ink focus:ring-2 focus:ring-ink/20',
            className
          )}
          ref={ref}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${textareaId}-error` : helperText ? `${textareaId}-helper` : undefined}
          {...props}
        />
        {error && (
          <p id={`${textareaId}-error`} className="mt-1.5 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={`${textareaId}-helper`} className="mt-1.5 text-sm text-soft">
            {helperText}
          </p>
        )}
      </div>
    )
  }
)
Textarea.displayName = 'Textarea'

export { Textarea }