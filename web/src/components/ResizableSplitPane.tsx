import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'laravel-log-peeker.split-ratio'
const DEFAULT_RATIO = 50
const MIN_PANEL_PX = 240
const LG_MEDIA = '(min-width: 1024px)'

function loadRatio(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw == null) return DEFAULT_RATIO
    const value = Number(raw)
    if (!Number.isFinite(value)) return DEFAULT_RATIO
    return Math.min(80, Math.max(20, value))
  } catch {
    return DEFAULT_RATIO
  }
}

function saveRatio(ratio: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(ratio))
  } catch {
    // ignore quota / private mode
  }
}

function clampRatio(ratio: number, width: number): number {
  if (width <= 0) return DEFAULT_RATIO
  const minRatio = (MIN_PANEL_PX / width) * 100
  const maxRatio = 100 - minRatio
  return Math.min(maxRatio, Math.max(minRatio, ratio))
}

interface ResizableSplitPaneProps {
  left: ReactNode
  right: ReactNode
}

export function ResizableSplitPane({ left, right }: ResizableSplitPaneProps) {
  const [ratio, setRatio] = useState(loadRatio)
  const [sideBySide, setSideBySide] = useState(() => matchMedia(LG_MEDIA).matches)
  const containerRef = useRef<HTMLDivElement>(null)
  const ratioRef = useRef(ratio)
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, ratio: DEFAULT_RATIO })

  ratioRef.current = ratio

  useEffect(() => {
    const mq = matchMedia(LG_MEDIA)
    const onChange = () => setSideBySide(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const endDrag = useCallback(() => {
    if (!dragging.current) return
    dragging.current = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    if (containerRef.current) {
      const clamped = clampRatio(ratioRef.current, containerRef.current.offsetWidth)
      ratioRef.current = clamped
      setRatio(clamped)
      saveRatio(clamped)
    }
  }, [])

  const onSplitterPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!sideBySide) return
      event.preventDefault()
      dragging.current = true
      dragStart.current = { x: event.clientX, ratio: ratioRef.current }
      event.currentTarget.setPointerCapture(event.pointerId)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [sideBySide],
  )

  const onSplitterPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || !containerRef.current) return
    const width = containerRef.current.offsetWidth
    const deltaRatio = ((event.clientX - dragStart.current.x) / width) * 100
    setRatio(clampRatio(dragStart.current.ratio + deltaRatio, width))
  }, [])

  const onSplitterPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      endDrag()
    },
    [endDrag],
  )

  useEffect(() => {
    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={`relative flex min-h-0 flex-1 ${sideBySide ? 'flex-row' : 'flex-col'}`}
    >
      <div
        className={`flex min-h-0 min-w-0 flex-col overflow-hidden ${sideBySide ? '' : 'flex-1'}`}
        style={sideBySide ? { width: `${ratio}%` } : undefined}
      >
        {left}
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={Math.round(ratio)}
        aria-valuemin={20}
        aria-valuemax={80}
        aria-label="Resize panels"
        className={
          sideBySide
            ? 'flex w-2 shrink-0 cursor-col-resize touch-none items-stretch justify-center bg-zinc-900 hover:bg-zinc-800'
            : 'hidden'
        }
        onPointerDown={onSplitterPointerDown}
        onPointerMove={onSplitterPointerMove}
        onPointerUp={onSplitterPointerUp}
        onPointerCancel={onSplitterPointerUp}
      >
        <div className="w-px bg-zinc-700" />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{right}</div>
    </div>
  )
}
