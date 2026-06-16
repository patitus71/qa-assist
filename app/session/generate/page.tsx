// app/session/generate/page.tsx
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/session-context'
import type { TCMGroup, TCMRow, TCMState, TCPriority } from '@/lib/types'
import type { ParsedTCM } from '@/lib/parse-tcm'

type GenType = 'standard' | 'e2e' | 'api'

// ── Image resize ──────────────────────────────────────────────────────────────

async function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('Not an image')); return }
    const img = document.createElement('img')
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const maxW = 800, maxH = 600
      let w = img.width, h = img.height
      if (w > maxW || h > maxH) {
        const ratio = Math.min(maxW / w, maxH / h)
        w = Math.round(w * ratio); h = Math.round(h * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('No canvas context')); return }
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')) }
    img.src = url
  })
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconStandard() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-accent">
      <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function IconE2E() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-accent">
      <rect x="1" y="7" width="5" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="14" y="7" width="5" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="7.5" y="8" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 10h1.5M12.5 10H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function IconAPI() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-accent">
      <path d="M7 6L3 10l4 4M13 6l4 4-4 4M11 4l-2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconSpinner() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3" />
      <path d="M8 2a6 6 0 0 1 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

// ── GenCard ───────────────────────────────────────────────────────────────────

interface GenCardProps {
  icon: React.ReactNode
  title: string
  coverage: string
  description: string
  isGenerating: boolean
  error?: string
  onGenerate: () => void
}

