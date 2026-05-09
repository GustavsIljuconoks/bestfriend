/// <reference types="vite/client" />

import type { WindowApi } from '@bestfriend/core'

declare global {
  interface Window {
    api: WindowApi
  }
}

export {}
