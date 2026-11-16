import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Gastos Familia',
        short_name: 'Gastos',
        description: 'Registro de gastos e ingresos familiares',
        theme_color: '#0a0f1e',
        background_color: '#0a0f1e',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        // Cache app shell for offline use. API calls to Supabase are handled
        // by our own local-first sync logic (db.ts / sync.ts), not by the SW.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // La lectura de PDF (pdf.js + su worker, ~1,8 MB) solo se usa en "Revisión
        // de resúmenes": no va en la instalación inicial, se descarga la primera
        // vez que se usa y queda en caché para las siguientes.
        globIgnores: ['**/assets/pdf-*.js', '**/assets/pdf.worker*'],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/pdf[.-][^/]*\.m?js$/,
            handler: 'CacheFirst',
            options: { cacheName: 'pdf-lib', expiration: { maxEntries: 6 } },
          },
        ],
        navigateFallback: 'index.html'
      }
    })
  ]
})
