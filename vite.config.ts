import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/** Número desta publicação (o commit na Vercel ou a hora do build), em /versao.json, para conferir o que está no ar. */
const VERSAO = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 12) || String(Date.now())

const arquivoDeVersao = (): Plugin => ({
  name: 'versao-json',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'versao.json', source: JSON.stringify({ versao: VERSAO }) })
  },
})

export default defineConfig({
  plugins: [react(), arquivoDeVersao()],
  define: { __VERSAO__: JSON.stringify(VERSAO) },
})
