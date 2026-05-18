// app/components/EvidenceModal.tsx
'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import type { Evidence, StandardTC } from '@/lib/types'

interface Props {
  tc: { id: string; title: string; expected?: string }
  evidence: Evidence
  onSave: (tcId: string, ev: Evidence) => void
  onClose: () => void
  onAICheck?: (verdict: string, reasoning: string) => void
}

async function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('Not an image')); return }
    const img = document.createElement('img')
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const [maxW, maxH] = [800, 600]
      let w = img.width, h = img.height
      if (w > maxW || h > maxH) { const r = Math.min(maxW / w, maxH / h); w = Math.round(w * r); h = Math.round(h * r) }
      const c = document.createElement('canvas')
      c.width = w; c.height = h
      const ctx = c.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('No context')); return }
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', 0.8))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Load failed')) }
    img.src = url
  })
}

type Tab = 'screenshot' | 'api' | 'db' | 'notes'

export function EvidenceModal({ tc, evidence, onSave, onClose, onAICheck }: Props) {
  const [tab, setTab] = useState<Tab>('screenshot')
  const [draft, setDraft] = useState<Evidence>({ ...evidence })
  const [imgDragOver, setImgDragOver] = useState(false)
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<{ verdict: string; reasoning: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const addImages = useCallback(async (files: FileList | File[]) => {
    const imgs = Array.from(files).filter(f => f.type.startsWith('image/'))
    const results = await Promise.allSettled(imgs.map(resizeImage))
    const valid = results.flatMap(r => r.status === 'fulfilled' ? [r.value] : [])
    setDraft(d => ({ ...d, screenshots: [...d.screenshots, ...valid].slice(0, 5) }))
  }, [])

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (tab !== 'screenshot') return
      const files = Array.from(e.clipboardData?.items ?? [])
        .filter(i => i.kind === 'file' && i.type.startsWith('image/'))
        .map(i => i.getAsFile())
        .filter((f): f is File => f !== null)
      if (files.length) addImages(files)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [tab, addImages])

  async function handleAICheck() {
    setChecking(true)
    setCheckResult(null)
    try {
      const res = await fetch('/api/ai-check-evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expected: tc.expected ?? '',
          apiResponse: draft.apiResponse,
          dbResult: draft.dbResult,
          notes: draft.notes,
          screenshots: draft.screenshots,
        }),
      })
      const data = await res.json() as { verdict?: string; reasoning?: string }
      const result = { verdict: data.verdict ?? 'inconclusive', reasoning: data.reasoning ?? '' }
      setCheckResult(result)
      onAICheck?.(result.verdict, result.reasoning)
    } catch {
      setCheckResult({ verdict: 'inconclusive', reasoning: 'AI check failed' })
    } finally {
      setChecking(false)
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'screenshot', label: `Screenshots (${draft.screenshots.length})` },
    { key: 'api', label: 'API Response' },
    { key: 'db', label: 'DB Result' },
    { key: 'notes', label: 'Notes' },
  ]

  const verdictColor = checkResult?.verdict === 'pass' ? 'text-success bg-green-50 border-green-200'
    : checkResult?.verdict === 'fail' ? 'text-danger bg-red-50 border-red-200'
    : 'text-warn bg-amber-50 border-amber-200'

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-card shadow-xl w-full max-w-xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <div>
            <h2 className="text-sm font-semibold text-ink-900">Evidence — <span className="tc-id">{tc.id}</span></h2>
            <p className="text-xs text-ink-500 mt-0.5 truncate max-w-sm">{tc.title}</p>
          </div>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700 transition-colors p-1">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-ink-100">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                tab === t.key ? 'border-accent text-accent' : 'border-transparent text-ink-500 hover:text-ink-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'screenshot' && (
            <div className="space-y-3">
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${imgDragOver ? 'border-accent bg-accent/5' : 'border-ink-200 hover:border-ink-300'}`}
                onDragOver={e => { e.preventDefault(); setImgDragOver(true) }}
                onDragLeave={() => setImgDragOver(false)}
                onDrop={async e => { e.preventDefault(); setImgDragOver(false); await addImages(e.dataTransfer.files) }}
                onClick={() => fileRef.current?.click()}
              >
                <p className="text-xs text-ink-400">Drop screenshots here · Ctrl+V to paste · <span className="underline">Browse</span></p>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={e => e.target.files && addImages(e.target.files)} />
              </div>
              {draft.screenshots.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {draft.screenshots.map((src, i) => (
                    <div key={i} className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="h-20 w-28 object-cover rounded border border-ink-200" />
                      <button onClick={() => setDraft(d => ({ ...d, screenshots: d.screenshots.filter((_, j) => j !== i) }))}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-danger text-white rounded-full text-xs hidden group-hover:flex items-center justify-center">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'api' && (
            <textarea value={draft.apiResponse} onChange={e => setDraft(d => ({ ...d, apiResponse: e.target.value }))}
              rows={10} placeholder={'{\n  "status": "ok",\n  "data": {...}\n}'}
              className="w-full font-mono text-xs bg-ink-900 text-green-400 rounded-lg p-3 border border-ink-700 resize-none focus:outline-none" />
          )}

          {tab === 'db' && (
            <textarea value={draft.dbResult} onChange={e => setDraft(d => ({ ...d, dbResult: e.target.value }))}
              rows={10} placeholder="Paste SQL query result or DB output…"
              className="w-full font-mono text-xs bg-ink-900 text-green-400 rounded-lg p-3 border border-ink-700 resize-none focus:outline-none" />
          )}

          {tab === 'notes' && (
            <textarea value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
              rows={8} placeholder="Observation notes, environment details, or other context…"
              className="w-full text-sm border border-ink-200 rounded-lg p-3 resize-none focus:outline-none focus:border-accent" />
          )}

          {/* AI Check result */}
          {checkResult && (
            <div className={`mt-3 px-3 py-2 rounded-lg border text-xs ${verdictColor}`}>
              <span className="font-semibold capitalize">{checkResult.verdict}</span> — {checkResult.reasoning}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-ink-100">
          {tc.expected && (
            <button onClick={handleAICheck} disabled={checking}
              className="btn-ghost text-xs disabled:opacity-40 flex items-center gap-1.5">
              {checking ? (
                <svg className="animate-spin" width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" /><path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 1L10 6H15L11 9.5L12.5 15L8 11.5L3.5 15L5 9.5L1 6H6L8 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
              )}
              AI check
            </button>
          )}
          {!tc.expected && <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost text-xs">Cancel</button>
            <button onClick={() => { onSave(tc.id, draft); onClose() }} className="btn-primary text-xs">Save evidence</button>
          </div>
        </div>
      </div>
    </div>
  )
}
