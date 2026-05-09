## Personal AI agent — visual design system

Companion to `personal-agent-plan.md`. This document locks the look-and-feel so the implementation stays cohesive and feels like a native macOS app, not a web page in an Electron shell.

## Design direction (locked)
- **Mood**: pro-app refined (Things 3 / Linear / Day One territory) — native-feeling but recognizably its own thing.
- **Goal**: feels like a Mac app you'd pay for; never feels like a web app shoved into Electron.
- **Tone**: calm, focused, slightly editorial. Confident restraint over decorative chaos.

## Window & shell (locked)
### Main window
- **Window chrome**: `titleBarStyle: 'hiddenInset'` — traffic lights float over the sidebar; no titlebar text.
  - Reserve a `~28px` inset top of the sidebar where the traffic lights sit; nothing clickable there.
  - Make the sidebar's top region a `-webkit-app-region: drag` zone.
- **Vibrancy**: `vibrancy: 'sidebar'` on the sidebar pane only. Content panes are solid.
- **Window size**: default 1280×820, min 980×640. Restore last position/size.
- **Traffic light position**: default macOS inset.
- **Window shadow & rounding**: native.

### Quick-capture window (NEW — added per business decisions)
- Frameless, transparent corners with `vibrancy: 'hud'`.
- Size 480×240 (auto-grows to 480×440 when there are inline suggestions).
- Center-top of the active screen, 96px from the top.
- Always-on-top while focused; dismisses on blur or `Esc`.
- Summoned via global `⌘⇧Space` (registered with `globalShortcut`) or single click on tray.
- Contents: a single multi-line input, a mic button (push-to-talk), and a quiet status line ("Captured · in Inbox" after submit).
- Submitting writes to Inbox, plays a tiny sound (system default), shows the status line for 800ms, then closes.
- After capture, the agent's pre-classification (reminder / note / chat) appears as a one-line "We'll triage this as: …" with an `Undo` action.

### Tray icon (NEW)
- Single Phosphor `Sparkle` (16) in the menubar.
- Single click → opens quick-capture.
- Right-click → `Open Bestfriend`, `New chat`, `Inbox (3)`, separator, `Quit`.
- Badge dot when there are untriaged inbox items.

## Layout (locked)
- **Hybrid 3-pane**:
  - **Sidebar (left, 220px, resizable 200–280)**: sections (Library, Chat, Feed, Settings), collections list, conversation list (when in Chat), pinned reminders count.
  - **List pane (middle, 280px, resizable 240–360)**: contextual list — conversations in Chat, documents in Library, feed items in Feed.
  - **Detail pane (right, flex)**: the active conversation / document / settings panel.
