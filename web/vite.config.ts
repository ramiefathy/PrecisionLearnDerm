import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunk - stable dependencies
          vendor: ['react', 'react-dom', 'react-router-dom', 'zustand'],
          
          // Firebase chunk - often changes together
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/functions'],
          
          // Animation chunk - framer-motion is heavy
          animations: ['framer-motion'],
          
          // UI chunk - often used together
          ui: ['@testing-library/react', '@testing-library/jest-dom', '@testing-library/user-event']
        }
      }
    },
    target: 'esnext',
    minify: 'terser',
    chunkSizeWarningLimit: 600, // Warn for chunks larger than 600kb
    sourcemap: false // Disable sourcemaps in production for smaller bundles
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'framer-motion',
      'zustand'
    ]
  },
  server: {
    port: 5173,
    host: true,
    hmr: {
      overlay: false // Disable HMR overlay for better development experience
    }
  },
  preview: {
    port: 4173,
    host: true
  }
})
