'use client'

import { useState, FormEvent } from 'react'
import { motion } from 'framer-motion'
import { X, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface AddBranchDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (name: string) => Promise<void>
  loading?: boolean
}

export function AddBranchDialog({ open, onClose, onSubmit, loading }: AddBranchDialogProps) {
  const [name, setName] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || loading) return
    await onSubmit(name.trim())
    setName('')
    onClose()
  }

  if (!open) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Add New Branch</h2>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="branchName" className="block text-sm font-medium text-gray-700 mb-1.5">
              Branch Name
            </label>
            <Input
              id="branchName"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., NGF HQ, Chammanad Branch"
              className="w-full"
              autoFocus
              disabled={loading}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={loading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || loading}
              className="flex-1"
            >
              {loading ? 'Adding...' : 'Add Branch'}
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}