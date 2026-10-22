import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function manualChunks(id) {
  if (!id.includes('node_modules')) return undefined

  // Stylesheets stay with the module that imports them. Assigning
  // leaflet.css to vendor-maps made the entry chunk depend on vendor-maps,
  // so ~290 kB of map code was preloaded on every page, including Login.
  if (id.endsWith('.css')) return undefined

  // React gets its own chunk. Otherwise Rollup hoists it into the first
  // manual chunk that uses it (vendor-maps via react-leaflet), which again
  // forces the map chunk onto the critical path.
  if (
    id.includes('/node_modules/react/') ||
    id.includes('/node_modules/react-dom/') ||
    id.includes('/node_modules/scheduler/')
  ) {
    return 'vendor-react'
  }

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
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
    ],
  },
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