function GenCard({ icon, title, coverage, description, isGenerating, error, onGenerate }: GenCardProps) {
  return (
    <div className="card p-5 flex flex-col">
      <div className="flex items-center gap-2.5 mb-3">
        {icon}
        <div>
          <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
          <p className="font-mono text-[10px] text-ink-400 tracking-wide">{coverage}</p>
        </div>
      </div>
      <p className="text-sm text-ink-500 flex-1 leading-relaxed">{description}</p>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
      <button
        className="btn-primary w-full mt-4 flex items-center justify-center gap-2"
        onClick={onGenerate}
        disabled={isGenerating}
      >
        {isGenerating && <IconSpinner />}
        {isGenerating ? 'Generating TCM…' : `Generate ${title} TCM`}
      </button>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function convertExistingToRows(groups: TCMGroup[], existingTCs: ParsedTCM['existingTCs']): TCMRow[] {
  return existingTCs.map((tc, i) => {
    if (tc.sectionLabel) {
      return {
        id: `TCM-section-${i}`,
        scenario: '',
        checks: {},
        posNeg: 'Positive' as const,
        priority: 'Med' as TCPriority,
        sectionLabel: tc.sectionLabel,
      }
    }
    return {
      id: `TCM-exist-${String(i + 1).padStart(2, '0')}`,
      scenario: tc.title,
      checks: Object.fromEntries(
        groups.map(g => [
          g.name,
          Object.fromEntries(g.values.map(v => [v, tc.combinations[g.name]?.includes(v) ?? false])),
        ])
      ),
      posNeg: 'Positive' as const,
      priority: 'Med' as TCPriority,
      isNew: false,
    }
  })
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GeneratePage() {
  const router = useRouter()
  const session = useSession()

  const [localReq, setLocalReq] = useState(session.requirement)
  const [localImages, setLocalImages] = useState<string[]>(session.images)
  const [imgDragOver, setImgDragOver] = useState(false)
  const imgInputRef = useRef<HTMLInputElement>(null)

  // Swagger
  const [showSwagger, setShowSwagger] = useState(false)
  const [swaggerUrl, setSwaggerUrl] = useState('')
  const [swaggerContent, setSwaggerContent] = useState('')
  const [swaggerTitle, setSwaggerTitle] = useState('')
  const [swaggerLoading, setSwaggerLoading] = useState(false)
  const [swaggerError, setSwaggerError] = useState('')

  // TCM upload (existing TCM file)
  const [tcmExpanded, setTcmExpanded] = useState(false)
  const [tcmData, setTcmData] = useState<ParsedTCM | null>(null)
  const [tcmFileName, setTcmFileName] = useState('')
  const [tcmDragOver, setTcmDragOver] = useState(false)
  const [tcmLoading, setTcmLoading] = useState(false)
  const [tcmError, setTcmError] = useState('')
  const tcmInputRef = useRef<HTMLInputElement>(null)

  // Toast
  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Generation state
  const [generating, setGenerating] = useState<GenType | null>(null)
  const [genErrors, setGenErrors] = useState<Partial<Record<GenType, string>>>({})

  // ── Toast ──────────────────────────────────────────────────────────────────

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 3500)
  }

  // ── Image paste ────────────────────────────────────────────────────────────

  const addImages = useCallback(async (files: FileList | File[]) => {
    const imgs = Array.from(files).filter(f => f.type.startsWith('image/'))
    const results = await Promise.allSettled(imgs.map(resizeImage))
    const valid = results.flatMap(r => (r.status === 'fulfilled' ? [r.value] : []))
    setLocalImages(prev => [...prev, ...valid].slice(0, 5))
  }, [])

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items
      if (!items) return
      const imageFiles = Array.from(items)
        .filter(i => i.kind === 'file' && i.type.startsWith('image/'))
        .map(i => i.getAsFile())
        .filter((f): f is File => f !== null)
      if (imageFiles.length) addImages(imageFiles)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [addImages])

  // ── Swagger ────────────────────────────────────────────────────────────────

  async function loadSwagger() {
    if (!swaggerUrl.trim()) return
    setSwaggerLoading(true)
    setSwaggerError('')
    try {
      const res = await fetch(`/api/swagger?url=${encodeURIComponent(swaggerUrl)}`)
      const data = await res.json() as { content?: string; title?: string; error?: string }
      if (!res.ok) { setSwaggerError(data.error ?? 'Failed to load spec'); return }
      setSwaggerContent(data.content ?? '')
      setSwaggerTitle(data.title ?? swaggerUrl)
    } catch {
      setSwaggerError('Network error')
    } finally {
      setSwaggerLoading(false)
    }
  }

  // ── TCM upload ─────────────────────────────────────────────────────────────

  async function handleTcmFile(file: File) {
    if (!file.name.endsWith('.xlsx')) {
      setTcmError('Please upload an .xlsx file')
      return
    }
    setTcmLoading(true)
    setTcmError('')
    try {
      const { parseTCM } = await import('@/lib/parse-tcm')
      const parsed = await parseTCM(file)
      if (parsed.groups.length === 0 && parsed.existingTCs.length === 0) {
        setTcmError('Could not parse TCM — no condition groups or TC rows found. Check the file has a "No." column and data rows.')
        return
      }
      setTcmData(parsed)
      setTcmFileName(file.name)
      showToast(`TCM parsed — ${parsed.totalTCCount} existing TCs found`)
    } catch (err) {
      setTcmError(`Parse error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setTcmLoading(false)
    }
  }

  // ── Generate TCM ───────────────────────────────────────────────────────────

  async function generate(type: GenType) {
    if (!localReq.trim()) return
    setGenerating(type)
    setGenErrors({})

    session.setRequirement(localReq, session.jiraKey ?? undefined)
    session.setImages(localImages)

    try {
      const res = await fetch('/api/generate-tcm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          requirement: localReq,
          images: localImages,
          ...(swaggerContent ? { swaggerContext: swaggerContent } : {}),
          ...(tcmData ? {
            existingTCM: {
              groups: tcmData.groups.map(g => ({ name: g.name, values: g.values })),
              existingTCs: tcmData.existingTCs.filter(tc => !tc.sectionLabel).map(tc => ({
                title: tc.title,
                combinations: tc.combinations,
              })),
            },
          } : {}),
        }),
      })

      const data = await res.json() as { groups?: TCMGroup[]; rows?: TCMRow[]; error?: string }

      if (!res.ok) {
        setGenErrors({ [type]: data.error ?? 'Generation failed' })
        return
      }

      const groups = data.groups ?? []
      const newRows = data.rows ?? []

      let allRows: TCMRow[] = newRows
      if (tcmData && tcmData.existingTCs.length > 0) {
        const existingRows = convertExistingToRows(groups, tcmData.existingTCs)
        allRows = [...existingRows, ...newRows]
      }

      const tcmState: TCMState = { groups, rows: allRows, type }
      session.setTcm(tcmState)

      if (tcmData) {
        showToast(`TCM ready — ${tcmData.totalTCCount} existing + ${newRows.length} new rows`)
      } else {
        showToast(`TCM generated — ${allRows.length} rows`)
      }

      setTimeout(() => router.push('/session/tcm-editor'), 400)
    } catch {
      setGenErrors({ [type]: 'Network error — check connection' })
    } finally {
      setGenerating(null)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-3 md:p-4 lg:p-8 w-full">

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-ink-900 text-white text-sm px-4 py-2.5 rounded-full shadow-lg pointer-events-none">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Generate Test Cases</h1>
          <p className="text-ink-500 text-sm mt-0.5">
            AI generates a TCM matrix first — review &amp; edit, then convert to test cases.
          </p>
        </div>
        {session.jiraKey && (
          <span className="ml-auto tc-id">{session.jiraKey}</span>
        )}
      </div>

      {/* Requirement card */}
      <div className="card p-5 mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-ink-500 uppercase tracking-wide">Requirement</label>
          <div className="flex items-center gap-3">
            {localImages.length > 0 && (
              <span className="font-mono text-xs text-ink-400">{localImages.length} image{localImages.length !== 1 ? 's' : ''}</span>
            )}
            <button
              onClick={() => setShowSwagger(s => !s)}
              className={`text-xs flex items-center gap-1 transition-colors ${showSwagger ? 'text-accent' : 'text-ink-500 hover:text-ink-700'}`}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M8 3v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              Swagger / OpenAPI
            </button>
          </div>
        </div>

        <textarea
          value={localReq}
          onChange={e => setLocalReq(e.target.value)}
          placeholder="Paste your requirement, user story, or acceptance criteria here…"
          rows={5}
          className="w-full text-sm rounded-lg px-3 py-2.5 resize-y focus:outline-none placeholder:text-ink-300"
        />

        {localImages.length > 0 && (
          <div className="flex gap-2 flex-wrap mt-3">
            {localImages.map((src, i) => (
              <div key={i} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-14 w-20 object-cover rounded border border-ink-200" />
                <button
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-danger text-white rounded-full text-xs leading-none hidden group-hover:flex items-center justify-center"
                  onClick={() => setLocalImages(prev => prev.filter((_, j) => j !== i))}
                >×</button>
              </div>
            ))}
          </div>
        )}

        <div
          className={`mt-3 border-2 border-dashed rounded-lg px-4 py-2 text-center text-xs cursor-pointer transition-colors ${imgDragOver ? 'border-accent bg-accent/5' : 'drop-zone-glass'}`}
          onDragOver={e => { e.preventDefault(); setImgDragOver(true) }}
          onDragLeave={() => setImgDragOver(false)}
          onDrop={async e => { e.preventDefault(); setImgDragOver(false); await addImages(e.dataTransfer.files) }}
          onClick={() => imgInputRef.current?.click()}
        >
          <span>Drop Figma screenshots here · Ctrl+V to paste · <span className="underline">Browse</span></span>
          <input ref={imgInputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => e.target.files && addImages(e.target.files)} />
        </div>

        {showSwagger && (
          <div className="mt-4 pt-4 border-t border-ink-100">
            <p className="text-xs font-medium text-ink-500 uppercase tracking-wide mb-2">Swagger / OpenAPI URL</p>
            <div className="flex gap-2">
              <input
                value={swaggerUrl}
                onChange={e => setSwaggerUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && loadSwagger()}
                placeholder="https://api.example.com/swagger.json"
                className="flex-1 font-mono text-sm rounded-lg px-3 py-2 focus:outline-none"
              />
              <button onClick={loadSwagger} disabled={!swaggerUrl.trim() || swaggerLoading} className="btn-ghost disabled:opacity-40">
                {swaggerLoading ? 'Loading…' : 'Load spec'}
              </button>
            </div>
            {swaggerError && <p className="text-xs text-danger mt-1">{swaggerError}</p>}
            {swaggerContent && (
              <div className="mt-2 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 font-mono text-xs bg-green-50 text-success px-2 py-0.5 rounded-full border border-green-200">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  {swaggerTitle || 'Spec loaded'}
                </span>
                <button onClick={() => { setSwaggerContent(''); setSwaggerTitle(''); setSwaggerUrl('') }}
                  className="text-xs text-ink-400 hover:text-danger transition-colors">Remove</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── TCM Upload section ─────────────────────────────────────────────── */}
      <div className={`card mb-5 overflow-hidden transition-all ${tcmData ? 'border-accent/40' : ''}`}>
        <button
          onClick={() => setTcmExpanded(s => !s)}
          className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${tcmData ? 'bg-accent/5 text-accent hover:bg-accent/10' : 'text-ink-600 hover:bg-ink-50'}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={tcmData ? 'text-accent' : 'text-ink-400'}>
            <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 10h8M8 14h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M8 6h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>Import existing TCM <span className="font-normal text-ink-400 text-xs">(optional — AI generates only missing combinations)</span></span>
          {tcmData && (
            <span className="ml-2 inline-flex items-center gap-1 font-mono text-[10px] bg-success/10 text-success px-2 py-0.5 rounded-full border border-success/20">
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4l2 2 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              TCM loaded
            </span>
          )}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={`ml-auto text-ink-400 transition-transform ${tcmExpanded ? 'rotate-180' : ''}`}>
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className={`transition-all ${tcmExpanded ? 'px-4 pb-4 pt-3' : 'h-0 overflow-hidden'}`}>
          {!tcmData ? (
            <>
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${tcmDragOver ? 'border-accent bg-accent/5' : 'drop-zone-glass'}`}
                onDragOver={e => { e.preventDefault(); setTcmDragOver(true) }}
                onDragLeave={() => setTcmDragOver(false)}
                onDrop={async e => {
                  e.preventDefault(); setTcmDragOver(false)
                  const file = e.dataTransfer.files[0]
                  if (file) await handleTcmFile(file)
                }}
                onClick={() => tcmInputRef.current?.click()}
              >
                <svg className="mx-auto mb-2 text-ink-300" width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M8 10h8M8 14h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M8 6h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                {tcmLoading ? (
                  <span className="text-sm text-ink-400 flex items-center justify-center gap-2">
                    <IconSpinner /> Parsing TCM…
                  </span>
                ) : (
                  <span className="text-sm">
                    Drop your <span className="font-mono font-medium">.xlsx</span> TCM here · <span className="underline">Browse</span>
                  </span>
                )}
                <input
                  ref={tcmInputRef} type="file" accept=".xlsx" className="hidden"
                  onChange={async e => {
                    const file = e.target.files?.[0]
                    if (file) await handleTcmFile(file)
                    e.target.value = ''
                  }}
                />
              </div>
              {tcmError && <p className="text-xs text-danger mt-2">{tcmError}</p>}
            </>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-sm font-medium text-ink-800">
                    Found <span className="text-accent font-bold">{tcmData.totalTCCount}</span> existing TCs
                    {tcmData.groups.length > 0 && ` across ${tcmData.groups.length} group${tcmData.groups.length !== 1 ? 's' : ''}`}
                  </span>
                  <p className="text-[10px] text-ink-400 mt-0.5 font-mono">{tcmFileName}</p>
                </div>
                <button
                  onClick={() => { setTcmData(null); setTcmFileName(''); setTcmError('') }}
                  className="text-xs text-ink-400 hover:text-danger transition-colors"
                >
                  Remove
                </button>
              </div>

              {tcmData.groups.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {tcmData.groups.map(g => (
                    <span key={g.name} className="font-mono text-[11px] bg-ink-100 text-ink-600 px-2.5 py-1 rounded-full border border-ink-200">
                      {g.name}
                    </span>
                  ))}
                </div>
              )}

              {tcmData.groups.length > 0 && (
                <div className="rounded-lg border border-ink-100 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-ink-50 text-ink-500">
                        <th className="px-3 py-2 text-left font-medium">Group</th>
                        <th className="px-3 py-2 text-left font-medium">Values</th>
                        <th className="px-3 py-2 text-right font-medium font-mono">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tcmData.groups.map((g, i) => (
                        <tr key={g.name} className={i % 2 === 1 ? 'bg-ink-50/50' : ''}>
                          <td className="px-3 py-2 font-medium text-ink-700">{g.name}</td>
                          <td className="px-3 py-2 text-ink-500 font-mono">{g.values.join(', ') || '—'}</td>
                          <td className="px-3 py-2 text-right font-mono text-ink-400">{g.values.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Flow hint */}
      <div className="flex items-center gap-2 mb-5 text-xs text-ink-400 px-1">
        <span className="font-mono bg-ink-100 text-ink-600 px-2 py-0.5 rounded">1</span>
        <span>Generate TCM</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span className="font-mono bg-ink-100 text-ink-600 px-2 py-0.5 rounded">2</span>
        <span>Review &amp; edit</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span className="font-mono bg-ink-100 text-ink-600 px-2 py-0.5 rounded">3</span>
        <span>Convert to TCs</span>
      </div>

      {/* Generate cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4" style={{ alignItems: 'stretch' }}>
        <GenCard
          icon={<IconStandard />}
          title="Standard"
          coverage="Functional · Boundary · Security · Negative"
          description="Identifies test dimensions, generates a TCM matrix, then converts each row to a Standard TC."
          isGenerating={generating === 'standard'}
          error={genErrors.standard}
          onGenerate={() => generate('standard')}
        />
        <GenCard
          icon={<IconE2E />}
          title="E2E"
          coverage="User journey · Critical path · Cross-module"
          description="Maps end-to-end flow dimensions to a TCM, then generates step-by-step E2E test cases."
          isGenerating={generating === 'e2e'}
          error={genErrors.e2e}
          onGenerate={() => generate('e2e')}
        />
        <GenCard
          icon={<IconAPI />}
          title="API"
          coverage="Endpoint · Assertion · Response validation"
          description="Maps API parameters and states to a TCM, then converts each combination to an API TC."
          isGenerating={generating === 'api'}
          error={genErrors.api}
          onGenerate={() => generate('api')}
        />
      </div>

      {!localReq.trim() && (
        <div className="card p-8 border-dashed text-center text-ink-400">
          <p className="text-sm">Enter a requirement above to enable TCM generation.</p>
        </div>
      )}
    </div>
  )
}
