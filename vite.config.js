import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-motion': ['framer-motion'],
          'vendor-react':  ['react', 'react-dom', 'react-router-dom'],
          'vendor-supa':   ['@supabase/supabase-js'],
        },
      },
    },
  },
})
