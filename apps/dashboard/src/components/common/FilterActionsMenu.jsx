import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'

function FilterActionsMenu({ label = 'Filter actions', items = [] }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    const closeOutside = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false)
    }
    const closeEscape = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeEscape)
    }
  }, [open])

  return (
    <div className="filter-actions-menu" ref={menuRef}>
      <button
        type="button"
        className="filter-actions-menu-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal size={22} aria-hidden="true" />
      </button>
      {open && (
        <div className="filter-actions-menu-dropdown" role="menu">
          {items.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.key || item.label}
                type="button"
                role="menuitem"
                className={item.tone === 'danger' ? 'danger' : ''}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false)
                  item.onSelect?.()
                }}
              >
                {Icon && <Icon size={16} aria-hidden="true" />}
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default FilterActionsMenu
