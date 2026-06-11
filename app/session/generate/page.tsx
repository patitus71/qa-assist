// app/session/generate/page.tsx
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/lib/session-context'
import { StandardTCTable } from '@/app/components/StandardTCTable'
import { E2ETCTable } from '@/app/components/E2ETCTable'
import { APITCTable } from '@/app/components/APITCTable'
import type { StandardTC, E2ETC, APITC } from '@/lib/types'
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
  count?: number
  onGenerate: () => void
}

function GenCard({ icon, title, coverage, description, isGenerating, error, count, onGenerate }: GenCardProps) {
  return (
    <div className="card p-5 flex flex-col">
      <div className="flex items-center gap-2.5 mb-3">
        {icon}
        <div>
          <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
          <p className="font-mono text-[10px] text-ink-400 tracking-wide">{coverage}</p>
        </div>
        {count !== undefined && count > 0 && (
          <span className="ml-auto font-mono text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded-full border border-accent/20">
            {count} TC
          </span>
        )}
      </div>
      <p className="text-sm text-ink-500 flex-1 leading-relaxed">{description}</p>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
      <button
        className="btn-primary w-full mt-4 flex items-center justify-center gap-2"
        onClick={onGenerate}
        disabled={isGenerating}
      >
        {isGenerating && <IconSpinner />}
        {isGenerating ? 'Generating…' : `Generate ${title}`}
      </button>
    </div>
  )
}

// ── NewTCCard (accept/reject) ─────────────────────────────────────────────────

