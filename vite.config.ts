import { execSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Build identity: captured once when Vite config is evaluated (i.e. at build
// time), then frozen into the bundle via `define`. CI builds from a real git
// checkout, so `git rev-parse` works there; the try/catch keeps it from
// breaking builds run without git history.
function gitCommit(): string {
    try {
        return execSync('git rev-parse --short HEAD', {
            stdio: ['ignore', 'pipe', 'ignore'],
        }).toString().trim()
    } catch {
        return 'unknown'
    }
}

const BUILD_COMMIT = gitCommit()
const BUILD_DATE = new Date().toISOString().slice(0, 10) // YYYY-MM-DD (UTC)

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
    plugins: [react()],
    resolve: {
        alias: {
            '~': fileURLToPath(new URL('./', import.meta.url)),
            '@': fileURLToPath(new URL('./src', import.meta.url))
        }
    },
    define: {
        __BUILD_COMMIT__: JSON.stringify(BUILD_COMMIT),
        __BUILD_DATE__: JSON.stringify(BUILD_DATE),
    },
    // ES-format workers so the import parser's lazy `import('xlsx')` splits into
    // its own chunk — a CSV upload then never downloads SheetJS. Matches our
    // `new Worker(..., { type: 'module' })` usage.
    worker: {
        format: 'es',
    },
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
