import assert from 'node:assert/strict'

const origem = 'https://supabase-de-teste.example'
const operador = { id: '10000000-0000-4000-8000-000000000001', email: 'suporte@example.com' }
const cliente = { id: '10000000-0000-4000-8000-000000000002', email: 'cliente@example.com' }
const segundoAdmin = { id: '10000000-0000-4000-8000-000000000003', email: 'admin@example.com' }
Deno.env.set('SUPABASE_URL', origem)
Deno.env.set('SUPABASE_ANON_KEY', 'publica-de-teste')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'servico-de-teste')

type Handler = (req: Request) => Promise<Response>
let atender: Handler | undefined
const serve = Object.getOwnPropertyDescriptor(Deno, 'serve')!
Object.defineProperty(Deno, 'serve', { configurable: true, value: (handler: Handler) => { atender = handler } })
try {
  await import('./index.ts')
} finally {
  Object.defineProperty(Deno, 'serve', serve)
}
assert.ok(atender)

function acao(acao: string, id = cliente.id, aal = 'aal2', usuario = operador) {
  const corpo = btoa(JSON.stringify({ sub: usuario.id, aal })).replace(/=+$/, '')
  return atender!(new Request('https://funcoes-de-teste.example/admin', {
    method: 'POST',
    headers: { Authorization: `Bearer eyJhbGciOiJIUzI1NiJ9.${corpo}.assinatura-de-teste` },
    body: JSON.stringify({ acao, id, email: 'outro@example.com' }),
  }))
}

function simularAuth({ usuario = operador, falhaAoVerificarAlvo = false } = {}) {
  const eventos: Array<{ tipo: string; corpo: unknown }> = []
  const fetchOriginal = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init)
    const url = new URL(req.url)
    assert.equal(url.origin, origem)
    if (url.pathname === '/auth/v1/user') return Response.json(usuario)
    if (url.pathname.startsWith('/auth/v1/admin/users/') && req.method === 'GET') {
      const alvo = [cliente, segundoAdmin].find((u) => url.pathname.endsWith(u.id))
      return alvo ? Response.json(alvo) : new Response(null, { status: 404 })
    }
    if (url.pathname === '/rest/v1/adm_admins') {
      const id = url.searchParams.get('user_id')?.slice(3)
      if (falhaAoVerificarAlvo && id !== operador.id) {
        return Response.json({ message: 'Falha simulada' }, { status: 500 })
      }
      const admin = [operador, segundoAdmin].find((u) => u.id === id)
      return Response.json(admin ? [{ ...admin, user_id: admin.id }] : [])
    }
    if (url.pathname === '/auth/v1/recover' || url.pathname === '/auth/v1/resend') {
      assert.equal(url.searchParams.get('redirect_to'), 'https://www.opuscash.com.br')
      eventos.push({ tipo: url.pathname.split('/').at(-1)!, corpo: await req.json() })
      return Response.json({})
    }
    if (url.pathname === '/rest/v1/adm_registro') {
      eventos.push({ tipo: 'auditoria', corpo: await req.json() })
      return Response.json([], { status: 201 })
    }
    eventos.push({ tipo: `inesperado: ${req.method} ${url.pathname}`, corpo: null })
    throw new Error('Operação fora da simulação')
  }
  return { eventos, restaurar: () => { globalThis.fetch = fetchOriginal } }
}

Deno.test('a API recusa todas as ações administrativas antigas de recuperação direta', async () => {
  const mock = simularAuth()
  try {
    for (const tipo of ['senha_link', 'confirmar_email', 'trocar_email']) {
      const resp = await acao(tipo)
      assert.equal(resp.status, 403, tipo)
      assert.deepEqual(Object.keys(await resp.json()), ['erro'])
    }
    assert.deepEqual(mock.eventos, [])
  } finally { mock.restaurar() }
})

Deno.test('recuperação e confirmação são enviadas ao e-mail cadastrado, com auditoria', async () => {
  const mock = simularAuth()
  try {
    for (const tipo of ['senha_email', 'reenviar_confirmacao']) {
      const resp = await acao(tipo)
      assert.equal(resp.status, 200)
      assert.deepEqual(await resp.json(), { ok: true, dados: { ok: true } })
    }
    assert.deepEqual(mock.eventos.map((e) => e.tipo), ['recover', 'auditoria', 'resend', 'auditoria'])
    for (const evento of mock.eventos) {
      const corpo = evento.corpo as { email?: string; alvo_email?: string }
      assert.equal(corpo.email ?? corpo.alvo_email, cliente.email)
    }
  } finally { mock.restaurar() }
})

Deno.test('recuperação exige MFA e bloqueia contas administrativas de destino', async () => {
  const mock = simularAuth()
  try {
    assert.equal((await acao('senha_email', cliente.id, 'aal1')).status, 403)
    for (const tipo of ['senha_email', 'reenviar_confirmacao']) {
      assert.equal((await acao(tipo, segundoAdmin.id)).status, 400)
    }
    assert.deepEqual(mock.eventos, [])
  } finally { mock.restaurar() }
})

Deno.test('uma falha ao verificar o destino interrompe a recuperação', async () => {
  const mock = simularAuth({ falhaAoVerificarAlvo: true })
  try {
    assert.equal((await acao('senha_email')).status, 503)
    assert.deepEqual(mock.eventos, [])
  } finally { mock.restaurar() }
})
