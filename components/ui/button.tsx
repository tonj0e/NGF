'use client'
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '@/lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  asChild?: boolean
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', asChild = false, loading, disabled, children, ...props }, ref) => {
    
    const variants = {
      default: 'bg-[#1a1a2e] text-white hover:bg-black/90 shadow-sm',
      destructive: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
      outline: 'border border-[#e5e7eb] bg-white text-[#1a1a2e] hover:bg-[#f4f5f7]',
      secondary: 'bg-[#f4f5f7] text-[#1a1a2e] hover:bg-[#e5e7eb]',
      ghost: 'hover:bg-[#f4f5f7] text-[#1a1a2e]',
      link: 'text-[#1a1a2e] underline-offset-4 hover:underline',
    }
    
    const sizes = {
      default: 'h-10 px-4 py-2',
      sm: 'h-8 px-3 text-xs',
      lg: 'h-12 px-8 text-base',
      icon: 'h-10 w-10',
    }

    const baseClass = cn(
      'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
      'active:scale-[0.98]',
      variants[variant],
      sizes[size],
      className
    )

    const baseButtonProps = {
      ref,
      disabled: disabled || loading,
      className: baseClass,
      ...props
    }

    const loadingSpinner = (
      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    )

    if (asChild) {
      return (
        <Slot>
          <button
            ref={ref}
            disabled={disabled || loading}
            className={baseClass}
            {...props}
          >
            {loading && loadingSpinner}
            {children}
          </button>
        </Slot>
      )
    }

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={baseClass}
        {...props}
      >
        {loading && loadingSpinner}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'

export { Button }