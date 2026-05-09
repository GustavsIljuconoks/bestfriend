import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const coreAlias = resolve(__dirname, '../../packages/core/src')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@bestfriend/core'] })],
    resolve: {
      alias: {
        '@bestfriend/core': coreAlias,
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@bestfriend/core'] })],
    resolve: {
      alias: {
        '@bestfriend/core': coreAlias,
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@bestfriend/core': resolve(coreAlias, 'renderer-public.ts'),
      },
    },
    plugins: [react()],
  },
})
