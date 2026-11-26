import { createClient } from '@supabase/supabase-js'

// Endereço e chave PÚBLICA do Supabase do OpusCash (os mesmos que o site publica no navegador). A chave pública não dá poder
// nenhum aqui: tudo o que o painel faz passa pela função "admin", que confere se é administrador e se entrou com o código.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://jyadqrepdueiiyskexmq.supabase.co'
const chave = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || 'sb_publishable_QwryTMftFcPhWX-Ft742Dw_j5hvsHp5'

/*
 * Onde fica o login do painel:
 * - na aba (padrão): sessionStorage, uma chave por aba. Fechar a aba (ou o app instalado) encerra o login.
 * - no aparelho ("Manter conectado por 7 dias", na tela de entrar): localStorage, com prazo de PRAZO_CONECTADO desde a senha.
 *   Vencido, a sessão sai daqui antes de o Supabase lê-la e é encerrada no servidor. A função "admin" também recusa login
 *   com senha de mais de 7 dias (supabase/functions/admin), e o código do celular continua obrigatório em todo login.
 */
const MARCADOR = 'painel-opuscash.sessao-chave'
const CHAVE_DO_APARELHO = 'painel-opuscash-conectado'
const CHAVE_DO_PRAZO = 'painel-opuscash.conectado'
export const PRAZO_CONECTADO = 7 * 24 * 60 * 60 * 1000
const sufixos = ['', '-user', '-code-verifier']

type Guardada = { user?: { id?: unknown }; refresh_token?: unknown }
const ler = (a: Storage | undefined, k: string): Guardada | null => {
  try { return JSON.parse(a?.getItem(k) ?? 'null') as Guardada | null } catch { return null }
}
const idDe = (s: Guardada | null) => (typeof s?.user?.id === 'string' ? s.user.id : null)
const local = (): Storage | undefined => { try { return localStorage } catch { return undefined } }

/** O login guardado no aparelho ainda vale (o prazo é dessa conta e não passou, nem foi esticado além do máximo). */
function conectadoValido(): boolean {
  const id = idDe(ler(local(), CHAVE_DO_APARELHO))
  let prazo: { id?: unknown; ate?: unknown } | null = null
  try { prazo = JSON.parse(local()?.getItem(CHAVE_DO_PRAZO) ?? 'null') } catch { /* estragado */ }
  if (!id || prazo?.id !== id || typeof prazo.ate !== 'number') return false
  return Date.now() < prazo.ate && prazo.ate - Date.now() <= PRAZO_CONECTADO
}

/** Apaga o login do aparelho e o prazo; devolve o refresh token que estava lá (para encerrar no servidor). */
function apagarDoAparelho(): string | null {
  const rt = ler(local(), CHAVE_DO_APARELHO)?.refresh_token
  try {
    for (const sufixo of sufixos) local()?.removeItem(CHAVE_DO_APARELHO + sufixo)
    local()?.removeItem(CHAVE_DO_PRAZO)
  } catch { /* sem armazenamento */ }
  return typeof rt === 'string' && rt ? rt : null
}

let vencida: string | null = null
const sessao = (() => {
  try {
    for (const sufixo of sufixos) localStorage.removeItem('painel-opuscash' + sufixo)
  } catch { /* sem acesso ao armazenamento antigo */ }
  if (local()?.getItem(CHAVE_DO_APARELHO) && !conectadoValido()) vencida = apagarDoAparelho()
  try {
    const armazenamento = sessionStorage
    const chaveDaAba = armazenamento.getItem(MARCADOR) || `painel-opuscash-sessao-${crypto.randomUUID()}`
    armazenamento.setItem(MARCADOR, chaveDaAba)
    const aparelho = local()
    if (!idDe(ler(armazenamento, chaveDaAba)) && aparelho && conectadoValido()) {
      return { modo: 'aparelho' as const, chave: CHAVE_DO_APARELHO, armazenamento: aparelho as Storage | undefined, chaveDaAba }
    }
    return { modo: 'aba' as const, chave: chaveDaAba, armazenamento: armazenamento as Storage | undefined, chaveDaAba }
  } catch { return { modo: 'aba' as const, chave: MARCADOR, armazenamento: undefined as Storage | undefined, chaveDaAba: MARCADOR } }
})()

export const supabase = createClient(url, chave, {
  auth: {
    storageKey: sessao.chave,
    storage: sessao.armazenamento,
    persistSession: Boolean(sessao.armazenamento),
    detectSessionInUrl: false,
  },
})

/** Encerra no servidor um login que saiu deste aparelho (melhor esforço). */
async function encerrarNoServidor(refresh_token: string | null) {
  if (!refresh_token) return
  const outro = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'painel-opuscash-outro' } })
  const tarefa = outro.auth.refreshSession({ refresh_token })
    .then(({ data }) => (data.session ? outro.auth.signOut({ scope: 'local' }) : undefined)).catch(() => {})
  await Promise.race([tarefa, new Promise((r) => setTimeout(r, 4000))])
}
if (vencida) void encerrarNoServidor(vencida)

// login do aparelho: venceu com o painel aberto, ou outra aba saiu ou entrou com outra conta → recarrega
if (sessao.modo === 'aparelho') {
  const idDaPagina = idDe(ler(local(), CHAVE_DO_APARELHO))
  const conferir = () => {
    const agora = conectadoValido() ? idDe(ler(local(), CHAVE_DO_APARELHO)) : null
    if (agora === idDaPagina) return
    void supabase.auth.stopAutoRefresh()
    location.reload()
  }
  setInterval(conferir, 60_000)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') conferir() })
  window.addEventListener('storage', (e) => { if (e.key === null || e.key === CHAVE_DO_APARELHO || e.key === CHAVE_DO_PRAZO) conferir() })
}

/**
 * Entrou com a senha e pediu "Manter conectado": o login passa da aba para o aparelho, com prazo de 7 dias, e a página
 * recarrega (o código do celular é pedido em seguida, como sempre).
 */
export async function manterNoAparelho() {
  const atual = (await supabase.auth.getSession()).data.session
  if (!atual || sessao.modo !== 'aba' || !sessao.armazenamento) return
  try {
    await supabase.auth.stopAutoRefresh()
    const antigo = apagarDoAparelho()
    localStorage.setItem(CHAVE_DO_PRAZO, JSON.stringify({ id: atual.user.id, ate: Date.now() + PRAZO_CONECTADO }))
    localStorage.setItem(CHAVE_DO_APARELHO, JSON.stringify(atual))
    for (const sufixo of sufixos) sessao.armazenamento.removeItem(sessao.chave + sufixo)
    if (antigo && antigo !== atual.refresh_token) await encerrarNoServidor(antigo)
  } catch { /* sem armazenamento: fica só na aba */ }
  location.reload()
}

export async function sairDoPainel() {
  try {
    await supabase.auth.stopAutoRefresh()
    await Promise.race([supabase.auth.signOut({ scope: 'local' }), new Promise((r) => setTimeout(r, 6000))])
  } catch { /* a sessão local também é removida quando o servidor está indisponível */ }
  try {
    for (const sufixo of sufixos) sessao.armazenamento?.removeItem(sessao.chave + sufixo)
    if (sessao.modo === 'aparelho') apagarDoAparelho()
  } finally {
    location.reload()
  }
}
