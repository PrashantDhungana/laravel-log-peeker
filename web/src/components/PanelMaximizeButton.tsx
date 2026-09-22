interface PanelMaximizeButtonProps {
  maximized: boolean
  onToggle: () => void
  panelLabel: string
}

function MaximizeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden
    >
      <path d="M3 6V3h3M10 3h3v3M13 10v3h-3M6 13H3v-3" />
    </svg>
  )
}

function RestoreIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden
    >
      <path d="M6 3H3v3M13 3h-3v3M10 13h3v-3M3 13h3v-3" />
    </svg>
  )
}

export function PanelMaximizeButton({ maximized, onToggle, panelLabel }: PanelMaximizeButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="rounded-md border border-zinc-700 p-1.5 text-zinc-300 hover:bg-zinc-800"
      title={maximized ? `Restore ${panelLabel}` : `Maximise ${panelLabel}`}
      aria-label={maximized ? `Restore ${panelLabel}` : `Maximise ${panelLabel}`}
    >
      {maximized ? <RestoreIcon /> : <MaximizeIcon />}
    </button>
  )
}
