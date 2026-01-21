import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
    plugins: [react()],
    // Use root path for Databricks deployment, GitHub Pages path otherwise
    base: mode === 'databricks' ? '/' : '/AI-Metadata-Improvement-Tool/',
    build: {
        // For Databricks, output to backend/static
        outDir: mode === 'databricks' ? 'backend/static' : 'dist',
        emptyOutDir: true,
    },
}))