function NewTCCard({
  tc, accepted, rejected, onAccept, onReject,
}: {
  tc: StandardTC
  accepted: boolean
  rejected: boolean
  onAccept: () => void
  onReject: () => void
}) {
  if (rejected) return null

  return (
    <div
      className="rounded-lg p-3 mb-2 flex gap-3 transition-all"
      style={{
        borderLeft: `3px solid ${accepted ? '#0B7A51' : '#1A56DB'}`,
        backgroundColor: accepted ? '#F0FDF9' : '#F0F7FF',
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          {accepted ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-success text-white px-2 py-0.5 rounded-full">
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" /></svg>
              Added
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-accent text-white px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 bg-success rounded-full inline-block" />
              NEW
            </span>
          )}
          <span className="font-mono text-[10px] text-ink-400">{tc.id}</span>
          <span className={`badge-priority-${tc.priority.toLowerCase()} text-[10px]`}>{tc.priority}</span>
          {tc.positiveNegative && (
            <span className={`text-[10px] font-medium ${tc.positiveNegative === 'Positive' ? 'text-success' : 'text-danger'}`}>
              {tc.positiveNegative}
            </span>
          )}
        </div>
        <p className="text-sm font-medium text-ink-900 mb-1">{tc.title}</p>
        {tc.steps && (
          <p className="text-xs text-ink-500 line-clamp-2 leading-relaxed">{tc.steps}</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5 shrink-0">
        {!accepted ? (
          <button
            onClick={onAccept}
            className="text-xs border border-success text-success rounded-lg px-3 py-1 hover:bg-success hover:text-white transition-colors whitespace-nowrap"
          >
            Accept
          </button>
        ) : (
          <button
            onClick={onAccept}
            className="text-xs border border-success bg-success text-white rounded-lg px-3 py-1"
            disabled
          >
            Added ✓
          </button>
        )}
        <button
          onClick={onReject}
          className="text-xs border border-ink-200 text-ink-400 rounded-lg px-3 py-1 hover:bg-ink-100 transition-colors"
        >
          Reject
        </button>
      </div>
    </div>
  )
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

  // TCM upload
  const [tcmExpanded, setTcmExpanded] = useState(false)
  const [tcmData, setTcmData] = useState<ParsedTCM | null>(null)
  const [tcmFileName, setTcmFileName] = useState('')
  const [tcmDragOver, setTcmDragOver] = useState(false)
  const [tcmLoading, setTcmLoading] = useState(false)
  const [tcmError, setTcmError] = useState('')
  const tcmInputRef = useRef<HTMLInputElement>(null)

  // Accept/reject state (for TCM mode)
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set())
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set())

  // Toast
  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Generation state
  const [generating, setGenerating] = useState<Set<GenType>>(new Set())
  const [genErrors, setGenErrors] = useState<Partial<Record<GenType, string>>>({})

  // Draft TCs (local — not yet in session)
  const [draftStandard, setDraftStandard] = useState<StandardTC[]>([])
  const [draftE2E, setDraftE2E] = useState<E2ETC[]>([])
  const [draftAPI, setDraftAPI] = useState<APITC[]>([])
  const [activeTab, setActiveTab] = useState<GenType>('standard')

  const hasDrafts = draftStandard.length > 0 || draftE2E.length > 0 || draftAPI.length > 0
  const tcmMode = tcmData !== null

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
        setTcmError('Could not parse TCM — check the file format (row 2 = groups, row 3 = values)')
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

  // ── Generate ───────────────────────────────────────────────────────────────

  async function generate(type: GenType | 'all') {
    if (!localReq.trim()) return
    const affected: GenType[] = type === 'all' ? ['standard', 'e2e', 'api'] : [type]
    setGenerating(new Set(affected))
    setGenErrors({})
    setAcceptedIds(new Set())
    setRejectedIds(new Set())

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          requirement: localReq,
          images: localImages,
          swaggerContext: swaggerContent || undefined,
          ...(tcmData ? {
            existingTCM: {
              groups: tcmData.groups.map(g => ({ name: g.name, values: g.values })),
              existingTCs: tcmData.existingTCs.map(tc => ({ title: tc.title })),
            },
          } : {}),
        }),
      })
      const data = await res.json() as {
        standard?: StandardTC[]
        e2e?: E2ETC[]
        api?: APITC[]
        error?: string
      }

      if (!res.ok) {
        const msg = data.error ?? 'Generation failed'
        const errs: Partial<Record<GenType, string>> = {}
        affected.forEach(t => { errs[t] = msg })
        setGenErrors(errs)
        return
      }

      if (data.standard?.length) setDraftStandard(data.standard)
      if (data.e2e?.length) setDraftE2E(data.e2e)
      if (data.api?.length) setDraftAPI(data.api)

      if (type === 'all') {
        if (data.standard?.length) setActiveTab('standard')
        else if (data.e2e?.length) setActiveTab('e2e')
        else if (data.api?.length) setActiveTab('api')
      } else {
        setActiveTab(type)
      }

      // Toast after TCM generation
      if (tcmData && data.standard?.length) {
        showToast(`${tcmData.totalTCCount} existing + ${data.standard.length} new TCs suggested`)
      }
    } catch {
      const errs: Partial<Record<GenType, string>> = {}
      affected.forEach(t => { errs[t] = 'Network error — check connection' })
      setGenErrors(errs)
    } finally {
      setGenerating(new Set())
    }
  }

  // ── Save to session ────────────────────────────────────────────────────────

  function saveToSession() {
    session.setRequirement(localReq, session.jiraKey ?? undefined)
    session.setImages(localImages)

    if (tcmMode) {
      const accepted = draftStandard.filter(tc => !rejectedIds.has(tc.id))
      if (accepted.length) session.setStandardTCs([...session.standardTCs, ...accepted])
      const e2eAccepted = draftE2E.filter(tc => !rejectedIds.has(tc.id))
      if (e2eAccepted.length) session.setE2eTCs([...session.e2eTCs, ...e2eAccepted])
      const apiAccepted = draftAPI.filter(tc => !rejectedIds.has(tc.id))
      if (apiAccepted.length) session.setApiTCs([...session.apiTCs, ...apiAccepted])

      const totalAdded = accepted.length + e2eAccepted.length + apiAccepted.length
      showToast(`${totalAdded} TC${totalAdded !== 1 ? 's' : ''} added to session`)
      setDraftStandard([]); setDraftE2E([]); setDraftAPI([])
      setTimeout(() => {
        if (accepted.length) router.push('/session/standard')
        else if (e2eAccepted.length) router.push('/session/e2e')
        else router.push('/session/api')
      }, 600)
    } else {
      if (draftStandard.length) session.setStandardTCs([...session.standardTCs, ...draftStandard])
      if (draftE2E.length) session.setE2eTCs([...session.e2eTCs, ...draftE2E])
      if (draftAPI.length) session.setApiTCs([...session.apiTCs, ...draftAPI])
      setDraftStandard([]); setDraftE2E([]); setDraftAPI([])
      if (draftStandard.length) router.push('/session/standard')
      else if (draftE2E.length) router.push('/session/e2e')
      else router.push('/session/api')
    }
  }

  // ── Accept / Reject helpers ────────────────────────────────────────────────

  function acceptTC(id: string) {
    setAcceptedIds(prev => new Set([...prev, id]))
    setRejectedIds(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  function rejectTC(id: string) {
    setRejectedIds(prev => new Set([...prev, id]))
    setAcceptedIds(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  function acceptAll() {
    setAcceptedIds(new Set(draftStandard.map(t => t.id)))
    setRejectedIds(new Set())
  }

  function rejectAll() {
    setRejectedIds(new Set(draftStandard.map(t => t.id)))
    setAcceptedIds(new Set())
  }

  // ── Derived counts ─────────────────────────────────────────────────────────

  const visibleNewTCs  = draftStandard.filter(tc => !rejectedIds.has(tc.id))
  const acceptedCount  = visibleNewTCs.filter(tc => acceptedIds.has(tc.id)).length
  const pendingCount   = visibleNewTCs.filter(tc => !acceptedIds.has(tc.id)).length

  // ── Tabs (non-TCM mode) ────────────────────────────────────────────────────

  const tabs = [
    draftStandard.length > 0 && { key: 'standard' as GenType, label: 'Standard', count: draftStandard.length },
    draftE2E.length > 0 && { key: 'e2e' as GenType, label: 'E2E', count: draftE2E.length },
    draftAPI.length > 0 && { key: 'api' as GenType, label: 'API', count: draftAPI.length },
  ].filter(Boolean) as { key: GenType; label: string; count: number }[]

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-3 md:p-4 lg:p-8 max-w-5xl w-full">

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
            AI generates from your requirement. Review and edit before saving.
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
              className={`text-xs flex items-center gap-1 transition-colors ${showSwagger ? 'text-accent' : 'text-ink-400 hover:text-ink-700'}`}
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
          className="w-full text-sm border border-ink-200 rounded-lg px-3 py-2.5 bg-white resize-y focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent placeholder:text-ink-300"
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
          className={`mt-3 border-2 border-dashed rounded-lg px-4 py-2 text-center text-xs cursor-pointer transition-colors ${imgDragOver ? 'border-accent bg-accent/5' : 'border-ink-200 hover:border-ink-300'}`}
          onDragOver={e => { e.preventDefault(); setImgDragOver(true) }}
          onDragLeave={() => setImgDragOver(false)}
          onDrop={async e => { e.preventDefault(); setImgDragOver(false); await addImages(e.dataTransfer.files) }}
          onClick={() => imgInputRef.current?.click()}
        >
          <span className="text-ink-400">Drop Figma screenshots here · Ctrl+V to paste · <span className="underline">Browse</span></span>
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
                className="flex-1 font-mono text-sm border border-ink-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-accent"
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
          <span>Import TCM <span className="font-normal text-ink-400 text-xs">(optional — ให้ AI gen เฉพาะ TC ที่ยังขาด)</span></span>
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
              // Upload zone
              <>
                <div
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${tcmDragOver ? 'border-accent bg-accent/5' : 'border-ink-200 hover:border-ink-300'}`}
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
                    <span className="text-sm text-ink-400">
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
              // TCM summary
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-sm font-medium text-ink-800">
                      Found <span className="text-accent font-bold">{tcmData.totalTCCount}</span> existing test cases
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

                {/* Group chips */}
                {tcmData.groups.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {tcmData.groups.map(g => (
                      <span
                        key={g.name}
                        className="font-mono text-[11px] bg-ink-100 text-ink-600 px-2.5 py-1 rounded-full border border-ink-200"
                      >
                        {g.name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Group value count table */}
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

      {/* Generate cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4" style={{ alignItems: 'stretch' }}>
        <GenCard
          icon={<IconStandard />}
          title="Standard"
          coverage="Functional · Boundary · Security · Negative"
          description="Up to 8 test cases covering all critical scenarios for a banking-grade feature."
          isGenerating={generating.has('standard')}
          error={genErrors.standard}
          count={draftStandard.length || undefined}
          onGenerate={() => generate('standard')}
        />
        <GenCard
          icon={<IconE2E />}
          title="E2E"
          coverage="User journey · Critical path · Cross-module"
          description="Up to 3 end-to-end flows with step-by-step keyword actions for automation."
          isGenerating={generating.has('e2e')}
          error={genErrors.e2e}
          count={draftE2E.length || undefined}
          onGenerate={() => generate('e2e')}
        />
        <GenCard
          icon={<IconAPI />}
          title="API"
          coverage="Endpoint · Assertion · Response validation"
          description="Tests each API endpoint with full request/response assertion coverage."
          isGenerating={generating.has('api')}
          error={genErrors.api}
          count={draftAPI.length || undefined}
          onGenerate={() => generate('api')}
        />
      </div>

      {/* Generate all */}
      <div className="flex justify-center mb-7">
        <button
          onClick={() => generate('all')}
          disabled={generating.size > 0 || !localReq.trim()}
          className="btn-ghost flex items-center gap-2 disabled:opacity-40"
        >
          {generating.size > 0 && <IconSpinner />}
          Generate All (Standard + E2E + API)
        </button>
      </div>

      {/* ── Results ──────────────────────────────────────────────────────────── */}
      {hasDrafts && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-ink-900">Review & Edit</h2>
              <p className="text-xs text-ink-500 mt-0.5">
                {tcmMode
                  ? 'Review AI-suggested new TCs. Accept to add to session.'
                  : 'Click any cell to edit inline · Drag rows to reorder · Add/delete as needed'}
              </p>
            </div>
            {!tcmMode && (
              <button onClick={saveToSession} className="btn-primary flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M2 9l4 4 8-8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Save to session
              </button>
            )}
          </div>

          {/* ── TCM mode: two-section view ──────────────────────────────────── */}
          {tcmMode && draftStandard.length > 0 ? (
            <>
              {/* Section A — Existing from TCM */}
              <div className="mb-6">
                <div className="flex items-center gap-2.5 mb-3 px-1">
                  <div className="w-1 h-5 bg-ink-300 rounded-full" />
                  <span className="text-sm font-semibold text-ink-500">Existing TCs from TCM</span>
                  <span className="ml-auto font-mono text-[10px] text-ink-400">{tcmData!.totalTCCount} TCs — read only</span>
                </div>
                <div className="space-y-1">
                  {tcmData!.existingTCs.slice(0, 12).map((tc, i) => (
                    <div key={i} className="flex items-center gap-2.5 px-3 py-2 bg-ink-50 rounded-lg border border-ink-100">
                      <span className="font-mono text-[10px] text-ink-300 shrink-0">existing</span>
                      <span className="text-sm text-ink-500 truncate">{tc.title}</span>
                    </div>
                  ))}
                  {tcmData!.totalTCCount > 12 && (
                    <p className="text-xs text-ink-400 text-center py-2">
                      +{tcmData!.totalTCCount - 12} more in uploaded file
                    </p>
                  )}
                </div>
              </div>

              {/* Section B — AI new */}
              <div>
                <div className="flex items-center gap-2.5 mb-3 px-1 flex-wrap gap-y-2">
                  <div className="w-1 h-5 bg-accent rounded-full" />
                  <span className="text-sm font-semibold text-ink-900">AI-suggested additions</span>
                  <div className="flex items-center gap-1.5 ml-2">
                    {acceptedCount > 0 && (
                      <span className="font-mono text-[10px] bg-success/10 text-success px-1.5 py-0.5 rounded-full">
                        {acceptedCount} accepted
                      </span>
                    )}
                    {pendingCount > 0 && (
                      <span className="font-mono text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded-full">
                        {pendingCount} pending
                      </span>
                    )}
                    {rejectedIds.size > 0 && (
                      <span className="font-mono text-[10px] bg-ink-100 text-ink-400 px-1.5 py-0.5 rounded-full">
                        {rejectedIds.size} rejected
                      </span>
                    )}
                  </div>
                  <div className="ml-auto flex gap-2">
                    <button onClick={acceptAll} className="text-xs border border-success text-success rounded-lg px-3 py-1.5 hover:bg-success hover:text-white transition-colors">
                      Accept all
                    </button>
                    <button onClick={rejectAll} className="text-xs border border-ink-200 text-ink-400 rounded-lg px-3 py-1.5 hover:bg-ink-100 transition-colors">
                      Reject all
                    </button>
                  </div>
                </div>

                {visibleNewTCs.length === 0 ? (
                  <div className="card p-6 text-center text-ink-400 border-dashed">
                    <p className="text-sm">All AI suggestions rejected.</p>
                  </div>
                ) : (
                  <div>
                    {draftStandard.map(tc => (
                      <NewTCCard
                        key={tc.id}
                        tc={tc}
                        accepted={acceptedIds.has(tc.id)}
                        rejected={rejectedIds.has(tc.id)}
                        onAccept={() => acceptTC(tc.id)}
                        onReject={() => rejectTC(tc.id)}
                      />
                    ))}
                  </div>
                )}

                {/* E2E / API in regular tabs if also generated */}
                {(draftE2E.length > 0 || draftAPI.length > 0) && (
                  <div className="mt-6">
                    <div className="flex border-b border-ink-200 mb-4">
                      {draftE2E.length > 0 && (
                        <button
                          onClick={() => setActiveTab('e2e')}
                          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'e2e' ? 'border-accent text-accent' : 'border-transparent text-ink-500 hover:text-ink-700'}`}
                        >
                          E2E <span className="font-mono text-[10px] ml-1">{draftE2E.length}</span>
                        </button>
                      )}
                      {draftAPI.length > 0 && (
                        <button
                          onClick={() => setActiveTab('api')}
                          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'api' ? 'border-accent text-accent' : 'border-transparent text-ink-500 hover:text-ink-700'}`}
                        >
                          API <span className="font-mono text-[10px] ml-1">{draftAPI.length}</span>
                        </button>
                      )}
                    </div>
                    {activeTab === 'e2e' && draftE2E.length > 0 && (
                      <E2ETCTable tcs={draftE2E} onChange={setDraftE2E} />
                    )}
                    {activeTab === 'api' && draftAPI.length > 0 && (
                      <APITCTable tcs={draftAPI} onChange={setDraftAPI} />
                    )}
                  </div>
                )}

                {/* Save strip */}
                <div className="mt-5 flex items-center justify-between p-4 bg-white rounded-card border border-ink-200">
                  <div className="text-sm text-ink-500">
                    <span className="font-mono text-ink-700">
                      {visibleNewTCs.length}
                    </span> new TC{visibleNewTCs.length !== 1 ? 's' : ''} will be added
                  </div>
                  <button
                    onClick={saveToSession}
                    disabled={visibleNewTCs.length === 0}
                    className="btn-primary disabled:opacity-40"
                  >
                    Save to session →
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* ── Normal mode (no TCM or no standard drafts) ──────────────── */
            <>
              {tabs.length > 1 && (
                <div className="flex border-b border-ink-200 mb-4">
                  {tabs.map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2 ${
                        activeTab === tab.key
                          ? 'border-accent text-accent'
                          : 'border-transparent text-ink-500 hover:text-ink-700'
                      }`}
                    >
                      {tab.label}
                      <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? 'bg-accent/10' : 'bg-ink-100'}`}>
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {activeTab === 'standard' && draftStandard.length > 0 && (
                <StandardTCTable tcs={draftStandard} onChange={setDraftStandard} />
              )}
              {activeTab === 'e2e' && draftE2E.length > 0 && (
                <E2ETCTable tcs={draftE2E} onChange={setDraftE2E} />
              )}
              {activeTab === 'api' && draftAPI.length > 0 && (
                <APITCTable tcs={draftAPI} onChange={setDraftAPI} />
              )}

              <div className="mt-5 flex items-center justify-between p-4 bg-white rounded-card border border-ink-200">
                <div className="text-sm text-ink-500">
                  <span className="font-mono text-ink-700">{draftStandard.length + draftE2E.length + draftAPI.length}</span> TC ready
                  {draftStandard.length > 0 && <span className="ml-2">· {draftStandard.length} Standard</span>}
                  {draftE2E.length > 0 && <span className="ml-2">· {draftE2E.length} E2E</span>}
                  {draftAPI.length > 0 && <span className="ml-2">· {draftAPI.length} API</span>}
                </div>
                <button onClick={saveToSession} className="btn-primary">
                  Save to session →
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {!localReq.trim() && (
        <div className="card p-8 border-dashed text-center text-ink-400">
          <p className="text-sm">Enter a requirement above to enable generation.</p>
        </div>
      )}
    </div>
  )
}
