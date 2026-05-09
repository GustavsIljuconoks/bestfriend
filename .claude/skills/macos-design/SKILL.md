---
name: "macos-design"
description: "Use when implementing Bestfriend's UI: applying the locked design tokens (colors, typography, spacing, motion), following Apple HIG conventions for macOS desktop apps, writing component styles that respect vibrancy/transparency, dark/light mode, system accent color, and the specific visual rules from personal-agent-design.md. Invoke whenever writing CSS, component styles, or Electron BrowserWindow configuration."
---

# macOS Design System — Bestfriend Project

All design decisions are locked in `personal-agent-design.md`. This skill is a quick-access reference for implementation.

## Design Direction

**Mood:** Things 3 / Linear / Day One territory — native-feeling, confident restraint.  
**Never:** purple gradients, AI shimmer, bubble-chat for assistant messages, Inter/Roboto for content, custom titlebars, hamburger menus, toast notifications for important events.

## Window Configuration (Electron)

```typescript
// Main window
new BrowserWindow({
  titleBarStyle: 'hiddenInset',  // traffic lights float over sidebar
  vibrancy: 'sidebar',           // vibrancy on sidebar pane ONLY
  width: 1280, height: 820,
  minWidth: 980, minHeight: 640,
  trafficLightPosition: undefined,  // use default macOS inset
})

// Quick-capture window
new BrowserWindow({
  frame: false,
  transparent: true,
  vibrancy: 'hud',
  width: 480, height: 240,       // grows to 480×440 with suggestions
  alwaysOnTop: true,
  type: 'panel',                  // doesn't appear in Mission Control
})
```

## Color Tokens (CSS custom properties)

```css
/* Dark theme — primary */
:root, [data-theme="dark"] {
  --bg-base: #15141A;
  --bg-elevated: #1C1B22;
  --bg-sidebar: transparent;      /* vibrancy backing */
  --bg-sidebar-tint: rgba(20, 19, 26, 0.55);
  --bg-list: #1A1920;
  --surface-1: #1F1E26;
  --surface-2: #262530;
  --border-subtle: rgba(255,255,255,0.06);
  --border-strong: rgba(255,255,255,0.10);
  --text-primary: rgba(255,255,255,0.92);
  --text-secondary: rgba(255,255,255,0.62);
  --text-tertiary: rgba(255,255,255,0.42);
  /* --accent: set dynamically from nativeTheme.getSystemAccentColor() */
  --accent-fallback: #3A8DFF;
  --accent-soft: color-mix(in srgb, var(--accent, var(--accent-fallback)) 16%, transparent);
  --accent-text: color-mix(in srgb, var(--accent, var(--accent-fallback)) 90%, white);
  --danger: #E5484D;
  --success: #46A758;
  --warning: #E2A03F;
}

/* Light theme */
[data-theme="light"] {
  --bg-base: #F7F6F3;
  --bg-elevated: #FFFFFF;
  --bg-sidebar: transparent;
  --bg-sidebar-tint: rgba(247, 246, 243, 0.65);
  --bg-list: #FBFAF7;
  --surface-1: #FFFFFF;
  --surface-2: #F2F0EC;
  --border-subtle: rgba(0,0,0,0.06);
  --border-strong: rgba(0,0,0,0.10);
  --text-primary: rgba(20,18,28,0.92);
  --text-secondary: rgba(20,18,28,0.62);
  --text-tertiary: rgba(20,18,28,0.42);
}
```

### Accent usage rule — SCARCE
The accent is used only for:
- Focus rings
- Active sidebar item (left bar + label)
- Primary button background
- Unread count pill on Feed
- Streaming caret
- Reminder due-soon badge

**Never** use accent for sidebar icons, large fills, or decorative elements.

### System accent color wiring
```typescript
// main process: read on start + on theme update
function getAccentColor() {
  const hex = nativeTheme.getSystemAccentColor?.() ?? '#3A8DFF'
  return hex  // pass to renderer via IPC
}
// renderer: set on <html>
document.documentElement.style.setProperty('--accent', accentColor)
```

## Typography