- All splits resizable with native-feeling drag handles (1px line that widens on hover, like Mail).
- Sidebar can be collapsed (`Cmd+\`); when collapsed, traffic lights re-flow to the top-left.

## Theme (locked)
- **Follow system**, design **dark first**.
- Both themes ship in v1; switch automatically with `prefers-color-scheme` + `nativeTheme.shouldUseDarkColors`.
- Manual override in Settings (`System` / `Light` / `Dark`).

## Color tokens
All colors live as CSS custom properties on `:root`, with `[data-theme="dark"]` and `[data-theme="light"]` overrides.

### Dark (primary)
- `--bg-base`: `#15141A` (warm near-black, not pure)
- `--bg-elevated`: `#1C1B22`
- `--bg-sidebar`: `transparent` (vibrancy backing) with `rgba(20, 19, 26, 0.55)` tint overlay
- `--bg-list`: `#1A1920`
- `--surface-1`: `#1F1E26` (cards, popovers)
- `--surface-2`: `#262530`
- `--border-subtle`: `rgba(255,255,255,0.06)`
- `--border-strong`: `rgba(255,255,255,0.10)`
- `--text-primary`: `rgba(255,255,255,0.92)`
- `--text-secondary`: `rgba(255,255,255,0.62)`
- `--text-tertiary`: `rgba(255,255,255,0.42)`
- `--accent`: bound to system accent color via `nativeTheme.getSystemAccentColor()` (fallback `#3A8DFF`)
- `--accent-soft`: `color-mix(in srgb, var(--accent) 16%, transparent)`
- `--accent-text`: `color-mix(in srgb, var(--accent) 90%, white)`
- `--danger`: `#E5484D`
- `--success`: `#46A758`
- `--warning`: `#E2A03F`

### Light
- `--bg-base`: `#F7F6F3` (off-white, warm)
- `--bg-elevated`: `#FFFFFF`
- `--bg-sidebar`: `transparent` with `rgba(247, 246, 243, 0.65)` tint
- `--bg-list`: `#FBFAF7`
- `--surface-1`: `#FFFFFF`
- `--surface-2`: `#F2F0EC`
- `--border-subtle`: `rgba(0,0,0,0.06)`
- `--border-strong`: `rgba(0,0,0,0.10)`
- `--text-primary`: `rgba(20,18,28,0.92)`
- `--text-secondary`: `rgba(20,18,28,0.62)`
- `--text-tertiary`: `rgba(20,18,28,0.42)`

### Accent usage rule
The accent is **scarce by design**:
- focus rings
- the active sidebar item (left bar + label)
- primary button background
- unread count pill on Feed
- streaming caret
- reminder due-soon badge

Never use the accent for icons in the sidebar, chrome, or large fills.

## Typography (locked)
- **UI / chrome / lists / forms**: SF Pro (`-apple-system, "SF Pro Text", "SF Pro Display"`).
  - Sizes: 11 (caption), 12 (label), 13 (body), 14 (emphasis), 17 (large title), 22 (display).
  - Use SF Pro Text under 19px, SF Pro Display above (browser does this automatically with the system stack).
- **Assistant message body**: **Instrument Serif** (Google Fonts, OFL).
  - Sizes: 18/28 line height (default), 20/30 (large mode).
  - Used only for assistant prose; user messages stay in SF.
- **Citations / file names / timestamps / code**: **Geist Mono** (Vercel, OFL).
  - Sizes: 11 (caption), 12 (inline).
- **Display headers** (empty states, onboarding, big section titles): Instrument Serif at 32–48 with tight letter-spacing (-1.5%).

### Typographic feel rules
- Numerals: tabular for amounts/timestamps (`font-variant-numeric: tabular-nums`).
- Letter-spacing: -1% for >24px sans, -1.5% for serif display, default for body.
- Never bold the serif; weight changes via italic/regular only.

## Iconography (locked)
- **Phosphor Icons** (`@phosphor-icons/react`) at `regular` weight default.
- Sizes: 14 (inline), 16 (sidebar), 18 (toolbar), 20 (empty states).
- Active sidebar icon switches to `duotone` weight in accent color.

## Motion (locked)
- Library: **Motion** (`motion/react`) for React.
- Default easing: spring `{ stiffness: 320, damping: 32, mass: 0.7 }` for layout; `{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }` for fades.
- Uses:
  - Sidebar item hover: 80ms background fade.
  - Active item indicator: shared-layout `layoutId="active-pill"` slides between items.
  - Sources drawer: slide-up from bottom of message (200ms spring).
  - Proposals: stagger-fan-in (delay 40ms each, max 4 visible at once).
  - Streaming caret: 800ms blink, accent color, narrow (`2px × 1em`).
  - Route change: 120ms cross-fade only (no sliding panes).
- **Respect `prefers-reduced-motion`**: drop all spring transitions to opacity-only fades.

## Density & spacing (default: comfortable)
- Base unit: 4px.
- Sidebar item row: 28px tall, 8px horizontal padding, 4px vertical gap between items.
- List item row: 56px (two lines: title + secondary), 12px horizontal padding.
- Form fields: 32px tall, 12px horizontal.
- Card radii: 8px (small), 12px (medium), 16px (large modal/panel).
- Inputs/buttons: 6px radius (matches macOS standard controls).

## Component-level looks

### Sidebar
- Background: vibrancy + tint overlay (see color tokens).
- Top reserved zone: 28px (traffic lights).
- Section headers: 11px uppercase, `--text-tertiary`, 12px letter-spacing 0.05em.
- Active item: pill background `--accent-soft`, left edge `2px` accent bar, icon switches to duotone accent.
- Hover: `--surface-2` background.
- Counts (e.g. unread feed): tabular numerals in a 16px round pill, `--surface-2` bg, `--text-secondary` text.

### List pane
- Solid background `--bg-list`.
- Item: avatar/icon (left), title (SF 13 medium), preview (SF 12 secondary, single line), timestamp top-right (Geist Mono 11 tertiary).
- Selected item: `--surface-2` bg, no accent (accent stays in sidebar to avoid double-highlight).
- Sticky section dividers (e.g. "Today", "This week") in 11 uppercase tertiary.

### Detail pane (chat)
- Background: `--bg-base`.
- Max content width 720px, centered with generous side gutters.
- **Assistant message**:
  - Instrument Serif 18/28, `--text-primary`.
  - Tiny attribution row above: a small Phosphor `Sparkle` icon (16, accent at 60% opacity) + "Assistant" in SF 11 tertiary.
  - Citations rendered inline as `[1]` `[2]` in Geist Mono 11, accent color, hover reveals filename + chunk index.
  - Sources drawer: slim disclosure at the bottom of the message ("Sources · 3 docs · 1 past chat") — clicking expands a card with the retrieved chunks.
- **User message**:
  - SF 13, `--text-primary`.
  - Subtle bubble: `--surface-1` background, 8px radius, 8px 12px padding, max-width 560px, right-aligned.
  - No avatar.
- **Proposals block** (when present, after assistant message):
  - 1–3 cards, max 360px wide, `--surface-1` bg, 12px radius, 16px padding.
  - Card header: tiny accent dot + type label ("Reminder" / "Suggestion") in SF 11 uppercase.
  - Title in SF 14 medium.
  - Reminder cards show date/time in Geist Mono 12 with a small Phosphor `Calendar` icon.
  - Two buttons: `Accept` (primary) and `Reject` (ghost). Right-aligned.
  - Cards stagger-fan-in.
- **Composer** (sticky bottom):
  - 1px top border `--border-subtle`.
  - Auto-grow textarea up to 8 lines.
  - Left: scope chip ("All collections" or "Work, Journal" — clickable to change).
  - Right: mic button (push-to-talk; pressed state pulses accent), send button (icon-only, accent when input non-empty).
  - Keyboard hint footer in SF 11 tertiary: `↵ to send · ⇧↵ for newline · ⌘K for commands`.

### Library
- Documents grid (default) or list (toggle).
- Each card: small file-type icon, filename (SF 13 medium), collection chips below, status dot (indexed/indexing/error).
- Drop zone: full-pane drag overlay with a dashed border in accent and the empty-state serif headline ("Drop to add to your library.").
- Folder index rows: folder icon, path in Geist Mono 12 secondary, "scan" / "remove" actions on hover.

### Feed
- Single list, newest first.
- Reminder-fired items: small reminder icon, title in SF 14 medium, time in Geist Mono 12 secondary.
  - Inline actions: `Done` (default), `Snooze ▾` (popover with 10m/1h/Tomorrow).
- Announcements / index errors use a different icon and `--text-secondary` accent border-left.

### Inbox (NEW)
- Top of sidebar shows `Inbox` with an untriaged count pill.
- List view: each capture as a row with kind icon (`PencilSimple` for text, `Microphone` for voice), preview, time, and a small confidence-tinted "suggested:" chip ("→ Reminder", "→ Note", "→ Chat").
- Selecting a row opens a triage panel on the right:
  - Full transcript / text.
  - Suggested action pre-filled (with editable fields if it's a reminder).
  - Four large buttons: `Reminder`, `Note`, `Start chat`, `Dismiss`.
  - Keyboard shortcuts: `1/2/3/4` to triage; `↵` accepts the suggested action; `Esc` dismiss.
- Once triaged, item moves to the bottom collapsed "Done today" group; can be undone for ~10s with a toast.

### Settings
- Two-column layout inside the detail pane: section nav (left) + settings form (right).
- Form rows: 32px tall control on right, label on left.
- "Wipe all data" lives at the bottom of Privacy in `--danger` ghost button with a confirm modal.

### Empty states
- Centered Instrument Serif headline (32–40), one or two SF body lines, one quiet primary action.
- A single Phosphor icon at 64px, `--text-tertiary`, 24px above the headline.
- Examples:
  - Library empty: "Nothing here yet." / "Drag a folder or drop a file."
  - Chat empty: "What's on your mind?"

## Native macOS niceties (build into M0/M1)
- **Native menu bar**: File / Edit / View / Window / Help with sensible items (New Chat ⌘N, New Reminder ⌘R, Find ⌘F, Toggle Sidebar ⌘\, Settings ⌘,).
- **Native context menus** (`Menu.popup`) for sidebar items, list items, messages.
- **Dock badge** for unread feed items.
- **Notification center**: send via `new Notification(...)` from the renderer (Electron forwards to `UNUserNotificationCenter`); include action buttons (Snooze / Done) using `actions` on macOS notifications.
- **Native file dialogs** only (no in-window file pickers).
- **Window state restoration**: remember last size/position and which conversation/document was active.
- **Cmd+, opens Settings** as a separate route in the same window (not a modal — feels more native).

## Keyboard shortcuts (native-feeling)
- `⌘⇧Space` (global) toggle quick-capture window
- `⌘N` new chat
- `⌘⇧N` new collection
- `⌘O` open file (drop dialog)
- `⌘K` command palette (deferred but reserved)
- `⌘F` search current pane
- `⌘1` Inbox, `⌘2` Library, `⌘3` Chat, `⌘4` Feed, `⌘,` Settings
- `⌘\` toggle sidebar
- `⌘[` / `⌘]` back/forward in detail pane
- `⌘↵` accept top proposal / accept suggested triage in Inbox
- `Esc` reject top proposal / close drawers / close capture window
- `Space` (in list panes) preview (Quick Look-style sheet)
- In Inbox: `1` Reminder · `2` Note · `3` Chat · `4` Dismiss

## Accessibility
- All interactive elements reachable by keyboard with visible focus rings (accent at 60% opacity, 2px offset).
- AA contrast minimum across both themes.
- `aria-live=polite` for streaming assistant messages.
- `prefers-reduced-motion` honored throughout.

## What we're explicitly avoiding
- Purple gradients, "AI shimmer" backgrounds.
- Bubble-style chat for assistant messages.
- Inter / Roboto / generic system sans for content.
- Decorative icons in primary buttons.
- Custom titlebars or hamburger menus.
- Toast notifications for important things — use the Feed + native notifications.
- Modal-heavy flows — prefer inline edits and side panels.

## Implementation notes
- **Fonts**: load Instrument Serif and Geist Mono via `@font-face` with `font-display: swap` from local files bundled in the app (no runtime Google Fonts call).
- **Vibrancy**: set in `BrowserWindow` constructor; render the sidebar with a translucent backing (`background: transparent`) and apply the tint overlay as a sibling absolute layer so text stays crisp.
- **System accent**: read on app start and on `nativeTheme.on('updated')`; write to `--accent` on `:root`.
- **Theme switch**: subscribe to `nativeTheme.on('updated')`; toggle `data-theme` on `<html>`.
- **Drag region**: only the sidebar header strip is `-webkit-app-region: drag`; explicit `no-drag` on any control inside it.
