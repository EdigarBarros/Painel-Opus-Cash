import { useEffect, useMemo, useRef, useState } from 'react'
import { api, mensagemDe } from '../lib/api'
import { useDados, useDemorou } from '../lib/dados'
import { fmtData, fmtDataHora, haQuanto, iniciais, situacao } from '../lib/formato'
import { CATEGORIAS, type Categoria, type Contagem } from '../lib/suporte'
import { useAviso } from '../lib/useAviso'
import { estiloLente, useLente } from '../lib/useLente'
import { Icone } from '../pecas/Icone'
import { Numero } from '../pecas/Numero'
import { Segmentado } from '../pecas/Segmentado'
import { CampoMotivo, ErroNaTela, Etiqueta, FormularioDeAcao, Modal } from '../ui'

/*
 * Suporte: os pedidos de ajuda que as pessoas abrem no OpusCash (migração 31 do OpusCash, 04 do painel).
 * Lista à esquerda (filtros por situação e assunto, busca) e a conversa à direita, com a resposta e o "resolver".
 * Ler a conversa marca como lida pelo suporte e fica no registro; responder e mudar a situação também.
 */

type Filtro = 'aguardando' | 'respondido' | 'resolvido' | 'todos'

interface ItemLista {
  id: string; user_id: string; email: string | null; nome: string | null; categoria: Categoria; assunto: string
  status: 'aberto' | 'respondido' | 'resolvido'; tela: string | null; aparelho: string | null; versao: string | null
  criado_em: string; ultima_mensagem_em: string; ultima_mensagem_de: 'pessoa' | 'suporte'; nao_lido: boolean; mensagens: number; previa: string | null
}
interface Pedido {
  ticket: ItemLista & { idioma: string | null; resolvido_em: string | null }
  pessoa_viu_em: string
  conta: { id: string; email: string; nome: string | null; criado_em: string; status: string | null; teste_fim: string | null; periodo_fim: string | null } | null
  mensagens: { id: number; autor: 'pessoa' | 'suporte'; texto: string; criado_em: string; admin_email: string | null }[]
  outros: number
}

const SITUACAO = {
  aberto: { nome: 'Esperando o suporte', tom: 'amarelo' },
  respondido: { nome: 'Esperando a pessoa', tom: 'azul' },
  resolvido: { nome: 'Resolvido', tom: 'verde' },
} as const
const APARELHO: Record<string, string> = { site_computador: 'Site no computador', site_celular: 'Site no celular', app_android: 'App Android', site: 'Site' }
const TELAS: Record<string, string> = {
  inicio: 'Início', lancamentos: 'Lançamentos', analise: 'Consultor', invest: 'Invest', contas: 'Contas do mês', cartoes: 'Cartões',
  dividas: 'Dívidas', metas: 'Metas', patrimonio: 'Dinheiro guardado', ano: 'Resumo do ano', configuracoes: 'Configurações',
  importar: 'Importar extrato', categorias: 'Categorias', lancar: 'Lançar', editar_lancamento: 'Editar lançamento',
}

/** Começos de resposta para o que mais aparece. {nome} vira o primeiro nome da pessoa. */
const RESPOSTAS_PRONTAS: [string, string][] = [
  ['Recebemos e estamos vendo', 'Oi, {nome}! Recebemos seu pedido e já estamos vendo. Assim que tivermos novidade, respondemos por aqui.'],
  ['Pix liberado', 'Oi, {nome}! Confirmamos seu pagamento e o acesso já está liberado. Se o app ainda pedir a assinatura, feche e abra de novo.'],
  ['Pedir mais detalhes do erro', 'Oi, {nome}! Para achar o problema, pode contar o que você fez antes de ele aparecer e, se der, mandar um print da tela?'],
  ['Erro corrigido', 'Oi, {nome}! Achamos o problema e já corrigimos. Pode atualizar a página (ou fechar e abrir o app) e tentar de novo?'],
  ['Senha: link enviado', 'Oi, {nome}! Mandamos para o seu e-mail um link para criar uma senha nova. Confira também a caixa de spam.'],
  ['Obrigado pela sugestão', 'Oi, {nome}! Obrigado pela sugestão: anotamos aqui para as próximas versões do OpusCash.'],
]
const primeiroNome = (p: { nome: string | null; email: string | null }) =>
  (p.nome?.trim().split(/\s+/)[0] || p.email?.split('@')[0] || '').replace(/^\w/, (c) => c.toUpperCase())

