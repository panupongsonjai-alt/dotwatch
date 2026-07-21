import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

function collectOptions(children) {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child)) return []
    if (child.type === Fragment || child.type === 'optgroup') {
      return collectOptions(child.props.children)
    }
    if (child.type !== 'option') return []

    return [{
      value: String(child.props.value ?? child.props.children ?? ''),
      label: child.props.children,
      swatch: child.props['data-swatch'] || '',
      disabled: Boolean(child.props.disabled),
    }]
  })
}

function UnifiedSelect({
  children,
  value,
  onChange,
  disabled = false,
  className = '',
  name,
  id,
  'aria-label': ariaLabel,
  ...rest
}) {
  const generatedId = useId()
  const listboxId = `${id || generatedId}-listbox`
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [menuStyle, setMenuStyle] = useState({})
  const options = useMemo(() => collectOptions(children), [children])
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === String(value ?? ''))
  )
  const selectedOption = options[selectedIndex]

  useEffect(() => {
    if (!open) return undefined

    const positionMenu = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const gap = 7
      const availableBelow = window.innerHeight - rect.bottom - gap - 10
      const availableAbove = rect.top - gap - 10
      const openAbove = availableBelow < 190 && availableAbove > availableBelow
      const maxHeight = Math.max(
        120,
        Math.min(280, openAbove ? availableAbove : availableBelow)
      )

      setMenuStyle({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
        width: rect.width,
        maxHeight,
        ...(openAbove
          ? { bottom: window.innerHeight - rect.top + gap }
          : { top: rect.bottom + gap }),
      })
    }

    const closeOutside = (event) => {
      if (
        !rootRef.current?.contains(event.target) &&
        !menuRef.current?.contains(event.target)
      ) {
        setOpen(false)
      }
    }

    setActiveIndex(selectedIndex)
    positionMenu()
    document.addEventListener('pointerdown', closeOutside)
    window.addEventListener('resize', positionMenu)
    window.addEventListener('scroll', positionMenu, true)

    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('resize', positionMenu)
      window.removeEventListener('scroll', positionMenu, true)
    }
  }, [open, selectedIndex])

  function chooseOption(option) {
    if (!option || option.disabled) return
    onChange?.({
      target: { value: option.value, name },
      currentTarget: { value: option.value, name },
    })
    setOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  function moveActive(direction) {
    if (!options.length) return
    let next = activeIndex
    do {
      next = (next + direction + options.length) % options.length
    } while (options[next]?.disabled && next !== activeIndex)
    setActiveIndex(next)
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) setOpen(true)
      else moveActive(event.key === 'ArrowDown' ? 1 : -1)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!open) setOpen(true)
      else chooseOption(options[activeIndex])
    }
  }

  return (
    <div
      ref={rootRef}
      className={`unified-select ${className}`.trim()}
      data-open={open ? 'true' : 'false'}
    >
      {name && <input type="hidden" name={name} value={value ?? ''} />}
      <button
        {...rest}
        ref={triggerRef}
        id={id}
        type="button"
        className="unified-select-trigger"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
      >
        <span className="unified-select-value">
          {selectedOption?.swatch && <span className="unified-select-swatch" style={{ backgroundColor: selectedOption.swatch }} aria-hidden="true" />}
          <span className="unified-select-label">{selectedOption?.label ?? ''}</span>
        </span>
        <ChevronDown className="unified-select-chevron" size={16} aria-hidden="true" />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          id={listboxId}
          className="unified-select-menu"
          role="listbox"
          aria-label={ariaLabel}
          style={menuStyle}
        >
          {options.map((option, index) => (
            <button
              key={`${option.value}-${index}`}
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              disabled={option.disabled}
              className={`unified-select-option${index === activeIndex ? ' is-active' : ''}`}
              onPointerMove={() => setActiveIndex(index)}
              onClick={() => chooseOption(option)}
            >
              <span className="unified-select-option-content">
                {option.swatch && <span className="unified-select-swatch" style={{ backgroundColor: option.swatch }} aria-hidden="true" />}
                <span className="unified-select-label">{option.label}</span>
              </span>
              {index === selectedIndex && <Check size={16} aria-hidden="true" />}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

export default UnifiedSelect
