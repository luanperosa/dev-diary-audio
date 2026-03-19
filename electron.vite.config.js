import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { cpSync } from 'node:fs'

const aliases = {
  '@/main': resolve(__dirname, 'src/main'),
  '@/preload': resolve(__dirname, 'src/preload'),
  '@/renderer': resolve(__dirname, 'src/renderer'),
}

// electron-vite v5 SSR mode doesn't follow CJS require() into local files,
// so we copy src/main/lib alongside the built output after each build.
function copyLibPlugin() {
  return {
    name: 'copy-lib',
    closeBundle() {
      cpSync('src/main/lib', 'dist/main/lib', { recursive: true })
    }
  }
}

export default defineConfig({
  main: {
    build: {
      outDir: 'dist/main',
    },
    resolve: {
      alias: aliases,
    },
    plugins: [externalizeDepsPlugin(), copyLibPlugin()],
  },
  preload: {
    build: {
      outDir: 'dist/preload',
    },
    resolve: {
      alias: aliases,
    },
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    build: {
      outDir: 'dist/renderer',
    },
    resolve: {
      alias: aliases,
    },
    plugins: [react()],
  },
})
