const dia = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const diaCurto = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })
const diaHora = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export const fmtData = (iso?: string | null) => (iso ? dia.format(new Date(iso)) : '—')
export const fmtDataCurta = (iso?: string | null) => (iso ? diaCurto.format(new Date(iso)) : '—')
export const fmtDataHora = (iso?: string | null) => (iso ? diaHora.format(new Date(iso)) : '—')

/** "agora há pouco", "há 3 horas", "há 5 dias"... para último acesso. */
export function haQuanto(iso?: string | null) {
  if (!iso) return 'nunca'
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 2) return 'agora há pouco'
  if (min < 60) return `há ${min} minutos`
  const h = Math.round(min / 60)
  if (h < 24) return h === 1 ? 'há 1 hora' : `há ${h} horas`
  const d = Math.round(h / 24)
  if (d < 60) return d === 1 ? 'ontem' : `há ${d} dias`
  return `em ${fmtData(iso)}`
}

/** Valor em centavos para R$ 9,99. */
export const fmtDinheiro = (centavos: number, moeda = 'brl') =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda.toUpperCase() }).format((centavos ?? 0) / 100)

/** "9,99" ou "9.99" ou "10" (o que a pessoa digita) para centavos; null se não for um valor. */
export function paraCentavos(texto: string): number | null {
  const limpo = texto.replace(/[^\d,.]/g, '')
  if (!limpo) return null
  const normal = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo
  const n = Number(normal)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null
}

/** Data de hoje no formato do campo de data (aaaa-mm-dd), no horário local. */
export const hojeISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export type Tom = 'verde' | 'azul' | 'amarelo' | 'vermelho' | 'violeta' | 'cinza'

/** Situação da conta em português, a partir do status da assinatura. */
export function situacao(status: string, teste_fim?: string | null, periodo_fim?: string | null): { texto: string; tom: Tom } {
  const agora = Date.now()
  const vale = (iso?: string | null) => Boolean(iso && new Date(iso).getTime() > agora)
  switch (status) {
    case 'teste':
      return vale(teste_fim) ? { texto: `Teste grátis até ${fmtDataCurta(teste_fim)}`, tom: 'azul' } : { texto: 'Teste acabou', tom: 'cinza' }
    case 'pix':
      return vale(periodo_fim) ? { texto: `Liberado até ${fmtDataCurta(periodo_fim)}`, tom: 'verde' } : { texto: `Venceu em ${fmtDataCurta(periodo_fim)}`, tom: 'cinza' }
    case 'cortesia': return { texto: 'Vitalício', tom: 'violeta' }
    case 'active': return { texto: 'Assinante (cartão)', tom: 'verde' }
    case 'trialing': return { texto: 'Assinante em teste (cartão)', tom: 'verde' }
    case 'past_due': return { texto: 'Cartão recusado, tentando de novo', tom: 'amarelo' }
    case 'unpaid':
    case 'incomplete':
    case 'paused': return { texto: 'Cartão com problema', tom: 'vermelho' }
    case 'canceled':
    case 'incomplete_expired': return { texto: 'Cancelou', tom: 'cinza' }
    default: return { texto: 'Sem plano', tom: 'cinza' }
  }
}

/** A conta paga pelo cartão (Stripe): o acesso se mexe pelo Stripe, não pelo painel. */
export const pagaNoCartao = (status?: string | null) => ['trialing', 'active', 'past_due', 'unpaid', 'incomplete', 'paused'].includes(status ?? '')

/** Nome de cada ação do registro, em português. */
export const NOME_DA_ACAO: Record<string, string> = {
  ver_ficha: 'Abriu a ficha',
  acesso_dias: 'Liberou dias de acesso',
  acesso_ate: 'Liberou acesso até uma data',
  acesso_vitalicio: 'Liberou acesso vitalício',
  acesso_teste: 'Estendeu o teste grátis',
  acesso_revogar: 'Tirou o acesso',
  anotar: 'Fez uma anotação',
  senha_email: 'Mandou e-mail de senha nova',
  senha_link: 'Gerou link de senha nova',
  reenviar_confirmacao: 'Reenviou a confirmação do e-mail',
  confirmar_email: 'Confirmou o e-mail',
  trocar_email: 'Trocou o e-mail',
  bloquear: 'Bloqueou a conta',
  desbloquear: 'Desbloqueou a conta',
  encerrar_sessoes: 'Desconectou de todos os aparelhos',
  excluir: 'Excluiu a conta',
  erro_resolver: 'Marcou um erro como resolvido',
  erro_reabrir: 'Reabriu um erro',
}
