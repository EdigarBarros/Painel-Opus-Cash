import { useMemo, useState } from 'react'
import { api, mensagemDe } from '../lib/api'
import { useDados, useDemorou } from '../lib/dados'
import { fmtDataHora, haQuanto, inteiro } from '../lib/formato'
import { useAviso } from '../lib/useAviso'
import { GraficoArea } from '../pecas/Graficos'
import { Icone } from '../pecas/Icone'
import { Numero } from '../pecas/Numero'
import { Segmentado } from '../pecas/Segmentado'
import { ErroNaTela, Etiqueta } from '../ui'

interface GrupoDeErro {
  mensagem: string; vezes: number; pessoas: number; primeiro: string; ultimo: string
  versoes: string[] | null; onde: string[] | null; resolvido_em: string | null; voltou: boolean
}
interface Ocorrencia { id: number; user_id: string | null; onde: string | null; detalhe: string | null; versao: string | null; criado_em: string }
interface DiaDoResumo { dia: string; erros: number }

type Situacao = 'abertos' | 'resolvidos' | 'todos'
const PERIODOS: [number, string][] = [[7, '7 dias'], [30, '30 dias'], [90, '90 dias'], [365, '1 ano']]
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const diaCurto = (iso: string) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${MESES[m - 1]}` }
const resolvidoDe = (g: GrupoDeErro) => Boolean(g.resolvido_em) && !g.voltou

/** Erros que quebraram a tela de alguém (o OpusCash grava em erros_app), agrupados pela mensagem. */
export function Erros() {
  const [dias, setDias] = useState(30)
  const [situacao, setSituacao] = useState<Situacao>('abertos')
  const [termo, setTermo] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)
  const { dados, erro: falhou, recarregar: carregar } = useDados(`erros:${dias}`, () => api<GrupoDeErro[]>('erros', { dias }), { manterAnterior: true })
  // erros por dia: vêm do resumo da tela Início (os últimos 90 dias), que já fica guardado
  const { dados: resumo } = useDados('resumo', () => api<{ por_dia_90d?: DiaDoResumo[] }>('resumo'))
  const grupos = dados ?? null
  const erro = falhou && !dados ? falhou : null
  const demorou = useDemorou()
  const [toast, avisar] = useAviso()

  const marcar = async (mensagem: string, resolvido: boolean) => {
    try {
      await api('erro_resolver', { mensagem, resolvido })
      avisar(resolvido ? 'Marcado como resolvido.' : 'Reaberto.')
      carregar()
    } catch (e) {
      avisar(mensagemDe(e))
    }
  }

  const contas = useMemo(() => {
    const l = grupos ?? []
    return {
      abertos: l.filter((g) => !resolvidoDe(g)).length,
      resolvidos: l.filter(resolvidoDe).length,
      voltaram: l.filter((g) => g.voltou).length,
      vezes: l.reduce((s, g) => s + g.vezes, 0),
      maxVezes: Math.max(1, ...l.map((g) => g.vezes)),
    }
  }, [grupos])
  const lista = useMemo(() => {
    const t = termo.trim().toLowerCase()
    return (grupos ?? []).filter((g) => (situacao === 'todos' || (situacao === 'abertos') !== resolvidoDe(g))
      && (!t || g.mensagem.toLowerCase().includes(t) || (g.onde ?? []).some((o) => o.toLowerCase().includes(t))))
  }, [grupos, situacao, termo])
  const porDia = (resumo?.por_dia_90d ?? []).slice(-Math.min(dias, 90))

  return (
    <div className="pagina erros-pagina">
      <header className="pagina-topo">
        <div>
          <h1>Erros</h1>
          <p className="sub">O que quebrou na tela das pessoas, no site e no app. O mesmo erro aparece uma vez só, com quantas vezes aconteceu.</p>
        </div>
        <Segmentado rotulo="Período" valor={dias} aoMudar={(v) => setDias(v)} opcoes={PERIODOS} />
      </header>

      {erro && <ErroNaTela erro={erro} aoTentar={carregar} />}
      {!erro && !grupos && demorou && (
        <div className="esqueleto-lista" aria-busy="true">
          <div className="mini-kpis">{[0, 1, 2].map((i) => <div key={i} className="esqueleto" style={{ height: 96 }} />)}</div>
        </div>
      )}

      {grupos && (
        <>
          <div className="mini-kpis quatro">
            <div className="mini-kpi" style={{ '--c': contas.abertos ? 'var(--saida)' : 'var(--entrada)' } as React.CSSProperties}>
              <span><Icone nome={contas.abertos ? 'alerta' : 'check'} tamanho={15} />Abertos</span>
              <strong><Numero valor={contas.abertos} /></strong><small>{contas.abertos === 1 ? 'erro pede atenção' : 'erros pedem atenção'}</small>
            </div>
            <div className="mini-kpi" style={{ '--c': 'var(--divida)' } as React.CSSProperties}>
              <span><Icone nome="historico" tamanho={15} />Voltaram</span>
              <strong><Numero valor={contas.voltaram} /></strong><small>depois de resolvidos</small>
            </div>
            <div className="mini-kpi" style={{ '--c': 'var(--caixa)' } as React.CSSProperties}>
              <span><Icone nome="inseto" tamanho={15} />Vezes</span>
              <strong><Numero valor={contas.vezes} /></strong><small>no período, somando todos</small>
            </div>
            <div className="mini-kpi" style={{ '--c': 'var(--entrada)' } as React.CSSProperties}>
              <span><Icone nome="check" tamanho={15} />Resolvidos</span>
              <strong><Numero valor={contas.resolvidos} /></strong><small>e que não voltaram</small>
            </div>
          </div>

          {porDia.length > 0 && (
            <section className="cartao">
              <header className="cartao-topo">
                <h2><Icone nome="ano" tamanho={18} />Erros por dia</h2>
                <span className="dica-cab">{dias > 90 ? 'últimos 90 dias' : `últimos ${dias} dias`}</span>
              </header>
              <GraficoArea altura={200} rotulos={porDia.map((d) => d.dia)} formato={inteiro}
                serie={{ nome: 'Erros', cor: 'var(--saida)', valores: porDia.map((d) => d.erros) }}
                rotuloDoPonto={(i) => diaCurto(porDia[i].dia)} descricao="Quantos erros as pessoas encontraram por dia." />
            </section>
          )}

          <div className="erros-filtros">
            <Segmentado rotulo="Quais erros" valor={situacao} aoMudar={(v) => setSituacao(v)}
              opcoes={[['abertos', <>Abertos <b className="contador-seg">{contas.abertos}</b></>], ['resolvidos', <>Resolvidos <b className="contador-seg">{contas.resolvidos}</b></>], ['todos', 'Todos']]} />
            <label className="busca-media">
              <Icone nome="busca" tamanho={17} />
              <input type="search" value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Buscar na mensagem ou onde aconteceu" aria-label="Buscar erro" />
            </label>
          </div>

          {lista.length === 0 ? (
            <div className="vazio-grande">
              <span className="vazio-icone"><Icone nome={situacao === 'abertos' && !termo ? 'check' : 'busca'} tamanho={30} /></span>
              <strong>{situacao === 'abertos' && !termo ? 'Nenhum erro aberto' : 'Nada por aqui'}</strong>
              <p>{situacao === 'abertos' && !termo ? 'Ninguém encontrou erro novo neste período. Bom sinal.' : 'Tente outro período ou outra busca.'}</p>
            </div>
          ) : (
            <ul key={`${situacao}-${dias}`} className="lista-erros">
              {lista.map((g, i) => (
                <CartaoErro key={g.mensagem} g={g} i={i} maxVezes={contas.maxVezes} aberto={aberto === g.mensagem}
                  aoAbrir={() => setAberto(aberto === g.mensagem ? null : g.mensagem)} aoMarcar={marcar} avisar={avisar} />
              ))}
            </ul>
          )}
        </>
      )}
      {toast}
    </div>
  )
}

function CartaoErro({ g, i, maxVezes, aberto, aoAbrir, aoMarcar, avisar }: {
  g: GrupoDeErro; i: number; maxVezes: number; aberto: boolean; aoAbrir: () => void
  aoMarcar: (m: string, r: boolean) => void; avisar: (m: string) => void
}) {
  const resolvido = resolvidoDe(g)
  const cor = g.voltou ? 'var(--divida)' : resolvido ? 'var(--entrada)' : 'var(--saida)'
  return (
    <li className={`cartao-erro ${resolvido ? 'resolvido' : ''} ${aberto ? 'aberto' : ''}`} style={{ '--c': cor, '--i': Math.min(i, 12) } as React.CSSProperties}>
      <button type="button" className="erro-topo" aria-expanded={aberto} onClick={aoAbrir}>
        <span className="erro-icone"><Icone nome={resolvido ? 'check' : g.voltou ? 'historico' : 'inseto'} tamanho={20} /></span>
        <span className="erro-corpo">
          <span className="erro-mensagem">{g.mensagem}</span>
          <span className="erro-numeros">
            <span className="erro-vezes"><span className="erro-barra"><i style={{ width: `${Math.max(6, (g.vezes / maxVezes) * 100)}%` }} /></span>{g.vezes === 1 ? '1 vez' : `${g.vezes} vezes`}</span>
            <span><Icone nome="pessoas" tamanho={14} />{g.pessoas === 1 ? '1 pessoa' : `${g.pessoas} pessoas`}</span>
            <span><Icone nome="relogio" tamanho={14} />último {haQuanto(g.ultimo)}</span>
          </span>
          {(g.onde?.length || g.versoes?.length || resolvido || g.voltou) ? (
            <span className="etiquetas">
              {g.voltou && <Etiqueta tom="amarelo">Voltou depois de resolvido</Etiqueta>}
              {resolvido && <Etiqueta tom="verde">Resolvido {haQuanto(g.resolvido_em)}</Etiqueta>}
              {g.onde?.map((o) => <Etiqueta key={o} tom="azul">{o}</Etiqueta>)}
              {g.versoes?.map((v) => <Etiqueta key={v} tom="cinza">versão {v}</Etiqueta>)}
            </span>
          ) : null}
        </span>
        <span className="erro-seta"><Icone nome="abaixo" tamanho={18} /></span>
      </button>
      <div className="erro-gaveta"><div>{aberto && <DetalheDoErro grupo={g} resolvido={resolvido} aoMarcar={aoMarcar} avisar={avisar} />}</div></div>
    </li>
  )
}

function DetalheDoErro({ grupo, resolvido, aoMarcar, avisar }: { grupo: GrupoDeErro; resolvido: boolean; aoMarcar: (m: string, r: boolean) => void; avisar: (m: string) => void }) {
  const { dados: ocorrencias, erro } = useDados(`erro:${grupo.mensagem}`, () => api<Ocorrencia[]>('erro_detalhe', { mensagem: grupo.mensagem }))
  const [verPilha, setVerPilha] = useState<number | null>(null)
  const copiar = async (texto: string, msg: string) => { await navigator.clipboard.writeText(texto); avisar(msg) }
  return (
    <div className="erro-detalhe">
      <div className="erro-linha-tempo-cab">
        <span><b>Primeira vez</b>{fmtDataHora(grupo.primeiro)}</span>
        <span className="erro-trilho" aria-hidden="true"><i /></span>
        <span><b>Última vez</b>{fmtDataHora(grupo.ultimo)}</span>
      </div>
      <div className="acoes">
        {resolvido
          ? <button className="botao" onClick={() => aoMarcar(grupo.mensagem, false)}><Icone nome="historico" tamanho={16} />Reabrir</button>
          : <button className="botao principal" onClick={() => aoMarcar(grupo.mensagem, true)}><Icone nome="check" tamanho={16} />Marcar como resolvido</button>}
        <button className="botao" onClick={() => void copiar(grupo.mensagem, 'Mensagem copiada.')}><Icone nome="copiar" tamanho={16} />Copiar mensagem</button>
      </div>
      {erro && !ocorrencias && <p className="aviso-erro">{erro}</p>}
      {!ocorrencias && !erro && <div className="esqueleto" style={{ height: 120, marginTop: 14 }} />}
      {ocorrencias && (
        <>
          <h3>Últimas vezes</h3>
          <ol className="ocorrencias">
            {ocorrencias.map((o, i) => (
              <li key={o.id} style={{ '--i': Math.min(i, 10) } as React.CSSProperties}>
                <span className="ocorrencia-ponto" />
                <div className="ocorrencia-corpo">
                  <span className="ocorrencia-topo">
                    <b>{fmtDataHora(o.criado_em)}</b>
                    {o.onde && <span>{o.onde}</span>}
                    {o.versao && <span>versão {o.versao}</span>}
                    {o.user_id && <a href={`#/contas/${o.user_id}`}><Icone nome="pessoa" tamanho={13} />ver conta</a>}
                    {o.detalhe && (
                      <button type="button" className="link" onClick={() => setVerPilha(verPilha === o.id ? null : o.id)}>
                        {verPilha === o.id ? 'esconder detalhe' : 'ver detalhe técnico'}
                      </button>
                    )}
                  </span>
                  {o.detalhe && verPilha === o.id && (
                    <div className="pilha-caixa">
                      <button type="button" className="copiar" onClick={() => void copiar(o.detalhe!, 'Detalhe copiado.')}><Icone nome="copiar" tamanho={13} />Copiar</button>
                      <pre className="pilha">{o.detalhe}</pre>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}