```css
/* System font (SF Pro via OS font stack) */
.ui-text {
  font-family: -apple-system, "SF Pro Text", "SF Pro Display", system-ui, sans-serif;
}

/* Assistant prose — Instrument Serif (bundled, no runtime fetch) */
.assistant-message {
  font-family: 'Instrument Serif', Georgia, serif;
  font-size: 18px;
  line-height: 28px;
}

/* Citations, file names, code, timestamps — Geist Mono (bundled) */
.code, .citation, .timestamp, .file-name {
  font-family: 'Geist Mono', 'SF Mono', monospace;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
```

**Size scale:** 11 (caption), 12 (label), 13 (body), 14 (emphasis), 17 (large title), 22 (display)  
**Icons:** Phosphor Icons `@phosphor-icons/react` at `regular` weight; `duotone` for active sidebar items

## Spacing & Density

```
Base unit: 4px
Sidebar item: 28px tall, 8px horizontal, 4px vertical gap
List item row: 56px tall, 12px horizontal
Form fields: 32px tall, 12px horizontal
Card radius: 8px (small), 12px (medium), 16px (large modal/panel)
Button/input radius: 6px (matches macOS standard controls)
```

## Layout — 3-Pane

```
Sidebar (left):    220px default, 200–280px range, resizable
  - 28px top reserved for traffic lights
  - drag region: -webkit-app-region: drag (header strip only)
  - Vibrancy + tint overlay
List pane (mid):   280px default, 240–360px range, resizable
Detail pane (right): flex, max content 720px centered
```

## Motion (Motion / `motion/react`)

```typescript
// Layout spring — sidebar items, active indicator
const layoutSpring = { stiffness: 320, damping: 32, mass: 0.7 }

// Fade transition — route changes, modals
const fade = { duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }

// Active sidebar pill — shared layoutId
<motion.div layoutId="active-pill" style={{ background: 'var(--accent-soft)' }}
  transition={layoutSpring} />

// Sources drawer — slide up from bottom of message
<motion.div
  initial={{ opacity: 0, y: 12 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
/>

// Proposals stagger fan-in
{proposals.map((p, i) => (
  <motion.div key={p.id}
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: i * 0.04, duration: 0.15 }}
  />
))}

// Streaming caret
.streaming-caret {
  display: inline-block;
  width: 2px; height: 1em;
  background: var(--accent);
  animation: blink 800ms step-end infinite;
}
@keyframes blink { 50% { opacity: 0 } }
```

**Always respect `prefers-reduced-motion`:**
```css
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

## Component Visual Rules

### Sidebar
- Active item: pill bg `--accent-soft`, 2px left edge accent bar, icon → duotone accent
- Hover: `--surface-2` bg, 80ms fade
- Section headers: 11px uppercase, `--text-tertiary`, letter-spacing 0.05em
- Counts: 16px round pill, `--surface-2` bg, tabular numerals

### Chat — Assistant Messages
- Instrument Serif 18/28, `--text-primary`
- Attribution row: small Sparkle icon (16, accent 60% opacity) + "Assistant" in SF 11 tertiary
- Citations: `[1]` `[2]` Geist Mono 11, accent color, hover → filename + chunk index
- NO bubble / background for assistant message body

### Chat — User Messages
- SF 13, `--text-primary`
- Subtle bubble: `--surface-1` bg, 8px radius, 8px 12px padding, max-width 560px, right-aligned

### Proposal Cards
- Max 360px wide, `--surface-1` bg, 12px radius, 16px padding
- Header: tiny accent dot + type label ("REMINDER" / "SUGGESTION") SF 11 uppercase
- Title: SF 14 medium
- Reminder date/time: Geist Mono 12, Phosphor Calendar icon
- Buttons: Accept (primary), Reject (ghost), right-aligned
- Confidence < 0.6 → don't render

### Composer (bottom of chat)
- 1px top border `--border-subtle`
- Auto-grow textarea max 8 lines
- Left: scope chip (clickable)
- Right: mic button (push-to-talk, pulse animation on press) + send (accent when non-empty)
- Footer hint: `↵ to send · ⇧↵ for newline · ⌘K for commands`

## Accessibility Rules
- WCAG 2.1 AA minimum
- Focus ring: accent at 60% opacity, 2px offset, on all interactive elements
- `aria-live="polite"` on streaming assistant messages
- `aria-label` on all icon-only buttons
- Keyboard: arrow keys navigate sidebar + list panes; `1/2/3/4` triage Inbox; `↵` accept top proposal; `Esc` close drawers
