import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
function runtimeEnv(
  apiTimeoutMs: number,
  apiUrl: string,
  telegramUrl: string,
  gtmId: string,
): Plugin {
  const body = `window.__ENV__ = ${JSON.stringify({ apiTimeoutMs, apiUrl, telegramUrl, gtmId })};\n`
  const handler = (url: string | undefined, res: import('node:http').ServerResponse) => {
    if (url?.split('?')[0] !== '/env.js') return false
    res.setHeader('Content-Type', 'application/javascript')
    res.setHeader('Cache-Control', 'no-store')
    res.end(body)
    return true
  }
  return {
    name: 'hangmu-runtime-env',
    configureServer(server) {
      server.middlewares.use((req, res, next) => (handler(req.url, res) ? undefined : next()))
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => (handler(req.url, res) ? undefined : next()))
    },
  }
}

function buildVersion(id: string): Plugin {
  return {
    name: 'hangmu-build-version',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id }) })
    },
  }
}

function siteUrl(url: string): Plugin {
  return {
    name: 'hangmu-site-url',
    apply: 'serve',
    transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', url.replace(/\/+$/, '')),
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, '')
  const backend = env.BACKEND_URL || 'http://localhost:8080'
  const apiTimeoutMs = Number(env.API_TIMEOUT_MS || 10000)
  const devPort = Number(env.FRONTEND_DEV_PORT || 5173)
  const buildId = mode === 'development' ? 'dev' : Date.now().toString(36)

  return {
    define: { __BUILD_ID__: JSON.stringify(buildId) },
    plugins: [
      react(),
      buildVersion(buildId),
      runtimeEnv(apiTimeoutMs, env.API_URL || '', env.TELEGRAM_URL || '', env.GTM_ID || ''),
      siteUrl(env.SITE_URL || `http://localhost:${devPort}`),
    ],
    server: {
      port: devPort,
      proxy: {
        '/api': { target: backend, changeOrigin: true, proxyTimeout: apiTimeoutMs },
        '/ext/espn': {
          target: 'https://site.api.espn.com',
          changeOrigin: true,
          secure: true,
          proxyTimeout: 5000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; HangMU/1.0)',
            Cookie: '',
            Referer: '',
          },
          rewrite: (p) => p.replace(/^\/ext\/espn/, '/apis/site/v2/sports/soccer'),
        },
        '/ws': { target: backend.replace('http', 'ws'), ws: true },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 1500,
    },
  }
})
