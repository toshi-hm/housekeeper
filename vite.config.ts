import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite({ routesDirectory: './src/routes', generatedRouteTree: './src/routeTree.gen.ts' }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('node_modules/@zxing')) return 'zxing'
          if (id.includes('node_modules/@supabase')) return 'supabase'
          if (id.includes('node_modules/@tanstack/react-query')) return 'query'
          if (id.includes('node_modules/@tanstack/react-router') || id.includes('node_modules/@tanstack/router')) return 'router'
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'react-vendor'
          return undefined
        },
      },
    },
  },
})
