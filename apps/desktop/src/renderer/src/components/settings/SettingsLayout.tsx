import { useRef, useEffect, useState, useCallback } from 'react'
import { motion } from 'motion/react'
import type { MaskedSettings } from '@bestfriend/core'
import { ProfileSection } from './ProfileSection'
import { ApiKeysSection } from './ApiKeysSection'
import { ModelsSection } from './ModelsSection'
import { RetrievalSection } from './RetrievalSection'
import { SpendSection } from './SpendSection'
import { ConnectivitySection } from './ConnectivitySection'

const SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'api-keys', label: 'API Keys' },
  { id: 'models', label: 'Models' },
  { id: 'retrieval', label: 'Retrieval' },
  { id: 'spend', label: 'Spend' },
  { id: 'connectivity', label: 'Connectivity' },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

const SPRING = { type: 'spring' as const, stiffness: 320, damping: 32, mass: 0.7 }

interface SettingsLayoutProps {
  settings: MaskedSettings
}

export function SettingsLayout({ settings }: SettingsLayoutProps) {
  const [activeSection, setActiveSection] = useState<SectionId>('profile')
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const content = contentRef.current
    if (!content) return

    const update = () => {
      const scrollTop = content.scrollTop
      // Activate the last section whose top edge is within the upper 35% of the container
      const threshold = content.clientHeight * 0.35
      let active: SectionId = SECTIONS[0].id
      for (const { id } of SECTIONS) {
        const el = content.querySelector<HTMLElement>(`#${id}`)
        if (!el) continue
        if (el.offsetTop - scrollTop <= threshold) {
          active = id as SectionId
        }
      }
      setActiveSection(active)
    }

    update()
    content.addEventListener('scroll', update, { passive: true })
    return () => content.removeEventListener('scroll', update)
  }, [])

  const scrollTo = useCallback(
    (id: string) => {
      const content = contentRef.current
      if (!content) return
      const el = content.querySelector(`#${id}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },
    [],
  )

  return (
    <div className="settings-layout">
      <nav className="settings-nav" aria-label="Settings sections">
        {SECTIONS.map(({ id, label }) => {
          const isActive = activeSection === id
          return (
            <button
              key={id}
              type="button"
              className={`settings-nav-item${isActive ? ' settings-nav-item--active' : ''}`}
              onClick={() => scrollTo(id)}
              aria-current={isActive ? 'location' : undefined}
            >
              {isActive && (
                <motion.div
                  layoutId="settings-nav-pill"
                  className="settings-nav-pill"
                  transition={SPRING}
                />
              )}
              <span className="settings-nav-label">{label}</span>
            </button>
          )
        })}
      </nav>

      <div ref={contentRef} className="settings-content">
        <div id="profile" className="settings-section-anchor">
          <ProfileSection settings={settings} />
        </div>
        <div id="api-keys" className="settings-section-anchor">
          <ApiKeysSection settings={settings} />
        </div>
        <div id="models" className="settings-section-anchor">
          <ModelsSection settings={settings} />
        </div>
        <div id="retrieval" className="settings-section-anchor">
          <RetrievalSection settings={settings} />
        </div>
        <div id="spend" className="settings-section-anchor">
          <SpendSection settings={settings} />
        </div>
        <div id="connectivity" className="settings-section-anchor">
          <ConnectivitySection settings={settings} />
        </div>
      </div>
    </div>
  )
}
