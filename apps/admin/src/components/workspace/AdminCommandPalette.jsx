import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { ADMIN_PAGE_META } from '../../config/adminPages'

function AdminCommandPalette({ open, page, onClose, onNavigate }) {
  const [query, setQuery] = useState('')

  const commands = useMemo(
    () =>
      Object.entries(ADMIN_PAGE_META).map(([id, meta]) => ({
        id,
        title: meta.title,
        section: meta.section,
        description: meta.description,
        icon: meta.icon,
      })),
    []
  )

  const filteredCommands = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) return commands

    return commands.filter((command) =>
      [command.title, command.section, command.description, command.id]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    )
  }, [commands, query])

  if (!open) return null

  function handleClose() {
    setQuery('')
    onClose()
  }

  function handleNavigate(nextPage) {
    onNavigate(nextPage)
    handleClose()
  }

  return (
    <div className="command-palette-backdrop" onMouseDown={handleClose}>
      <section
        className="command-palette admin-command-palette"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="command-palette-search">
          <Search size={18} />
          <input
            autoFocus
            value={query}
            placeholder="Search admin pages or actions..."
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') handleClose()
              if (event.key === 'Enter' && filteredCommands[0]) {
                handleNavigate(filteredCommands[0].id)
              }
            }}
          />
          <span>ESC</span>
        </div>

        <div className="command-palette-list">
          {filteredCommands.length === 0 ? (
            <div className="command-palette-empty">
              <strong>No admin command found</strong>
              <span>Try Users, Devices, Models, Audit, or System.</span>
            </div>
          ) : (
            filteredCommands.map((command) => {
              const Icon = command.icon
              const active = command.id === page

              return (
                <button
                  key={command.id}
                  type="button"
                  className={`command-palette-item ${active ? 'active' : ''}`}
                  onClick={() => handleNavigate(command.id)}
                >
                  <span className="command-palette-icon">
                    <Icon size={18} />
                  </span>

                  <span className="command-palette-copy">
                    <strong>{command.title}</strong>
                    <small>
                      {command.section} · {command.description}
                    </small>
                  </span>

                  {active && (
                    <span className="command-palette-current">Current</span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </section>
    </div>
  )
}

export default AdminCommandPalette
