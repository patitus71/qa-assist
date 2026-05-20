// app/components/StepEvidenceModal.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

async function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('Not an image')); return }
    const img = document.createElement('img')
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const [maxW, maxH] = [1400, 1000]
      let w = img.width, h = img.height
      if (w > maxW || h > maxH) { const r = Math.min(maxW / w, maxH / h); w = Math.round(w * r); h = Math.round(h * r) }
      const c = document.createElement('canvas')
      c.width = w; c.height = h
      c.getContext('2d')?.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', 0.88))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load')) }
    img.src = url
  })
}

interface Props {
  stepLabel: string       // e.g. "Step 3"
  images: string[]        // current images (base64)
  onSave: (imgs: string[]) => void
  onClose: () => void
}

export function StepEvidenceModal({ stepLabel, images, onSave, onClose }: Props) {
  const [current, setCurrent] = useState<string[]>(images)
  const [dragOver, setDragOver]   = useState(false)
  const [loading, setLoading]     = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (!arr.length) return
    setLoading(true)
    const resized = await Promise.allSettled(arr.map(resizeImage))
    const valid = resized.flatMap(r => r.status === 'fulfilled' ? [r.value] : [])
    setCurrent(prev => [...prev, ...valid])
    setLoading(false)
  }, [])

  // Document-level paste while this modal is open
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items
      if (!items) return
      const files = Array.from(items)
        .filter(i => i.kind === 'file' && i.type.startsWith('image/'))
        .map(i => i.getAsFile())
        .filter((f): f is File => f !== null)
      if (files.length) addFiles(files)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [addFiles])

  function remove(idx: number) {
    setCurrent(prev => prev.filter((_, i) => i !== idx))
  }

  function handleSave() {
    onSave(current)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-xl w-full max-w-sm overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink-100 dark:border-ink-700">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-accent">
              <path d="M1 5a1 1 0 0 1 1-1h1.5l1-2h5l1 2H14a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5z" stroke="currentColor" strokeWidth="1.5"/>
              <circle cx="8" cy="8.5" r="2" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            <span className="text-sm font-semibold text-ink-900 dark:text-ink-100">{stepLabel} — Evidence</span>
          </div>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-600 leading-none text-base">✕</button>
        </div>

        <div className="p-4 space-y-3">

          {/* Upload zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
              dragOver
                ? 'border-accent bg-accent/5'
                : 'border-ink-200 dark:border-ink-600 hover:border-ink-300 dark:hover:border-ink-500'
            }`}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={async e => { e.preventDefault(); setDragOver(false); await addFiles(e.dataTransfer.files) }}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }}
            />
            {loading ? (
              <span className="text-xs text-ink-500">Processing…</span>
            ) : (
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-ink-600 dark:text-ink-300">Click to upload or drag here</p>
                <p className="text-[10px] text-ink-400">or Ctrl+V to paste from clipboard</p>
              </div>
            )}
          </div>

          {/* Thumbnails */}
          {current.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {current.map((src, i) => (
                <div key={i} className="relative group aspect-video">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt=""
                    className="w-full h-full object-cover rounded border border-ink-200 dark:border-ink-600"
                  />
                  <button
                    onClick={() => remove(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-danger text-white rounded-full text-xs leading-none hidden group-hover:flex items-center justify-center shadow"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {current.length === 0 && (
            <p className="text-xs text-ink-400 text-center">No screenshots attached yet</p>
          )}

        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-ink-100 dark:border-ink-700 flex items-center justify-between">
          <span className="text-[10px] text-ink-400">
            {current.length > 0 ? `${current.length} screenshot${current.length !== 1 ? 's' : ''}` : ''}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost text-sm py-1">Cancel</button>
            <button onClick={handleSave} className="btn-primary text-sm py-1">
              {current.length === 0 ? 'Clear & Done' : 'Save'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
