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

function acao(acao: string, id = cliente.id, aal = 'aal2', usuario = operador, campos: Record<string, unknown> = {}, amr?: unknown) {
  const corpo = btoa(JSON.stringify({ sub: usuario.id, aal, ...(amr ? { amr } : {}) })).replace(/=+$/, '')
  return atender!(new Request('https://funcoes-de-teste.example/admin', {
    method: 'POST',
    headers: { Authorization: `Bearer eyJhbGciOiJIUzI1NiJ9.${corpo}.assinatura-de-teste` },
    body: JSON.stringify({ acao, id, email: 'outro@example.com', ...campos }),
  }))
}

function simularAuth({ usuario = operador, falhaAoVerificarAlvo = false, falhaNoRegistro = false } = {}) {
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
    if (url.pathname === `/auth/v1/admin/users/${cliente.id}` && req.method === 'PUT') {
      eventos.push({ tipo: 'bloqueio', corpo: await req.json() })
      return Response.json(cliente)
    }
    if (url.pathname === '/rest/v1/rpc/adm_encerrar_sessoes') {
      eventos.push({ tipo: 'encerrar_sessoes', corpo: await req.json() })
      return Response.json(1)
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
      if (falhaNoRegistro) return Response.json({ message: 'Auditoria indisponível na simulação' }, { status: 500 })
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

Deno.test('bloqueio exige registro inicial e vincula a conclusão à tentativa', async () => {
  const mock = simularAuth()
  try {
    const resp = await acao('bloquear', cliente.id, 'aal2', operador, { motivo: 'Verificação local' })
    assert.equal(resp.status, 200)
    assert.deepEqual(mock.eventos.map((e) => e.tipo), ['auditoria', 'bloqueio', 'encerrar_sessoes', 'auditoria'])
    const inicio = mock.eventos[0].corpo as { acao: string; depois: { tentativa: string } }
    const fim = mock.eventos[3].corpo as typeof inicio
    assert.equal(inicio.acao, 'acao_iniciada')
    assert.equal(fim.acao, 'bloquear')
    assert.ok(inicio.depois.tentativa)
    assert.equal(fim.depois.tentativa, inicio.depois.tentativa)
  } finally { mock.restaurar() }
})

Deno.test('a falha no registro inicial impede o bloqueio', async () => {
  const mock = simularAuth({ falhaNoRegistro: true })
  try {
    const resp = await acao('bloquear', cliente.id, 'aal2', operador, { motivo: 'Verificação local' })
    assert.equal(resp.status, 500)
    assert.deepEqual(mock.eventos.map((e) => e.tipo), ['auditoria'])
  } finally { mock.restaurar() }
})

Deno.test('senha digitada há mais de 7 dias pede o login de novo', async () => {
  const mock = simularAuth()
  try {
    const agora = Math.floor(Date.now() / 1000)
    const velha = await acao('eu', cliente.id, 'aal2', operador, {}, [{ method: 'totp', timestamp: agora }, { method: 'password', timestamp: agora - 8 * 86400 }])
    assert.equal(velha.status, 401)
    const nova = await acao('eu', cliente.id, 'aal2', operador, {}, [{ method: 'totp', timestamp: agora }, { method: 'password', timestamp: agora - 6 * 86400 }])
    assert.equal(nova.status, 200)
  } finally { mock.restaurar() }
})
