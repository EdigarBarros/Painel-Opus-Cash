// Função "admin": a ÚNICA porta do painel para o banco. O painel (navegador) não tem poder nenhum; ele pede, e esta função
// confere três coisas antes de fazer qualquer coisa:
//   1. o login é válido (o Supabase confere a assinatura do token: verificação de JWT ligada);
//   2. a conta está em adm_admins;
//   3. o login foi confirmado com o código do celular (aal2). Sem isso, só responde "quem sou eu" (para o painel pedir o código).
// Toda ação que muda algo fica em adm_registro (quem, o quê, em quem, quando e por quê).
//
// Segredos: STRIPE_SECRET_KEY (o mesmo do OpusCash: ler e mexer na assinatura no cartão, reembolsar e cancelar ao excluir). SUPABASE_URL, SUPABASE_ANON_KEY
// e SUPABASE_SERVICE_ROLE_KEY o Supabase já fornece. Opcional: PAINEL_ORIGENS (endereços extras do painel, separados por vírgula).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const SITE = 'https://www.opuscash.com.br'
const ORIGENS = ['https://admin.opuscash.com.br', 'http://localhost:5173', 'http://localhost:4173',
  ...(Deno.env.get('PAINEL_ORIGENS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)]
// endereços da Vercel deste projeto (produção e prévias)
const ORIGEM_VERCEL = /^https:\/\/painel-opus-cash[a-z0-9-]*\.vercel\.app$/

const cors = (req: Request) => {
  const origem = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ORIGENS.includes(origem) || ORIGEM_VERCEL.test(origem) ? origem : ORIGENS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

class Recusa extends Error {
  constructor(msg: string, public status = 400) { super(msg) }
}

/** Lê o conteúdo do token (já validado por getUser) para saber se o login passou pelo código do celular. */
function nivelDoLogin(token: string): string {
  try {
    const meio = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(meio.padEnd(meio.length + ((4 - (meio.length % 4)) % 4), '='))).aal ?? 'aal1'
  } catch {
    return 'aal1'
  }
}

const texto = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const uuid = (v: unknown) => {
  const s = texto(v, 40)
  if (!/^[0-9a-f-]{36}$/i.test(s)) throw new Recusa('Conta inválida.')
  return s
}
const motivoObrigatorio = (v: unknown) => {
  const m = texto(v)
  if (!m) throw new Recusa('Escreva o motivo.')
  return m
}

type Admin = { id: string; email: string }

async function registrar(db: SupabaseClient, admin: Admin, acao: string, alvo: { id?: string; email?: string } | null,
  motivo?: string | null, antes?: unknown, depois?: unknown) {
  const { error } = await db.from('adm_registro').insert({
    admin_id: admin.id, admin_email: admin.email, acao, alvo_id: alvo?.id ?? null, alvo_email: alvo?.email ?? null,
    motivo: motivo || null, antes: antes ?? null, depois: depois ?? null,
  })
  if (error) throw new Error(`não foi possível registrar a ação: ${error.message}`)
}

async function contaAlvo(db: SupabaseClient, id: string) {
  const { data, error } = await db.auth.admin.getUserById(id)
  if (error || !data.user) throw new Recusa('Conta não encontrada.', 404)
  return data.user
}

async function naoEhAdmin(db: SupabaseClient, id: string) {
  const { data } = await db.from('adm_admins').select('user_id').eq('user_id', id).maybeSingle()
  if (data) throw new Recusa('Esta ação não pode ser feita na conta de um administrador.')
}

// ---------- Stripe ----------
const STRIPE = 'https://api.stripe.com/v1'
const iso = (s?: number | null) => (s ? new Date(s * 1000).toISOString() : null)

/** Chamada ao Stripe com a chave secreta (que só existe aqui no servidor). Erro do Stripe vira mensagem para o painel. */
// deno-lint-ignore no-explicit-any
async function stripe(caminho: string, metodo = 'GET', params?: Record<string, string>): Promise<any> {
  const chave = Deno.env.get('STRIPE_SECRET_KEY')
  if (!chave) throw new Recusa('O Stripe não está configurado no servidor.', 500)
  const r = await fetch(`${STRIPE}/${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${chave}`, ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: params ? new URLSearchParams(params).toString() : undefined,
  })
  const j = await r.json().catch(() => null)
  if (!r.ok) throw new Recusa(`Stripe: ${j?.error?.message ?? `erro ${r.status}`}`, r.status === 404 ? 404 : 502)
  return j
}

// deno-lint-ignore no-explicit-any
const cartaoDe = (pm: any) => (pm?.card ? { bandeira: pm.card.brand, final: pm.card.last4, validade: `${pm.card.exp_month}/${pm.card.exp_year}` } : null)
// deno-lint-ignore no-explicit-any
const fimDoPeriodo = (sub: any) => sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end ?? null

/**
 * Depois de uma ação no Stripe, grava na hora o estado da assinatura (o mesmo que o stripe-webhook gravaria logo depois),
 * para a ficha já mostrar o certo. Como o webhook, não mexe em quem tem Pix ou cortesia.
 */
async function sincronizarAssinatura(db: SupabaseClient, userId: string, sid: string) {
  const { data: atual } = await db.from('assinaturas').select('status').eq('user_id', userId).maybeSingle()
  if (atual && ['cortesia', 'pix'].includes(atual.status)) return
  let sub
  try { sub = await stripe(`subscriptions/${sid}`) } catch { return }
  await db.from('assinaturas').update({
    status: sub.status, teste_fim: iso(sub.trial_end), periodo_fim: iso(fimDoPeriodo(sub)),
    cancela_no_fim: Boolean(sub.cancel_at_period_end), atualizado_em: new Date().toISOString(),
  }).eq('user_id', userId)
}

/** O que o Stripe sabe da conta: assinatura, cartão, faturas e cobranças (cartão e Pix). */
async function lerStripe(db: SupabaseClient, id: string) {
  const { data: ass } = await db.from('assinaturas').select('stripe_customer_id, stripe_subscription_id').eq('user_id', id).maybeSingle()
  const cus = ass?.stripe_customer_id
  if (!cus) return { cliente: null }
  const [cliente, subs, faturas, cobrancas] = await Promise.all([
    stripe(`customers/${cus}?expand[]=invoice_settings.default_payment_method`),
    stripe(`subscriptions?customer=${cus}&status=all&limit=5&expand[]=data.default_payment_method`),
    stripe(`invoices?customer=${cus}&limit=10`),
    stripe(`charges?customer=${cus}&limit=20&expand[]=data.refunds`),
  ])
  if (cliente?.deleted) return { cliente: null, apagado: true }
  // deno-lint-ignore no-explicit-any
  const lista: any[] = subs?.data ?? []
  const sub = lista.find((s) => s.id === ass?.stripe_subscription_id) ?? lista.find((s) => !['canceled', 'incomplete_expired'].includes(s.status)) ?? lista[0] ?? null
  return {
    cliente: { id: cus, email: cliente.email, criado: iso(cliente.created), cartao: cartaoDe(cliente.invoice_settings?.default_payment_method) },
    assinatura: sub ? {
      id: sub.id, status: sub.status, criada: iso(sub.created), fim_periodo: iso(fimDoPeriodo(sub)), teste_fim: iso(sub.trial_end),
      cancela_no_fim: Boolean(sub.cancel_at_period_end), cancela_em: iso(sub.cancel_at), cancelada_em: iso(sub.canceled_at),
      cartao: cartaoDe(sub.default_payment_method),
    } : null,
    // deno-lint-ignore no-explicit-any
    faturas: (faturas?.data ?? []).map((f: any) => ({
      id: f.id, numero: f.number, status: f.status, valor: f.amount_due, pago: f.amount_paid, moeda: f.currency, criada: iso(f.created),
      link: f.status === 'open' ? f.hosted_invoice_url : null, tentativas: f.attempt_count, proxima_tentativa: iso(f.next_payment_attempt),
    })),
    // deno-lint-ignore no-explicit-any
    cobrancas: (cobrancas?.data ?? []).map((c: any) => ({
      id: c.id, valor: c.amount, reembolsado: c.amount_refunded, moeda: c.currency, status: c.status, criada: iso(c.created),
      tipo: c.payment_method_details?.type ?? null, final: c.payment_method_details?.card?.last4 ?? null,
      bandeira: c.payment_method_details?.card?.brand ?? null, falha: c.failure_message, recibo: c.receipt_url, descricao: c.description,
      // deno-lint-ignore no-explicit-any
      reembolsos: (c.refunds?.data ?? []).map((r: any) => ({ id: r.id, valor: r.amount, moeda: r.currency, status: r.status, criado: iso(r.created), motivo: r.reason })),
    })),
  }
}

/**
 * Reembolsos recentes no Stripe (feitos pelo painel ou direto no Stripe), de cartão e de Pix, com a conta de cada um.
 * Lido na hora do Stripe: o que foi reembolsado lá aparece aqui sem precisar de mais nada.
 */
async function reembolsos(db: SupabaseClient) {
  const lista = await stripe('refunds?limit=50&expand[]=data.charge')
  // deno-lint-ignore no-explicit-any
  const itens: any[] = lista?.data ?? []
  const clientes = [...new Set(itens.map((r) => r.charge?.customer).filter((c): c is string => typeof c === 'string'))]
  const porCliente = new Map<string, string>()
  if (clientes.length) {
    const { data } = await db.from('assinaturas').select('user_id, stripe_customer_id').in('stripe_customer_id', clientes)
    for (const a of data ?? []) porCliente.set(a.stripe_customer_id, a.user_id)
  }
  const ids = [...new Set([...porCliente.values(), ...itens.map((r) => r.charge?.metadata?.supabase_user_id).filter(Boolean)])]
  const contas = new Map<string, { email: string | null; nome: string | null }>()
  if (ids.length) {
    const { data: perfis } = await db.from('perfis').select('user_id, nome').in('user_id', ids)
    await Promise.all(ids.map(async (id) => {
      const { data } = await db.auth.admin.getUserById(id)
      contas.set(id, { email: data.user?.email ?? null, nome: perfis?.find((x) => x.user_id === id)?.nome ?? null })
    }))
  }
  return itens.map((r) => {
    const userId = porCliente.get(r.charge?.customer) ?? r.charge?.metadata?.supabase_user_id ?? null
    return {
      id: r.id, valor: r.amount, moeda: r.currency, status: r.status, criado: iso(r.created), motivo: r.reason,
      cobranca: r.charge?.id ?? null, cobrado: r.charge?.amount ?? null, cobrado_em: iso(r.charge?.created),
      tipo: r.charge?.payment_method_details?.type ?? null, email_stripe: r.charge?.billing_details?.email ?? r.charge?.receipt_email ?? null,
      user_id: userId, email: userId ? contas.get(userId)?.email ?? null : null, nome: userId ? contas.get(userId)?.nome ?? null : null,
    }
  })
}

// ---------- Novidades (pop-up do OpusCash) ----------
const CORES_NOVIDADE = ['marca', 'verde', 'azul', 'violeta', 'amarelo', 'rosa']
const ONDE_NOVIDADE = ['todos', 'site', 'app']
const nomeCurto = (v: unknown) => (typeof v === 'string' && /^[a-z_]{1,30}$/.test(v) ? v : null)
const textoNosIdiomas = (v: unknown, max: number) => {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const r: Record<string, string> = { pt: texto(o.pt, max) }
  for (const l of ['en', 'es']) { const t = texto(o[l], max); if (t) r[l] = t }
  return r
}

/** Confere e limpa uma novidade vinda do painel: título curto, até 4 itens, ícone, cor, tela e onde aparece. */
function limparNovidade(v: unknown) {
  const n = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const titulo = textoNosIdiomas(n.titulo, 60)
  if (!titulo.pt) throw new Recusa('Escreva o título.')
  const itens = (Array.isArray(n.itens) ? n.itens : []).slice(0, 4).map((it) => {
    const i = (it && typeof it === 'object' ? it : {}) as Record<string, unknown>
    return { icone: nomeCurto(i.icone) ?? 'estrela', texto: textoNosIdiomas(i.texto, 40) }
  }).filter((it) => it.texto.pt)
  return {
    titulo, itens,
    icone: nomeCurto(n.icone) ?? 'estrela',
    cor: CORES_NOVIDADE.includes(n.cor as string) ? n.cor as string : 'marca',
    tela: nomeCurto(n.tela),
    onde: ONDE_NOVIDADE.includes(n.onde as string) ? n.onde as string : 'todos',
  }
}

const ACOES_STRIPE = ['cancelar_fim', 'desfazer_cancelamento', 'cancelar_agora', 'cobrar_de_novo', 'dias_gratis', 'reembolsar', 'link_cartao']

/** Ações no Stripe pedidas pelo painel. Todas exigem motivo e ficam no registro. */
async function acaoStripe(db: SupabaseClient, admin: Admin, p: Record<string, unknown>) {
  const id = uuid(p.id)
  const tipo = texto(p.tipo, 30)
  if (!ACOES_STRIPE.includes(tipo)) throw new Recusa('Ação do Stripe desconhecida.')
  const motivo = motivoObrigatorio(p.motivo)
  const u = await contaAlvo(db, id)
  const { data: ass } = await db.from('assinaturas').select('stripe_customer_id, stripe_subscription_id, status').eq('user_id', id).maybeSingle()
  const cus = ass?.stripe_customer_id
  if (!cus) throw new Recusa('Esta conta não tem cadastro no Stripe.')
  const sid = ass?.stripe_subscription_id as string | null
  const assinatura = () => {
    if (!sid) throw new Recusa('Esta conta não tem assinatura no cartão.')
    return sid
  }
  let resultado: Record<string, unknown> = { ok: true }
  let paraRegistro: Record<string, unknown> = {}

  switch (tipo) {
    case 'cancelar_fim':
    case 'desfazer_cancelamento':
      await stripe(`subscriptions/${assinatura()}`, 'POST', { cancel_at_period_end: tipo === 'cancelar_fim' ? 'true' : 'false' })
      break
    case 'cancelar_agora':
      await stripe(`subscriptions/${assinatura()}`, 'DELETE')
      break
    case 'cobrar_de_novo': {
      const fatura = texto(p.fatura, 80)
      if (!fatura.startsWith('in_')) throw new Recusa('Fatura inválida.')
      const f = await stripe(`invoices/${fatura}`)
      if (f.customer !== cus) throw new Recusa('Esta fatura não é desta conta.')
      try {
        const paga = await stripe(`invoices/${fatura}/pay`, 'POST', {})
        resultado = { status: paga.status }
      } catch (e) {
        // a tentativa conta mesmo quando o cartão recusa: fica no registro com o motivo da recusa
        await registrar(db, admin, 'stripe_cobrar_de_novo', { id, email: u.email }, motivo, null, { fatura, erro: (e as Error).message })
        if (sid) await sincronizarAssinatura(db, id, sid)
        throw e
      }
      paraRegistro = { fatura }
      break
    }
    case 'dias_gratis': {
      const dias = Number(p.dias)
      if (!Number.isInteger(dias) || dias < 1 || dias > 365) throw new Recusa('Número de dias inválido.')
      const sub = await stripe(`subscriptions/${assinatura()}`)
      if (!['active', 'trialing'].includes(sub.status)) throw new Recusa('Só dá para dar dias grátis numa assinatura em dia.')
      // a próxima cobrança anda N dias a partir de quando ela aconteceria (o período já pago não se perde)
      const base = Math.max(Math.floor(Date.now() / 1000), sub.trial_end ?? 0, fimDoPeriodo(sub) ?? 0)
      const novo = base + dias * 86_400
      await stripe(`subscriptions/${sid}`, 'POST', { trial_end: String(novo), proration_behavior: 'none' })
      resultado = { proxima_cobranca: iso(novo) }
      paraRegistro = { dias, proxima_cobranca: iso(novo) }
      break
    }
    case 'reembolsar': {
      const cobranca = texto(p.cobranca, 80)
      if (!/^(ch|py)_/.test(cobranca)) throw new Recusa('Cobrança inválida.')
      const c = await stripe(`charges/${cobranca}`)
      if (c.customer !== cus) throw new Recusa('Esta cobrança não é desta conta.')
      const r = await stripe('refunds', 'POST', { charge: cobranca })
      resultado = { status: r.status, valor: r.amount, moeda: r.currency }
      paraRegistro = { cobranca, valor: r.amount, moeda: r.currency, status: r.status }
      break
    }
    case 'link_cartao': {
      // portal do Stripe: a pessoa troca o cartão (e paga a fatura em aberto). O link vale por pouco tempo; não vai para o registro.
      const s = await stripe('billing_portal/sessions', 'POST', { customer: cus, return_url: SITE })
      resultado = { link: s.url }
      break
    }
  }

  if (sid && ['cancelar_fim', 'desfazer_cancelamento', 'cancelar_agora', 'cobrar_de_novo', 'dias_gratis'].includes(tipo)) {
    await sincronizarAssinatura(db, id, sid)
  }
  await registrar(db, admin, `stripe_${tipo}`, { id, email: u.email }, motivo, { status: ass?.status }, paraRegistro)
  return resultado
}

/** Erros do banco que são recusas (raise exception das funções adm_*) viram mensagem para o painel. */
const doBanco = (e: { message: string } | null) => {
  if (e) throw new Recusa(e.message.charAt(0).toUpperCase() + e.message.slice(1) + '.')
}

async function executar(acao: string, p: Record<string, unknown>, db: SupabaseClient, publico: SupabaseClient, admin: Admin) {
  switch (acao) {
    case 'resumo': {
      const { data, error } = await db.rpc('adm_resumo')
      doBanco(error)
      return data
    }
    case 'buscar': {
      const { data, error } = await db.rpc('adm_buscar', { p_termo: texto(p.termo, 120), p_limite: 100 })
      doBanco(error)
      return data
    }
    case 'ficha': {
      const id = uuid(p.id)
      const { data, error } = await db.rpc('adm_ficha', { p_user: id })
      doBanco(error)
      if (!data?.conta) throw new Recusa('Conta não encontrada.', 404)
      await registrar(db, admin, 'ver_ficha', { id, email: data.conta.email })
      // foto de perfil (migração 03 do painel; sem ela, a ficha segue com as iniciais)
      const [{ data: foto }, { data: presenca }] = await Promise.all([
        db.rpc('adm_foto', { p_user: id }),
        db.from('uso_presenca').select('visto_em, aberto, tela').eq('user_id', id).maybeSingle(),
      ])
      const online = Boolean(presenca?.aberto && Date.now() - new Date(presenca.visto_em).getTime() < 150_000)
      return { ...data, foto: typeof foto === 'string' ? foto : null, presenca: presenca ? { ...presenca, online } : null }
    }
    case 'uso': {
      // como a pessoa usa o app: presença, telas, tempo, tutorial e QUANTAS coisas cadastrou (nunca o conteúdo).
      // Só leitura; abrir a ficha já fica no registro.
      const { data, error } = await db.rpc('adm_uso', { p_user: uuid(p.id) })
      doBanco(error)
      return data
    }
    case 'online': {
      const { data, error } = await db.rpc('adm_online')
      doBanco(error)
      return data
    }
    case 'uso_geral': {
      const { data, error } = await db.rpc('adm_uso_geral')
      doBanco(error)
      return data
    }
    case 'reembolsos':
      return await reembolsos(db)
    case 'novidades': {
      const { data, error } = await db.rpc('adm_novidades')
      doBanco(error)
      return data
    }
    case 'novidade_salvar': {
      // cria ou edita (rascunho ou publicada). O que vai para o banco passa por limparNovidade.
      const dados = limparNovidade(p.novidade)
      const id = Number(p.id) || null
      const q = id
        ? db.from('novidades').update({ ...dados, atualizada_em: new Date().toISOString() }).eq('id', id).select('id').single()
        : db.from('novidades').insert(dados).select('id').single()
      const { data, error } = await q
      doBanco(error)
      if (!data) throw new Recusa('Novidade não encontrada.', 404)
      await registrar(db, admin, id ? 'novidade_editar' : 'novidade_criar', null, null, null, { id: data.id, titulo: dados.titulo.pt })
      return { id: data.id }
    }
    case 'novidade_publicar': {
      // publicar = aparece para todo mundo que já tinha conta, uma vez. Despublicar = some (quem já viu não vê de novo).
      const id = Number(p.id)
      if (!Number.isInteger(id) || id < 1) throw new Recusa('Novidade inválida.')
      const publicar = p.publicar !== false
      const { data, error } = await db.from('novidades')
        .update({ publicada_em: publicar ? new Date().toISOString() : null, atualizada_em: new Date().toISOString() })
        .eq('id', id).select('id, titulo').single()
      doBanco(error)
      if (!data) throw new Recusa('Novidade não encontrada.', 404)
      await registrar(db, admin, publicar ? 'novidade_publicar' : 'novidade_despublicar', null, null, null, { id, titulo: data.titulo?.pt })
      return { ok: true }
    }
    case 'novidade_apagar': {
      const id = Number(p.id)
      if (!Number.isInteger(id) || id < 1) throw new Recusa('Novidade inválida.')
      const { data, error } = await db.from('novidades').delete().eq('id', id).select('titulo').maybeSingle()
      doBanco(error)
      await registrar(db, admin, 'novidade_apagar', null, null, null, { id, titulo: data?.titulo?.pt })
      return { ok: true }
    }
    case 'acesso': {
      const pagamento = p.pagamento && typeof p.pagamento === 'object' ? p.pagamento as Record<string, unknown> : null
      const { data, error } = await db.rpc('adm_mudar_acesso', {
        p_admin: admin.id, p_alvo: uuid(p.id), p_acao: texto(p.tipo, 20), p_dias: Number.isInteger(p.dias) ? p.dias : null,
        p_ate: typeof p.ate === 'string' ? p.ate : null, p_motivo: motivoObrigatorio(p.motivo),
        p_pagamento: pagamento ? {
          valor: Math.round(Number(pagamento.valor)), forma: texto(pagamento.forma, 20) || 'pix',
          pago_em: texto(pagamento.pago_em, 10) || undefined, observacao: texto(pagamento.observacao) || undefined,
        } : null,
      })
      doBanco(error)
      return data
    }
    case 'anotar': {
      const id = uuid(p.id)
      const t = texto(p.texto, 2000)
      if (!t) throw new Recusa('Escreva a anotação.')
      const u = await contaAlvo(db, id)
      const { error } = await db.from('adm_anotacoes').insert({ user_id: id, texto: t, admin_id: admin.id })
      doBanco(error)
      await registrar(db, admin, 'anotar', { id, email: u.email }, null, null, { texto: t })
      return { ok: true }
    }
    case 'senha_email': {
      // manda o e-mail de "Crie uma senha nova" (o mesmo do "Esqueci minha senha" do site). O suporte nunca vê nem define a senha.
      const u = await contaAlvo(db, uuid(p.id))
      const { error } = await publico.auth.resetPasswordForEmail(u.email!, { redirectTo: SITE })
      if (error) throw new Recusa(/rate|limit/i.test(error.message)
        ? 'O limite de e-mails do Supabase foi atingido agora. Use "Gerar link" e mande pelo WhatsApp.' : error.message)
      await registrar(db, admin, 'senha_email', { id: u.id, email: u.email })
      return { ok: true }
    }
    case 'senha_link': {
      // gera o link de criar senha nova sem mandar e-mail, para o suporte entregar por outro canal (vale uma vez, expira)
      const u = await contaAlvo(db, uuid(p.id))
      const motivo = motivoObrigatorio(p.motivo)
      const { data, error } = await db.auth.admin.generateLink({ type: 'recovery', email: u.email!, options: { redirectTo: SITE } })
      if (error) throw new Recusa(error.message)
      await registrar(db, admin, 'senha_link', { id: u.id, email: u.email }, motivo)
      return { link: data.properties.action_link }
    }
    case 'reenviar_confirmacao': {
      const u = await contaAlvo(db, uuid(p.id))
      if (u.email_confirmed_at) throw new Recusa('O e-mail desta conta já está confirmado.')
      const { error } = await publico.auth.resend({ type: 'signup', email: u.email!, options: { emailRedirectTo: SITE } })
      if (error) throw new Recusa(error.message)
      await registrar(db, admin, 'reenviar_confirmacao', { id: u.id, email: u.email })
      return { ok: true }
    }
    case 'confirmar_email': {
      const u = await contaAlvo(db, uuid(p.id))
      const motivo = motivoObrigatorio(p.motivo)
      if (u.email_confirmed_at) throw new Recusa('O e-mail desta conta já está confirmado.')
      const { error } = await db.auth.admin.updateUserById(u.id, { email_confirm: true })
      if (error) throw new Recusa(error.message)
      await registrar(db, admin, 'confirmar_email', { id: u.id, email: u.email }, motivo)
      return { ok: true }
    }
    case 'trocar_email': {
      const u = await contaAlvo(db, uuid(p.id))
      const motivo = motivoObrigatorio(p.motivo)
      await naoEhAdmin(db, u.id)
      const novo = texto(p.email, 254).toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(novo)) throw new Recusa('E-mail novo inválido.')
      if (novo === u.email?.toLowerCase()) throw new Recusa('O e-mail novo é igual ao atual.')
      const { error } = await db.auth.admin.updateUserById(u.id, { email: novo, email_confirm: true })
      if (error) throw new Recusa(/already|exists|registered/i.test(error.message) ? 'Já existe uma conta com esse e-mail.' : error.message)
      await registrar(db, admin, 'trocar_email', { id: u.id, email: novo }, motivo, { email: u.email }, { email: novo })
      return { ok: true }
    }
    case 'bloquear':
    case 'desbloquear': {
      const u = await contaAlvo(db, uuid(p.id))
      const motivo = motivoObrigatorio(p.motivo)
      if (acao === 'bloquear') await naoEhAdmin(db, u.id)
      const { error } = await db.auth.admin.updateUserById(u.id, { ban_duration: acao === 'bloquear' ? '876000h' : 'none' })
      if (error) throw new Recusa(error.message)
      if (acao === 'bloquear') await db.rpc('adm_encerrar_sessoes', { p_user: u.id })
      await registrar(db, admin, acao, { id: u.id, email: u.email }, motivo)
      return { ok: true }
    }
    case 'encerrar_sessoes': {
      const u = await contaAlvo(db, uuid(p.id))
      const { data, error } = await db.rpc('adm_encerrar_sessoes', { p_user: u.id })
      doBanco(error)
      await registrar(db, admin, 'encerrar_sessoes', { id: u.id, email: u.email }, texto(p.motivo) || null, null, { sessoes: data })
      return { sessoes: data }
    }
    case 'excluir': {
      // igual ao "Excluir minha conta" do OpusCash: cancela a cobrança no Stripe e apaga o login e todos os dados. Não tem volta.
      const u = await contaAlvo(db, uuid(p.id))
      const motivo = motivoObrigatorio(p.motivo)
      await naoEhAdmin(db, u.id)
      if (texto(p.confirmar, 254).toLowerCase() !== (u.email ?? '').toLowerCase()) throw new Recusa('Digite o e-mail da conta para confirmar.')
      const { data: ass } = await db.from('assinaturas').select('*').eq('user_id', u.id).maybeSingle()
      if (ass?.stripe_subscription_id && ass.status !== 'cortesia' && !['canceled', 'incomplete_expired'].includes(ass.status)) {
        const r = await fetch(`https://api.stripe.com/v1/subscriptions/${ass.stripe_subscription_id}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}` },
        })
        if (!r.ok && r.status !== 404) {
          const j = await r.json().catch(() => null)
          throw new Recusa(`O Stripe não cancelou a assinatura: ${j?.error?.message ?? r.status}. Nada foi apagado.`, 502)
        }
      }
      const { error } = await db.auth.admin.deleteUser(u.id)
      if (error) throw new Recusa(error.message, 500)
      // o registro não tem chave para a conta: continua existindo depois de ela ser apagada, com o que ela tinha
      await registrar(db, admin, 'excluir', { id: u.id, email: u.email }, motivo, { assinatura: ass })
      return { ok: true }
    }
    case 'stripe':
      return await lerStripe(db, uuid(p.id))
    case 'stripe_acao':
      return await acaoStripe(db, admin, p)
    case 'erros': {
      const { data, error } = await db.rpc('adm_erros', { p_dias: Number(p.dias) || 30 })
      doBanco(error)
      return data
    }
    case 'erro_detalhe': {
      const mensagem = texto(p.mensagem, 500)
      const { data, error } = await db.from('erros_app').select('id, user_id, onde, detalhe, versao, criado_em')
        .eq('mensagem', mensagem).order('criado_em', { ascending: false }).limit(20)
      doBanco(error)
      return data
    }
    case 'erro_resolver': {
      const mensagem = texto(p.mensagem, 500)
      if (!mensagem) throw new Recusa('Erro inválido.')
      const { error } = p.resolvido === false
        ? await db.from('adm_erros_resolvidos').delete().eq('mensagem', mensagem)
        : await db.from('adm_erros_resolvidos').upsert({ mensagem, admin_id: admin.id, resolvido_em: new Date().toISOString() })
      doBanco(error)
      await registrar(db, admin, p.resolvido === false ? 'erro_reabrir' : 'erro_resolver', null, null, null, { mensagem })
      return { ok: true }
    }
    case 'registro': {
      let q = db.from('adm_registro').select('id, admin_email, acao, alvo_id, alvo_email, motivo, criado_em')
        .order('criado_em', { ascending: false }).limit(200)
      if (p.sem_leituras !== false) q = q.neq('acao', 'ver_ficha')
      const { data, error } = await q
      doBanco(error)
      return data
    }
    default:
      throw new Recusa('Ação desconhecida.')
  }
}

