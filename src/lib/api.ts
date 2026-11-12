import { supabase } from './supabase'

/** Recusa vinda do servidor (mensagem pronta para mostrar). `precisaCodigo`: o login perdeu a confirmação do código do celular. */
export class ErroDoPainel extends Error {
  precisaCodigo: boolean
  status: number
  constructor(msg: string, precisaCodigo = false, status = 0) {
    super(msg)
    this.precisaCodigo = precisaCodigo
    this.status = status
  }
}

/** Ouvintes de "o login caiu" (401) ou "falta o código" (403 precisa_codigo): o App volta para a tela certa. */
const aoPerderAcesso = new Set<(motivo: 'login' | 'codigo') => void>()
export const ouvirPerdaDeAcesso = (f: (motivo: 'login' | 'codigo') => void) => {
  aoPerderAcesso.add(f)
  return () => { aoPerderAcesso.delete(f) }
}

type Resposta = { ok?: boolean; dados?: unknown; erro?: string; precisa_codigo?: boolean }

/** Chama a função "admin" no servidor. É o único caminho do painel para o banco. */
export async function api<T>(acao: string, dados: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin', { body: { ...dados, acao } })
  if (!error) return ((data as Resposta)?.dados ?? data) as T
  // resposta que não é 2xx chega como erro, com o corpo em error.context
  const ctx = (error as { context?: unknown }).context
  let corpo: Resposta | null = null
  let status = 0
  if (ctx instanceof Response) {
    status = ctx.status
    corpo = await ctx.clone().json().catch(() => null)
  }
  if (status === 401) aoPerderAcesso.forEach((f) => f('login'))
  if (corpo?.precisa_codigo) aoPerderAcesso.forEach((f) => f('codigo'))
  throw new ErroDoPainel(corpo?.erro ?? (status ? `Erro ${status} no servidor.` : 'Sem conexão com o servidor. Tente de novo.'),
    Boolean(corpo?.precisa_codigo), status)
}

export const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : String(e))
