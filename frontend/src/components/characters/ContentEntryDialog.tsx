import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LuX } from 'react-icons/lu'
import { iconBtn } from './characterStyles'

export interface ContentEntryDialogProps {
  title: string
  // A line under the title: the content type, the ruleset.
  subtitle?: string
  onClose: () => void
  children: ReactNode
}

/**
 * The window one catalog entry opens in: a class, a species, a compendium hit.
 *
 * A frame, not a renderer: the caller passes the body (a ContentEntryDetail, a
 * spinner while it loads), so a sheet's pick and the compendium read the same.
 */
export default function ContentEntryDialog({
  title,
  subtitle,
  onClose,
  children,
}: ContentEntryDialogProps) {
  const { t } = useTranslation()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--scrim-strong)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          width: '100%',
          maxWidth: 820,
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 20 }}>{title}</h2>
            {subtitle ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{subtitle}</div>
            ) : null}
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close')} style={iconBtn}>
            <LuX size={18} />
          </button>
        </header>
        <div style={{ overflowY: 'auto', padding: '4px 20px 20px' }}>{children}</div>
      </div>
    </div>
  )
}
