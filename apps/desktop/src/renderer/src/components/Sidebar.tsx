import { useLocation, Link, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { Tray, Books, ChatTeardropText, Bell, GearSix } from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { useEffect } from 'react'
import { useUiStore } from '@renderer/state/uiStore'

interface NavItem {
  path: string
  label: string
  Icon: Icon
  kbd: string
}

const NAV_ITEMS: NavItem[] = [
  { path: '/inbox', label: 'Inbox', Icon: Tray, kbd: '⌘1' },
  { path: '/library', label: 'Library', Icon: Books, kbd: '⌘2' },
  { path: '/chat', label: 'Chat', Icon: ChatTeardropText, kbd: '⌘3' },
  { path: '/feed', label: 'Feed', Icon: Bell, kbd: '⌘4' },
]

const SPRING = { type: 'spring' as const, stiffness: 320, damping: 32, mass: 0.7 }

function NavLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const { Icon } = item
  return (
    <Link
      to={item.path}
      className={`nav-item${isActive ? ' nav-item--active' : ''}`}
      title={`${item.label} ${item.kbd}`}
    >
      {isActive && (
        <>
          <motion.div layoutId="active-pill" className="nav-item-pill" transition={SPRING} />
          <motion.div layoutId="active-bar" className="nav-item-accent-bar" transition={SPRING} />
        </>
      )}
      <Icon size={16} weight={isActive ? 'duotone' : 'regular'} style={{ position: 'relative' }} />
      <span className="nav-item-label" style={{ position: 'relative' }}>
        {item.label}
      </span>
    </Link>
  )
}

export function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const collapsed = useUiStore((s) => s.sidebarCollapsed)

  useEffect(() => {
    const handleNavigate = (e: Event) => {
      const path = (e as CustomEvent<string>).detail
      navigate(path)
    }
    window.addEventListener('menu:navigate', handleNavigate)
    return () => window.removeEventListener('menu:navigate', handleNavigate)
  }, [navigate])

  if (collapsed) return null

  const settingsActive = location.pathname === '/settings'

  return (
    <aside className="sidebar">
      <div className="sidebar-traffic-zone" />

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => {
          const isActive =
            location.pathname === item.path || location.pathname.startsWith(item.path + '/')
          return <NavLink key={item.path} item={item} isActive={isActive} />
        })}
      </nav>

      <div className="sidebar-bottom">
        <Link
          to="/settings"
          className={`nav-item${settingsActive ? ' nav-item--active' : ''}`}
          title="Settings ⌘,"
        >
          {settingsActive && (
            <>
              <motion.div layoutId="active-pill" className="nav-item-pill" transition={SPRING} />
              <motion.div layoutId="active-bar" className="nav-item-accent-bar" transition={SPRING} />
            </>
          )}
          <GearSix
            size={16}
            weight={settingsActive ? 'duotone' : 'regular'}
            style={{ position: 'relative' }}
          />
          <span className="nav-item-label" style={{ position: 'relative' }}>
            Settings
          </span>
        </Link>
      </div>
    </aside>
  )
}