function ItemDaLista({ t, ativo, i }: { t: ItemLista; ativo: boolean; i: number }) {
  const c = CATEGORIAS[t.categoria]
  return (
    <a href={`#/suporte/${t.id}`} className={`sp-item ${ativo ? 'ativo' : ''} ${t.nao_lido ? 'nao-lido' : ''}`}
      style={{ '--c': c.cor, '--i': Math.min(i, 12) } as React.CSSProperties}>
      <span className="sp-item-avatar"><span className="avatar">{iniciais(t.nome || t.email || '?')}</span><i className="sp-item-cat"><Icone nome={c.icone} tamanho={11} /></i></span>
      <span className="sp-item-corpo">
        <span className="sp-item-linha"><b>{t.nome || t.email}</b><small>{haQuanto(t.ultima_mensagem_em)}</small></span>
        <span className="sp-item-assunto">{t.assunto}</span>
        <span className="sp-item-previa">{t.ultima_mensagem_de === 'suporte' && <Icone nome="desfazer" tamanho={12} />}{t.previa}</span>
      </span>
      {t.nao_lido && <span className="sp-item-ponto" aria-label="Mensagem nova" />}
    </a>
  )
}

function Conversa({ id, aoMudar, avisar }: { id: string; aoMudar: () => void; avisar: (m: string) => void }) {
  const { dados: p, erro, recarregar } = useDados(`suporte-ticket:${id}`, () => api<Pedido>('suporte_ticket', { id }))
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erroEnvio, setErroEnvio] = useState<string | null>(null)
  const [mudarStatus, setMudarStatus] = useState<'resolvido' | 'aberto' | null>(null)
  const [prontas, setProntas] = useState(false)
  const fim = useRef<HTMLDivElement>(null)
  // a conversa se atualiza sozinha a cada 15 s (a pessoa pode estar respondendo agora)
  useEffect(() => {
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') recarregar() }, 15_000)
    return () => window.clearInterval(t)
  }, [recarregar])
  const total = p?.mensagens.length ?? 0
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }) }, [total, id])

  if (erro && !p) return <ErroNaTela erro={/adm_suporte|function|schema/i.test(erro) ? 'Falta rodar a migração 31 do OpusCash e a 04 do painel no Supabase.' : erro} aoTentar={recarregar} />
  if (!p) return <div className="esqueleto" style={{ height: 420 }} />
  const t = p.ticket
  const c = CATEGORIAS[t.categoria]
  const s = SITUACAO[t.status]
  const conta = p.conta
  const acesso = conta ? situacao(conta.status ?? 'sem_assinatura', conta.teste_fim, conta.periodo_fim) : null
  const ultimaDoSuporte = [...p.mensagens].reverse().find((m) => m.autor === 'suporte')
  const pessoaViu = ultimaDoSuporte && new Date(p.pessoa_viu_em).getTime() >= new Date(ultimaDoSuporte.criado_em).getTime()

  const responder = async (resolver: boolean) => {
    if (!texto.trim() || enviando) return
    setEnviando(true)
    setErroEnvio(null)
    try {
      await api('suporte_responder', { id, texto, resolver })
      setTexto('')
      avisar(resolver ? 'Resposta enviada e pedido resolvido.' : 'Resposta enviada.')
      recarregar()
      aoMudar()
    } catch (e) {
      setErroEnvio(mensagemDe(e))
    }
    setEnviando(false)
  }

  return (
    <section className="sp-conversa cartao" style={{ '--c': c.cor } as React.CSSProperties}>
      <header className="sp-conversa-topo">
        <a href="#/suporte" className="sp-voltar-celular"><Icone nome="esq" tamanho={16} />Pedidos</a>
        <div className="sp-conversa-titulo">
          <span className="sp-cat-icone"><Icone nome={c.icone} tamanho={20} /></span>
          <div>
            <h2>{t.assunto}</h2>
            <p>{c.nome} · aberto {haQuanto(t.criado_em)} ({fmtDataHora(t.criado_em)})</p>
          </div>
          <Etiqueta tom={s.tom}>{s.nome}</Etiqueta>
        </div>
        {conta && (
          <div className="sp-pessoa">
            <span className="avatar">{iniciais(conta.nome || conta.email)}</span>
            <span className="sp-pessoa-texto"><b>{conta.nome || conta.email}</b><small>{conta.nome ? conta.email : `conta criada em ${fmtData(conta.criado_em)}`}</small></span>
            {acesso && <Etiqueta tom={acesso.tom}>{acesso.texto}</Etiqueta>}
            <a className="botao pequeno" href={`#/contas/${conta.id}`}><Icone nome="pessoa" tamanho={15} />Abrir ficha</a>
          </div>
        )}
        <div className="sp-contexto">
          <span><Icone nome="grade" tamanho={13} />Tela: <b>{TELAS[t.tela ?? ''] ?? t.tela ?? '—'}</b></span>
          <span><Icone nome="pessoa" tamanho={13} /><b>{APARELHO[t.aparelho ?? ''] ?? t.aparelho ?? '—'}</b></span>
          <span><Icone nome="atualizar" tamanho={13} />Versão <b>{t.versao ?? '—'}</b></span>
          {t.idioma && <span><Icone nome="globo" tamanho={13} /><b>{t.idioma}</b></span>}
          {p.outros > 0 && <a href={`#/suporte?busca=${encodeURIComponent(conta?.email ?? '')}`}><Icone nome="historico" tamanho={13} />{p.outros === 1 ? '1 outro pedido' : `${p.outros} outros pedidos`}</a>}
        </div>
      </header>

      <div className="sp-mensagens">
        {p.mensagens.map((m, i) => (
          <div key={m.id} className={`sp-msg ${m.autor}`} style={{ '--i': Math.min(i, 10) } as React.CSSProperties}>
            {m.autor === 'pessoa' && <span className="avatar pequeno">{iniciais(conta?.nome || conta?.email || '?')}</span>}
            <div className="sp-balao">
              <p>{m.texto}</p>
              <small>{m.autor === 'suporte' ? (m.admin_email?.split('@')[0] ?? 'Suporte') : (conta?.nome || 'A pessoa')} · {haQuanto(m.criado_em)} · {fmtDataHora(m.criado_em).slice(-5)}</small>
            </div>
          </div>
        ))}
        {ultimaDoSuporte && (
          <p className={`sp-visto ${pessoaViu ? 'viu' : ''}`}><Icone nome={pessoaViu ? 'check' : 'relogio'} tamanho={13} />
            {pessoaViu ? `A pessoa viu a resposta ${haQuanto(p.pessoa_viu_em)}` : 'A pessoa ainda não abriu a resposta'}</p>
        )}
        <div ref={fim} />
      </div>

      <div className="sp-responder">
        <div className="sp-prontas">
          <button type="button" className="link" onClick={() => setProntas(!prontas)} aria-expanded={prontas}><Icone nome="lapis" tamanho={14} />Respostas prontas</button>
          {prontas && (
            <div className="sp-prontas-lista">
              {RESPOSTAS_PRONTAS.map(([nome, modelo]) => (
                <button key={nome} type="button" className="filtro" onClick={() => {
                  setTexto(modelo.replace('{nome}', conta ? primeiroNome(conta) : ''))
                  setProntas(false)
                }}>{nome}</button>
              ))}
            </div>
          )}
        </div>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={4000}
          placeholder={`Responder ${conta ? primeiroNome(conta) : 'a pessoa'}… (Ctrl+Enter manda)`} aria-label="Resposta"
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void responder(false) } }} />
        {erroEnvio && <p className="aviso-erro" role="alert">{erroEnvio}</p>}
        <div className="sp-responder-pe">
          <small>{texto.length ? `${texto.length}/4000 · a pessoa vê no app, no botão de suporte` : 'A pessoa vê a resposta no app, com um aviso no botão de suporte.'}</small>
          {t.status === 'resolvido'
            ? <button type="button" className="botao" onClick={() => setMudarStatus('aberto')}><Icone nome="historico" tamanho={16} />Reabrir</button>
            : <button type="button" className="botao" onClick={() => setMudarStatus('resolvido')}><Icone nome="check" tamanho={16} />Resolver sem responder</button>}
          <button type="button" className="botao" disabled={!texto.trim() || enviando} onClick={() => void responder(true)}><Icone nome="check" tamanho={16} />Responder e resolver</button>
          <button type="button" className="botao principal" disabled={!texto.trim() || enviando} onClick={() => void responder(false)}><Icone nome="enviar" tamanho={16} />{enviando ? 'Enviando…' : 'Responder'}</button>
        </div>
      </div>

      {mudarStatus && <MudarStatus id={id} status={mudarStatus} aoFechar={() => setMudarStatus(null)}
        aoTerminar={(m) => { setMudarStatus(null); if (m) avisar(m); recarregar(); aoMudar() }} />}
    </section>
  )
}

