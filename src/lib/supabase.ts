import { createClient } from '@supabase/supabase-js'

// Endereço e chave PÚBLICA do Supabase do OpusCash (os mesmos que o site publica no navegador). A chave pública não dá poder
// nenhum aqui: tudo o que o painel faz passa pela função "admin", que confere se é administrador e se entrou com o código.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://jyadqrepdueiiyskexmq.supabase.co'
const chave = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || 'sb_publishable_QwryTMftFcPhWX-Ft742Dw_j5hvsHp5'

const MARCADOR = 'painel-opuscash.sessao-chave'
const sufixos = ['', '-user', '-code-verifier']
const sessao = (() => {
  try {
    for (const sufixo of sufixos) localStorage.removeItem('painel-opuscash' + sufixo)
  } catch { /* sem acesso ao armazenamento antigo */ }
  try {
    const armazenamento = sessionStorage
    const chave = armazenamento.getItem(MARCADOR) || `painel-opuscash-sessao-${crypto.randomUUID()}`
    armazenamento.setItem(MARCADOR, chave)
    return { chave, armazenamento }
  } catch { return { chave: MARCADOR, armazenamento: undefined } }
})()

export const supabase = createClient(url, chave, {
  auth: {
    storageKey: sessao.chave,
    storage: sessao.armazenamento,
    persistSession: Boolean(sessao.armazenamento),
    detectSessionInUrl: false,
  },
})

export async function sairDoPainel() {
  try {
    await supabase.auth.stopAutoRefresh()
    await supabase.auth.signOut({ scope: 'local' })
  } catch { /* a sessão local também é removida quando o servidor está indisponível */ }
  try {
    for (const sufixo of sufixos) sessao.armazenamento?.removeItem(sessao.chave + sufixo)
  } finally {
    location.reload()
  }
}
