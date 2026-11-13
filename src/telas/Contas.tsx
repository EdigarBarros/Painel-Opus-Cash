import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import { useDados, useDemorou } from '../lib/dados'
import { corDoTom, fmtData, haQuanto, iniciais, nomeDaTela, situacao } from '../lib/formato'
import { estiloLente, useLente } from '../lib/useLente'
import { Icone } from '../pecas/Icone'
import { Segmentado } from '../pecas/Segmentado'
import { ErroNaTela, Etiqueta } from '../ui'

export interface ContaResumo {
  id: string; email: string; nome: string | null; criado_em: string; ultimo_acesso: string | null
  confirmado: boolean; bloqueado: boolean; status: string; teste_fim: string | null; periodo_fim: string | null
  /** migração 03 do painel: foto de perfil, se está com o app aberto agora e em qual tela */
  foto?: string | null; online?: boolean; visto_em?: string | null; tela?: string | null
}

const FILTROS = [
  { id: 'todos', nome: 'Todas', cor: 'var(--texto-2)' },
  { id: 'online', nome: 'Usando agora', cor: 'var(--entrada)' },
  { id: 'teste', nome: 'Em teste', cor: 'var(--indigo)' },
  { id: 'teste_vence', nome: 'Teste vence em 7 dias', cor: 'var(--caixa)' },
  { id: 'pagantes', nome: 'Cartão', cor: 'var(--entrada)' },
  { id: 'liberados', nome: 'Liberados por prazo', cor: 'var(--destaque)' },
  { id: 'vitalicio', nome: 'Vitalícios', cor: 'var(--violeta)' },
  { id: 'sem_acesso', nome: 'Sem acesso', cor: 'var(--cinza-grafico)' },
  { id: 'problemas', nome: 'Com problema', cor: 'var(--saida)' },
] as const
type Filtro = (typeof FILTROS)[number]['id']
type Ordem = 'novas' | 'acesso' | 'vence' | 'nome'
type Vista = 'lista' | 'cartoes'

const DIA = 86_400_000
const vale = (iso: string | null) => Boolean(iso && new Date(iso).getTime() > Date.now())
function passa(c: ContaResumo, f: Filtro) {
  const emTeste = c.status === 'teste' && vale(c.teste_fim)
  const liberado = c.status === 'pix' && vale(c.periodo_fim)
  switch (f) {
    case 'online': return Boolean(c.online)
    case 'teste': return emTeste
    case 'teste_vence': return emTeste && new Date(c.teste_fim!).getTime() < Date.now() + 7 * DIA
    case 'pagantes': return ['trialing', 'active', 'past_due'].includes(c.status)
    case 'liberados': return liberado
    case 'vitalicio': return c.status === 'cortesia'
    case 'sem_acesso': return !emTeste && !liberado && !['trialing', 'active', 'past_due', 'cortesia'].includes(c.status)
    case 'problemas': return c.bloqueado || !c.confirmado || ['past_due', 'unpaid', 'incomplete'].includes(c.status)
    default: return true
  }
}

/** Fim do acesso que acaba sozinho (teste ou prazo), para a barrinha de "faltam N dias". */
function fimDoAcesso(c: ContaResumo) {
  if (c.status === 'teste' && vale(c.teste_fim)) return c.teste_fim
  if (c.status === 'pix' && vale(c.periodo_fim)) return c.periodo_fim
  return null
}

/** Bolinha de presença: verde pulsando usando agora, verde entrou hoje, amarela na semana, apagada faz tempo. */
function presenca(iso: string | null, online?: boolean) {
  if (online) return 'agora'
  if (!iso) return 'nunca'
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000
  return h < 24 ? 'hoje' : h < 24 * 7 ? 'semana' : 'antes'
}

const diasAte = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / DIA))

function Prazo({ fim }: { fim: string }) {
  const dias = diasAte(fim)
  const pct = Math.min(100, (dias / 30) * 100)
  const cor = dias <= 2 ? 'var(--saida)' : dias <= 7 ? 'var(--divida)' : 'var(--destaque)'
  return (
    <span className="prazo" title={`Até ${fmtData(fim)}`}>
      <span className="prazo-barra"><i style={{ width: `${Math.max(4, pct)}%`, background: cor }} /></span>
      <small>{dias === 0 ? 'acaba hoje' : dias === 1 ? 'falta 1 dia' : `faltam ${dias} dias`}</small>
    </span>
  )
}