function MudarStatus({ id, status, aoFechar, aoTerminar }: { id: string; status: 'resolvido' | 'aberto'; aoFechar: () => void; aoTerminar: (m?: string) => void }) {
  const [motivo, setMotivo] = useState('')
  return (
    <Modal titulo={status === 'resolvido' ? 'Resolver sem responder' : 'Reabrir o pedido'} aoFechar={aoFechar}>
      <FormularioDeAcao textoBotao={status === 'resolvido' ? 'Marcar como resolvido' : 'Reabrir'} pode={motivo.trim().length > 0} aoTerminar={aoTerminar}
        executar={async () => { await api('suporte_status', { id, status, motivo }); return status === 'resolvido' ? 'Pedido resolvido.' : 'Pedido reaberto.' }}>
        <p>{status === 'resolvido'
          ? 'O pedido sai da fila sem mandar mensagem. A pessoa vê como resolvido e, se escrever de novo, ele reabre sozinho.'
          : 'O pedido volta para a fila de "Esperando o suporte".'}</p>
        <CampoMotivo valor={motivo} aoMudar={setMotivo} dica={status === 'resolvido' ? 'Ex.: resolvido pelo WhatsApp' : 'Ex.: ficou faltando responder'} />
      </FormularioDeAcao>
    </Modal>
  )
}

