import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

/**
 * Native <dialog> wrapper. showModal() gives us Escape, the backdrop, and a
 * real focus trap from the platform, so none of that is hand-rolled.
 */
export default function Dialog({
  title,
  onClose,
  children,
  wide = false,
  busy = false,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
  /** Blocks Escape, the backdrop, and the close button while a write is in flight. */
  busy?: boolean
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  return (
    <dialog
      className={wide ? 'modal modal--wide' : 'modal'}
      ref={dialogRef}
      onClose={onClose}
      onCancel={(event) => {
        if (busy) event.preventDefault()
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current && !busy) dialogRef.current?.close()
      }}
    >
      <div className="modal-form">
        <div className="modal-head">
          <h2 dir="auto">{title}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={() => dialogRef.current?.close()}
            disabled={busy}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </dialog>
  )
}