function LinhaConta({ c, i, vista }: { c: ContaResumo; i: number; vista: Vista }) {
  const s = situacao(c.status, c.teste_fim, c.periodo_fim)
  const fim = fimDoAcesso(c)
  const p = presenca(c.ultimo_acesso, c.online)
  return (
    <a href={`#/contas/${c.id}`} className={vista === 'lista' ? 'linha-conta' : 'cartao-conta'} style={{ '--c': corDoTom(s.tom), '--i': Math.min(i, 14) } as React.CSSProperties}>
      <span className="avatar-anel"><span className="avatar">{c.foto ? <img src={c.foto} alt="" loading="lazy" /> : iniciais(c.nome || c.email)}</span><i className={`presenca ${p}`} title={c.online ? `Usando agora${c.tela ? `: ${nomeDaTela(c.tela)}` : ''}` : `Último acesso: ${haQuanto(c.ultimo_acesso)}`} /></span>
      <span className="conta-ident">
        <span className="conta-titulo">{c.nome || c.email}</span>
        <span className="conta-sub">{c.nome ? c.email : `Chegou ${haQuanto(c.criado_em)}`}</span>
      </span>
      <span className="conta-situacao">
        <span className="etiquetas">
          <Etiqueta tom={s.tom}>{s.texto}</Etiqueta>
          {c.online && <Etiqueta tom="verde">Usando agora{c.tela ? ` · ${nomeDaTela(c.tela)}` : ''}</Etiqueta>}
          {c.bloqueado && <Etiqueta tom="vermelho">Bloqueada</Etiqueta>}
          {!c.confirmado && <Etiqueta tom="amarelo">E-mail não confirmado</Etiqueta>}
        </span>
        {fim && <Prazo fim={fim} />}
      </span>
      <span className="conta-datas">
        <span><Icone nome="calendario" tamanho={14} />{fmtData(c.criado_em)}</span>
        <span><Icone nome="relogio" tamanho={14} />{c.online ? 'agora' : haQuanto(c.ultimo_acesso)}</span>
      </span>
      <span className="conta-seta"><Icone nome="dir" tamanho={18} /></span>
    </a>
  )
}