export function Suporte({ idAberto, buscaInicial }: { idAberto?: string; buscaInicial?: string | null }) {
  const [filtro, setFiltro] = useState<Filtro>('aguardando')
  const [categoria, setCategoria] = useState<Categoria | null>(null)
  const [termo, setTermo] = useState(buscaInicial ?? '')
  const [buscado, setBuscado] = useState((buscaInicial ?? '').trim())
  useEffect(() => {
    const t = window.setTimeout(() => setBuscado(termo.trim()), 300)
    return () => window.clearTimeout(t)
  }, [termo])
  // com busca, procura em todas as situações
  const filtroUsado = buscado ? 'todos' : filtro
  const chave = `suporte-lista:${filtroUsado}:${categoria ?? ''}:${buscado}`
  const { dados: lista, erro, recarregar } = useDados(chave, () => api<ItemLista[]>('suporte_lista', { filtro: filtroUsado, categoria, termo: buscado }), { manterAnterior: true })
  const { dados: cont, recarregar: recontar } = useDados('suporte-contagem', () => api<Contagem>('suporte_contagem'))
  const demorou = useDemorou()
  const [toast, avisar] = useAviso()
  const refCats = useRef<HTMLDivElement>(null)
  const lente = useLente(refCats, 'button.ativo', `${categoria}|${Boolean(cont)}`)
  // a fila se atualiza sozinha a cada 30 s
  useEffect(() => {
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') { recarregar(); recontar() } }, 30_000)
    return () => window.clearInterval(t)
  }, [recarregar, recontar])
  const mudou = () => { recarregar(); recontar(); window.dispatchEvent(new Event('suporte-mudou')) }
  const categorias = useMemo(() => Object.entries(CATEGORIAS) as [Categoria, (typeof CATEGORIAS)[Categoria]][], [])

  if (erro && !lista) {
    return <ErroNaTela erro={/adm_suporte|function|schema/i.test(erro) ? 'Falta rodar a migração 31 do OpusCash e a 04 do painel no Supabase.' : erro} aoTentar={recarregar} />
  }

  return (
    <div className={`pagina suporte-pagina ${idAberto ? 'com-conversa' : ''}`}>
      <header className="pagina-topo">
        <div>
          <h1>Suporte</h1>
          <p className="sub">Os pedidos de ajuda que as pessoas abrem no OpusCash. A resposta aparece no app, no botão de suporte.</p>
        </div>
      </header>

      <div className="mini-kpis quatro sp-numeros">
        <div className="mini-kpi" style={{ '--c': cont?.aguardando ? 'var(--divida)' : 'var(--entrada)' } as React.CSSProperties}>
          <span><Icone nome="relogio" tamanho={15} />Esperando o suporte</span><strong><Numero valor={cont?.aguardando ?? 0} /></strong>
          <small>{cont?.nao_lidos ? `${cont.nao_lidos} com mensagem nova` : 'nenhuma mensagem nova'}</small>
        </div>
        <div className="mini-kpi" style={{ '--c': 'var(--caixa)' } as React.CSSProperties}>
          <span><Icone nome="conversa" tamanho={15} />Esperando a pessoa</span><strong><Numero valor={cont?.respondido ?? 0} /></strong><small>já respondidos</small>
        </div>
        <div className="mini-kpi" style={{ '--c': 'var(--entrada)' } as React.CSSProperties}>
          <span><Icone nome="check" tamanho={15} />Resolvidos na semana</span><strong><Numero valor={cont?.resolvidos_7d ?? 0} /></strong><small>{cont ? `${cont.resolvido} no total` : ' '}</small>
        </div>
        <div className="mini-kpi" style={{ '--c': 'var(--violeta)' } as React.CSSProperties}>
          <span><Icone nome="ampulheta" tamanho={15} />Primeira resposta</span>
          <strong>{cont?.primeira_resposta_min == null ? '—' : cont.primeira_resposta_min < 60 ? `${cont.primeira_resposta_min} min` : `${Math.round(cont.primeira_resposta_min / 60)} h`}</strong>
          <small>tempo típico (30 dias)</small>
        </div>
      </div>

      <div className="sp-area">
        <aside className="sp-fila">
          <Segmentado largo rotulo="Situação" valor={filtroUsado} aoMudar={(v) => { setFiltro(v); setTermo('') }}
            opcoes={[['aguardando', <>Esperando nós{cont?.aguardando ? <b className="contador-seg">{cont.aguardando}</b> : null}</>], ['respondido', 'Esperando a pessoa'], ['resolvido', 'Resolvidos'], ['todos', 'Todos']]} />
          <label className="busca-media">
            <Icone nome="busca" tamanho={17} />
            <input type="search" value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="E-mail, nome ou assunto" aria-label="Buscar pedido" />
          </label>
          <div ref={refCats} className="filtros sp-cats" role="group" aria-label="Assunto">
            {lente && <span className="filtro-lente" aria-hidden="true" style={estiloLente(lente)} />}
            <button type="button" className={`filtro ${!categoria ? 'ativo' : ''}`} onClick={() => setCategoria(null)}>Todos os assuntos</button>
            {categorias.map(([id, c]) => (
              <button key={id} type="button" className={`filtro ${categoria === id ? 'ativo' : ''}`} style={{ '--c': c.cor } as React.CSSProperties}
                onClick={() => setCategoria(categoria === id ? null : id)}>
                <i className="marcador" />{c.nome}{cont?.categorias?.[id] ? <b>{cont.categorias[id]}</b> : null}
              </button>
            ))}
          </div>
          {!lista && demorou && <div className="esqueleto" style={{ height: 300 }} />}
          {lista && lista.length === 0 && (
            <div className="vazio-grande pequeno">
              <span className="vazio-icone"><Icone nome={filtroUsado === 'aguardando' && !buscado ? 'check' : 'busca'} tamanho={26} /></span>
              <strong>{filtroUsado === 'aguardando' && !buscado ? 'Ninguém esperando' : 'Nenhum pedido aqui'}</strong>
              <p>{filtroUsado === 'aguardando' && !buscado ? 'Todos os pedidos foram respondidos.' : 'Tente outra situação, assunto ou busca.'}</p>
            </div>
          )}
          {lista && lista.length > 0 && (
            <nav key={chave} className="sp-lista" aria-label="Pedidos">
              {lista.map((t, i) => <ItemDaLista key={t.id} t={t} ativo={t.id === idAberto} i={i} />)}
            </nav>
          )}
        </aside>
        <div className="sp-lado">
          {idAberto
            ? <Conversa key={idAberto} id={idAberto} aoMudar={mudou} avisar={avisar} />
            : (
              <div className="sp-escolha cartao">
                <span className="vazio-icone"><Icone nome="conversa" tamanho={30} /></span>
                <strong>Escolha um pedido</strong>
                <p>A conversa aparece aqui. Os pedidos esperando resposta ficam no topo da lista, os com mensagem nova têm um ponto verde.</p>
              </div>
            )}
        </div>
      </div>
      {toast}
    </div>
  )
}
