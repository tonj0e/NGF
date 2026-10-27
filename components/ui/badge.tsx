'use client'
import * as React from 'react'
import { cn } from '@/lib/utils'

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info'
  size?: 'default' | 'sm' | 'lg'
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2',
        {
          'border-transparent bg-ink text-white hover:bg-black/80': variant === 'default',
          'border-transparent bg-mist text-ink hover:bg-line': variant === 'secondary',
          'border-transparent bg-red-500 text-white hover:bg-red-600': variant === 'destructive',
          'border-line text-ink hover:bg-mist': variant === 'outline',
          'border-transparent bg-green-500 text-white hover:bg-green-600': variant === 'success',
          'border-transparent bg-amber-500 text-white hover:bg-amber-600': variant === 'warning',
          'border-transparent bg-blue-500 text-white hover:bg-blue-600': variant === 'info',
          'px-2 py-0.5 text-[10px]': size === 'sm',
          'px-3 py-1 text-xs': size === 'default',
          'px-4 py-1.5 text-sm': size === 'lg',
        },
        className
      )}
      {...props}
    />
  )
)
Badge.displayName = 'Badge'

export { Badge }