import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/metal-bending-calculator/',
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2019',
    minify: false,
    sourcemap: true,
    chunkSizeWarningLimit: 5000,
  },
})