Deno.serve(async (req) => {
  const cab = { ...cors(req), 'Content-Type': 'application/json' }
  const responder = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: cab })
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return responder({ erro: 'Use POST.' }, 405)
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const publico = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } })

    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: { user } } = await db.auth.getUser(token)
    if (!user) return responder({ erro: 'Entre de novo.' }, 401)
    const { data: adm } = await db.from('adm_admins').select('email').eq('user_id', user.id).maybeSingle()
    const nivel = nivelDoLogin(token)

    const corpo = await req.json().catch(() => ({}))
    const acao = texto(corpo?.acao, 40)
    if (acao === 'eu') return responder({ admin: Boolean(adm), nivel, email: user.email })
    if (!adm) return responder({ erro: 'Esta conta não é de administrador.' }, 403)
    if (nivel !== 'aal2') return responder({ erro: 'Confirme o código do celular.', precisa_codigo: true }, 403)

    const resultado = await executar(acao, corpo ?? {}, db, publico, { id: user.id, email: adm.email })
    return responder({ ok: true, dados: resultado })
  } catch (e) {
    if (e instanceof Recusa) return responder({ erro: e.message }, e.status)
    console.error('[admin]', e)
    return responder({ erro: e instanceof Error ? e.message : 'Erro inesperado.' }, 500)
  }
})
