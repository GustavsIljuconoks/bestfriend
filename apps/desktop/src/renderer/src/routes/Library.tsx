import { Books } from '@phosphor-icons/react'

export function Library() {
  return (
    <div className="route-placeholder">
      <Books size={64} weight="thin" />
      <h1>Nothing here yet.</h1>
      <p>Drag a folder or drop a file to add it to your library.</p>
    </div>
  )
}
