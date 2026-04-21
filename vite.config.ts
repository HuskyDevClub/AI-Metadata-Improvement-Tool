import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
    plugins: [react()],
    server: {
        // Proxy /api/* to the backend so the OAuth session cookie is same-origin
        // in dev. Without this, cookies set by :8000 aren't sent by :5173.
        proxy: {
            '/api': {
                target: 'http://localhost:8000',
                changeOrigin: true,
            },
        },
    },
    build: {
        // For Databricks, output to backend/static
        outDir: mode === 'databricks' ? 'backend/static' : 'dist',
        emptyOutDir: true,
    },
}))
