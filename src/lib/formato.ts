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
  incluir_admin: 'Incluiu um administrador',
  stripe_cancelar_fim: 'Stripe: cancelou no fim do período',
  stripe_desfazer_cancelamento: 'Stripe: desfez o cancelamento',
  stripe_cancelar_agora: 'Stripe: cancelou a assinatura',
  stripe_cobrar_de_novo: 'Stripe: tentou cobrar de novo',
  stripe_dias_gratis: 'Stripe: deu dias grátis no cartão',
  stripe_reembolsar: 'Stripe: reembolsou uma cobrança',
  stripe_link_cartao: 'Stripe: gerou link para trocar o cartão',
  novidade_criar: 'Criou uma novidade',
  novidade_editar: 'Editou uma novidade',
  novidade_publicar: 'Publicou uma novidade',
  novidade_despublicar: 'Tirou uma novidade do ar',
  novidade_apagar: 'Apagou uma novidade',
}

/** Duas letras para o avatar: "Maria Souza" → "MS"; "joao.silva@x.com" → "JS"; "ana@x.com" → "AN". */
export function iniciais(texto: string) {
  const base = texto.includes('@') ? texto.split('@')[0] : texto
  const partes = base.split(/[\s._-]+/).map((p) => p.replace(/[^\p{L}]/gu, '')).filter(Boolean)
  if (partes.length >= 2) return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
  return (partes[0] ?? '?').slice(0, 2).toUpperCase()
}

const fmtInteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
/** 1234 → "1.234" (arredondado). */
export const inteiro = (n: number) => fmtInteiro.format(Math.round(n))

/** Cor de cada tom de etiqueta, para avatares, anéis e barras. */
export const corDoTom = (tom: Tom) => ({
  verde: 'var(--entrada)', azul: 'var(--caixa)', amarelo: 'var(--divida)', vermelho: 'var(--saida)', violeta: 'var(--violeta)', cinza: 'var(--cinza-grafico)',
})[tom]

/** Ícone de cada ação do registro (src/pecas/Icone.tsx). */
export const ICONE_DA_ACAO: Record<string, string> = {
  ver_ficha: 'olho', acesso_dias: 'calendario', acesso_ate: 'calendario', acesso_vitalicio: 'infinito', acesso_teste: 'ampulheta',
  acesso_revogar: 'cadeado', anotar: 'lapis', senha_email: 'email', senha_link: 'copiar', reenviar_confirmacao: 'email',
  confirmar_email: 'check', trocar_email: 'trocar', bloquear: 'cadeado', desbloquear: 'escudo', encerrar_sessoes: 'sair',
  excluir: 'lixeira', erro_resolver: 'check', erro_reabrir: 'historico', incluir_admin: 'pessoa',
  stripe_cancelar_fim: 'cartao', stripe_desfazer_cancelamento: 'desfazer', stripe_cancelar_agora: 'cartao', stripe_cobrar_de_novo: 'atualizar',
  stripe_dias_gratis: 'estrela', stripe_reembolsar: 'desfazer', stripe_link_cartao: 'cartao',
  novidade_criar: 'estrela', novidade_editar: 'lapis', novidade_publicar: 'estrela', novidade_despublicar: 'pausa', novidade_apagar: 'lixeira',
}

/** Nome de cada tela do OpusCash (o que o app manda na medição de uso, lib/uso.ts do OpusCash). */
const NOME_DA_TELA: Record<string, string> = {
  inicio: 'Início', lancamentos: 'Lançamentos', analise: 'Consultor', invest: 'Invest', contas: 'Contas do mês', cartoes: 'Cartões',
  dividas: 'Dívidas', metas: 'Metas', patrimonio: 'Dinheiro guardado', ano: 'Resumo do ano', lancar: 'Lançando',
  editar_lancamento: 'Editando um lançamento', importar: 'Importando extrato', categorias: 'Categorias', configuracoes: 'Configurações',
  excluir_conta: 'Excluir a conta', zerar_dados: 'Zerar os dados', meses: 'Quadro dos meses', tutorial: 'Tutorial',
  questionario: 'Perguntas iniciais', questionario_refazer: 'Refazendo as perguntas', assinatura: 'Tela de assinatura',
  carregando: 'Abrindo o app', painel: 'Painel',
}
export const nomeDaTela = (t?: string | null) => (t ? NOME_DA_TELA[t] ?? t : '—')

const nomesDeIdioma = (() => {
  try { return new Intl.DisplayNames(['pt-BR'], { type: 'language' }) } catch { return null }
})()
/** "en" → "inglês". */
export function nomeDoIdioma(codigo?: string | null) {
  if (!codigo) return '—'
  try {
    const n = nomesDeIdioma?.of(codigo)
    return n ? n.charAt(0).toUpperCase() + n.slice(1) : codigo
  } catch {
    return codigo
  }
}

export const NOME_DO_APARELHO: Record<string, string> = {
  app_android: 'App Android', site_celular: 'Site no celular', site_computador: 'Site no computador', site: 'Site',
}

export const NOME_DO_MODO: Record<string, string> = { simples: 'Simples', equilibrado: 'Equilibrado', detalhado: 'Detalhado' }

/** 3725 segundos → "1 h 2 min"; 42 → "42 s". */
export function duracao(segundos: number) {
  const s = Math.round(segundos || 0)
  if (s < 60) return `${s} s`
  const min = Math.round(s / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const resto = min % 60
  return resto ? `${h} h ${resto} min` : `${h} h`
}