export function Contas({ filtroInicial, buscaInicial }: { filtroInicial?: string | null; buscaInicial?: string | null }) {
  const [termo, setTermo] = useState(buscaInicial ?? '')
  const [buscado, setBuscado] = useState((buscaInicial ?? '').trim())
  const { dados, erro: falhou, buscando, chaveDosDados, recarregar } = useDados(`buscar:${buscado}`, () => api<ContaResumo[]>('buscar', { termo: buscado }), { manterAnterior: true })
  const contas = dados ?? null
  const erro = falhou && !dados ? falhou : null
  const demorou = useDemorou()
  const [filtro, setFiltro] = useState<Filtro>(FILTROS.some((f) => f.id === filtroInicial) ? filtroInicial as Filtro : 'todos')
  const [ordem, setOrdem] = useState<Ordem>('novas')
  const [vista, setVista] = useState<Vista>(() => { try { return localStorage.getItem('painel-vista-contas') === 'cartoes' ? 'cartoes' : 'lista' } catch { return 'lista' } })
  const campo = useRef<HTMLInputElement>(null)
  const refFiltros = useRef<HTMLDivElement>(null)
  const lente = useLente(refFiltros, 'button.ativo', `${filtro}|${contas?.length ?? 0}`)

  // quem está usando agora muda o tempo todo: a lista se atualiza sozinha a cada 30 segundos (com a aba do painel visível)
  useEffect(() => {
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') recarregar() }, 30_000)
    return () => window.clearInterval(t)
  }, [recarregar])
  // busca no servidor 300 ms depois de parar de digitar
  useEffect(() => {
    const t = window.setTimeout(() => setBuscado(termo.trim()), 300)
    return () => window.clearTimeout(t)
  }, [termo])
  // "/" leva para a busca, como nos sites de busca
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target as HTMLElement).closest('input, textarea, select')) { e.preventDefault(); campo.current?.focus() }
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [])

  const contagem = useMemo(() => Object.fromEntries(FILTROS.map((f) => [f.id, (contas ?? []).filter((c) => passa(c, f.id)).length])), [contas])
  const lista = useMemo(() => {
    const l = (contas ?? []).filter((c) => passa(c, filtro))
    const t = (iso: string | null) => (iso ? new Date(iso).getTime() : 0)
    switch (ordem) {
      case 'acesso': return [...l].sort((a, b) => t(b.ultimo_acesso) - t(a.ultimo_acesso))
      case 'vence': return [...l].sort((a, b) => (t(fimDoAcesso(a)) || Infinity) - (t(fimDoAcesso(b)) || Infinity))
      case 'nome': return [...l].sort((a, b) => (a.nome || a.email).localeCompare(b.nome || b.email, 'pt-BR'))
      default: return l
    }
  }, [contas, filtro, ordem])

  const mudarVista = (v: Vista) => {
    setVista(v)
    try { localStorage.setItem('painel-vista-contas', v) } catch { /* sem armazenamento */ }
  }

  return (
    <div className="pagina contas">
      <header className="pagina-topo">
        <div>
          <h1>Contas</h1>
          <p className="sub">Ache uma conta pelo e-mail ou nome e abra a ficha para ajudar a pessoa.</p>
        </div>
        <Segmentado rotulo="Como mostrar" valor={vista} aoMudar={(v) => mudarVista(v)}
          opcoes={[['lista', <><Icone nome="lista" tamanho={16} />Lista</>], ['cartoes', <><Icone nome="grade" tamanho={16} />Cartões</>]]} />
      </header>

      <div className="barra-busca">
        <label className="busca-grande">
          <Icone nome="busca" tamanho={20} />
          <input ref={campo} type="search" placeholder="Buscar por e-mail ou nome" value={termo} onChange={(e) => setTermo(e.target.value)}
            aria-label="Buscar por e-mail ou nome" autoFocus />
          {buscando ? <span className="giro" aria-hidden="true" /> : termo ? (
            <button type="button" className="limpar" onClick={() => { setTermo(''); campo.current?.focus() }} aria-label="Limpar busca"><Icone nome="fechar" tamanho={16} /></button>
          ) : <kbd>/</kbd>}
        </label>
      </div>

      <div className="filtros-faixa">
        <div ref={refFiltros} className="filtros" role="group" aria-label="Filtrar contas">
          {lente && <span className="filtro-lente" aria-hidden="true" style={estiloLente(lente)} />}
          {FILTROS.map((f) => (
            <button key={f.id} type="button" className={`filtro ${filtro === f.id ? 'ativo' : ''}`} aria-pressed={filtro === f.id}
              style={{ '--c': f.cor } as React.CSSProperties} onClick={() => setFiltro(f.id)}>
              {f.id !== 'todos' && <i className="marcador" />}{f.nome}
              {contas && <b>{contagem[f.id]}</b>}
            </button>
          ))}
        </div>
      </div>

      <div className="contas-barra">
        <p className="contagem">
          {contas ? <>{lista.length === 1 ? '1 conta' : `${lista.length} contas`}{buscado && <> para <b>"{buscado}"</b></>}</> : 'Carregando…'}
        </p>
        <label className="ordem">
          <Icone nome="trocar" tamanho={15} />
          <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} aria-label="Ordenar">
            <option value="novas">Mais novas primeiro</option>
            <option value="acesso">Último acesso</option>
            <option value="vence">Acesso que vence primeiro</option>
            <option value="nome">Nome (A a Z)</option>
          </select>
        </label>
      </div>

      {erro && <ErroNaTela erro={erro} />}
      {!erro && !contas && demorou && (
        <div className={`${vista === 'lista' ? 'lista-contas' : 'grade-contas'} esqueleto-lista`} aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="esqueleto" style={{ height: vista === 'lista' ? 72 : 190 }} />)}
        </div>
      )}
      {contas && lista.length === 0 && (
        <div className="vazio-grande">
          <span className="vazio-icone"><Icone nome="busca" tamanho={30} /></span>
          <strong>Nenhuma conta aqui</strong>
          <p>{buscado ? 'Confira o e-mail ou tente só um pedaço dele.' : 'Nenhuma conta neste filtro agora.'}</p>
          {filtro !== 'todos' && <button className="botao" onClick={() => setFiltro('todos')}>Ver todas</button>}
        </div>
      )}
      {contas && lista.length > 0 && (
        <div key={`${filtro}-${ordem}-${vista}-${chaveDosDados}`} className={vista === 'lista' ? 'lista-contas' : 'grade-contas'}>
          {lista.map((c, i) => <LinhaConta key={c.id} c={c} i={i} vista={vista} />)}
        </div>
      )}
      {contas && contas.length >= 100 && <p className="nota">Mostrando as 100 mais recentes. Busque pelo e-mail para achar outras.</p>}
    </div>
  )
}
