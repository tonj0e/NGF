'use client'
import { useState } from 'react'
import { Download, Share, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { promptInstall, useInstall } from '@/lib/pwa'

// A small button in the header: installs the app where the browser allows it, otherwise shows the iPhone steps.
// Hidden once the app is installed or when the browser cannot install.
export default function InstallAppButton() {
  const { canPrompt, standalone, ios } = useInstall()
  const [help, setHelp] = useState(false)
  if (standalone || (!canPrompt && !ios)) return null
  return (
    <>
      <Button variant="ghost" size="icon" aria-label="Install app" title="Install app"
        onClick={async () => { if (!(await promptInstall())) setHelp(true) }}>
        <Download className="h-5 w-5" />
      </Button>
      {help && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/30 p-4 sm:items-center" onClick={() => setHelp(false)}>
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <button onClick={() => setHelp(false)} aria-label="Close" className="absolute right-3 top-3 rounded-full p-1.5 text-soft hover:bg-mist"><X className="h-4 w-4" /></button>
            <p className="text-base font-semibold">Install NGF FINCORP</p>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink">
              <li>Open this page in <b>Safari</b>.</li>
              <li>Tap <Share className="mx-0.5 inline h-4 w-4 align-text-bottom" /> <b>Share</b>.</li>
              <li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>
            </ol>
          </div>
        </div>
      )}
    </>
  )
}
