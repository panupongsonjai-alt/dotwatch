import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function manualChunks(id) {
  if (!id.includes('node_modules')) return undefined

  if (id.includes('/firebase/')) return 'vendor-firebase'
  if (id.includes('/recharts/') || id.includes('/d3-')) return 'vendor-charts'
  if (id.includes('/leaflet/') || id.includes('/react-leaflet/')) {
    return 'vendor-maps'
  }
  if (id.includes('/lucide-react/')) return 'vendor-icons'

  return undefined
}

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
})
