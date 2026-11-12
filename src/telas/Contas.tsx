import { useEffect, useMemo, useState } from 'react'
import { api, mensagemDe } from '../lib/api'
import { fmtData, haQuanto, situacao } from '../lib/formato'
import { Carregando, ErroNaTela, Etiqueta } from '../ui'

export interface ContaResumo {
  id: string; email: string; nome: string | null; criado_em: string; ultimo_acesso: string | null
  confirmado: boolean; bloqueado: boolean; status: string; teste_fim: string | null; periodo_fim: string | null
}

const FILTROS = [
  { id: 'todos', nome: 'Todas' },
  { id: 'teste', nome: 'Em teste' },
  { id: 'teste_vence', nome: 'Teste vence em 7 dias' },
  { id: 'pagantes', nome: 'Cartão' },
  { id: 'liberados', nome: 'Liberados por prazo' },
  { id: 'vitalicio', nome: 'Vitalícios' },
  { id: 'sem_acesso', nome: 'Sem acesso' },
  { id: 'problemas', nome: 'Com problema' },
] as const
type Filtro = (typeof FILTROS)[number]['id']

const vale = (iso: string | null, dias = 0) => Boolean(iso && new Date(iso).getTime() > Date.now() - dias)
function passa(c: ContaResumo, f: Filtro) {
  const emTeste = c.status === 'teste' && vale(c.teste_fim)
  const liberado = c.status === 'pix' && vale(c.periodo_fim)
  switch (f) {
    case 'teste': return emTeste
    case 'teste_vence': return emTeste && new Date(c.teste_fim!).getTime() < Date.now() + 7 * 86_400_000
    case 'pagantes': return ['trialing', 'active', 'past_due'].includes(c.status)
    case 'liberados': return liberado
    case 'vitalicio': return c.status === 'cortesia'
    case 'sem_acesso': return !emTeste && !liberado && !['trialing', 'active', 'past_due', 'cortesia'].includes(c.status)
    case 'problemas': return c.bloqueado || !c.confirmado || ['past_due', 'unpaid', 'incomplete'].includes(c.status)
    default: return true
  }
}

export function Contas({ filtroInicial }: { filtroInicial?: string | null }) {
  const [termo, setTermo] = useState('')
  const [buscado, setBuscado] = useState('')
  const [contas, setContas] = useState<ContaResumo[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>(FILTROS.some((f) => f.id === filtroInicial) ? filtroInicial as Filtro : 'todos')

  // busca no servidor 300 ms depois de parar de digitar
  useEffect(() => {
    const t = window.setTimeout(() => setBuscado(termo.trim()), 300)
    return () => window.clearTimeout(t)
  }, [termo])
  useEffect(() => {
    let cancelado = false
    api<ContaResumo[]>('buscar', { termo: buscado })
      .then((d) => { if (!cancelado) { setContas(d); setErro(null) } })
      .catch((e) => { if (!cancelado) setErro(mensagemDe(e)) })
    return () => { cancelado = true }
  }, [buscado])

  const lista = useMemo(() => (contas ?? []).filter((c) => passa(c, filtro)), [contas, filtro])

  return (
    <div className="pagina">
      <h1>Contas</h1>
      <div className="busca">
        <input type="search" placeholder="Buscar por e-mail ou nome" value={termo} onChange={(e) => setTermo(e.target.value)}
          aria-label="Buscar por e-mail ou nome" autoFocus />
      </div>
      <div className="filtros" role="group" aria-label="Filtrar contas">
        {FILTROS.map((f) => (
          <button key={f.id} type="button" className={`filtro ${filtro === f.id ? 'ativo' : ''}`} aria-pressed={filtro === f.id}
            onClick={() => setFiltro(f.id)}>{f.nome}</button>
        ))}
      </div>
      {erro && <ErroNaTela erro={erro} />}
      {!erro && !contas && <Carregando />}
      {contas && (
        <>
          <p className="contagem">{lista.length === 1 ? '1 conta' : `${lista.length} contas`}{buscado && ` para "${buscado}"`}</p>
          {lista.length === 0
            ? <p className="vazio">Nenhuma conta aqui.</p>
            : (
              <div className="tabela-rolagem">
                <table className="tabela">
                  <thead>
                    <tr><th>Conta</th><th>Situação</th><th>Cadastro</th><th>Último acesso</th></tr>
                  </thead>
                  <tbody>
                    {lista.map((c) => {
                      const s = situacao(c.status, c.teste_fim, c.periodo_fim)
                      return (
                        <tr key={c.id} onClick={() => { location.hash = `#/contas/${c.id}` }}>
                          <td>
                            <a href={`#/contas/${c.id}`} className="conta-link">{c.email}</a>
                            {c.nome && <span className="conta-nome">{c.nome}</span>}
                          </td>
                          <td>
                            <Etiqueta tom={s.tom}>{s.texto}</Etiqueta>
                            {c.bloqueado && <Etiqueta tom="vermelho">Bloqueada</Etiqueta>}
                            {!c.confirmado && <Etiqueta tom="amarelo">E-mail não confirmado</Etiqueta>}
                          </td>
                          <td>{fmtData(c.criado_em)}</td>
                          <td>{haQuanto(c.ultimo_acesso)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          {contas.length >= 100 && <p className="nota">Mostrando as 100 mais recentes. Busque pelo e-mail para achar outras.</p>}
        </>
      )}
    </div>
  )
}
