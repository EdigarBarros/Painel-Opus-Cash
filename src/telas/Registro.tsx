import { useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import { useDados, useDemorou } from '../lib/dados'
import { estiloLente, useLente } from '../lib/useLente'
import { fmtDataHora, ICONE_DA_ACAO, iniciais, inteiro, NOME_DA_ACAO } from '../lib/formato'
import { GraficoBarras } from '../pecas/Graficos'
import { Icone } from '../pecas/Icone'
import { Numero } from '../pecas/Numero'
import { Segmentado } from '../pecas/Segmentado'
import { ErroNaTela } from '../ui'

interface Linha { id: number; admin_email: string; acao: string; alvo_id: string | null; alvo_email: string | null; motivo: string | null; criado_em: string }

/** Tipos de ação, com a cor e o nome do filtro. */
const TIPOS = {
  acesso: { nome: 'Acesso', cor: 'var(--entrada)' },
  login: { nome: 'Login e senha', cor: 'var(--caixa)' },
  stripe: { nome: 'Stripe', cor: 'var(--violeta)' },
  anotacao: { nome: 'Anotações', cor: 'var(--divida)' },
  erros: { nome: 'Erros', cor: 'var(--indigo)' },
  conta: { nome: 'Contas e equipe', cor: 'var(--saida)' },
  leitura: { nome: 'Fichas abertas', cor: 'var(--cinza-grafico)' },
} as const
type Tipo = keyof typeof TIPOS

function tipoDe(acao: string): Tipo {
  if (acao.startsWith('acesso_')) return 'acesso'
  if (acao.startsWith('stripe_')) return 'stripe'
  if (acao.startsWith('erro_')) return 'erros'
  if (acao === 'anotar') return 'anotacao'
  if (acao === 'ver_ficha') return 'leitura'
  if (acao === 'excluir' || acao === 'incluir_admin') return 'conta'
  return 'login'
}

const DIA = 86_400_000
const diaDe = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const fmtDia = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** "Hoje", "Ontem" ou "quinta-feira, 12 de novembro". */
function nomeDoDia(chave: string, hoje: string, ontem: string) {
  if (chave === hoje) return 'Hoje'
  if (chave === ontem) return 'Ontem'
  const t = fmtDia.format(new Date(`${chave}T12:00:00`))
  return t[0].toUpperCase() + t.slice(1)
}

/** Tudo o que o suporte fez, do mais novo para o mais velho. Ninguém apaga daqui. */
export function Registro() {
  const [comLeituras, setComLeituras] = useState(false)
  const [tipo, setTipo] = useState<Tipo | 'todos'>('todos')
  const [termo, setTermo] = useState('')
  const { dados, erro: falhou, recarregar: carregar, em } = useDados(comLeituras ? 'registro:com-leituras' : 'registro:sem-leituras',
    () => api<Linha[]>('registro', { sem_leituras: !comLeituras }), { manterAnterior: true })
  const linhas = dados ?? null
  const erro = falhou && !dados ? falhou : null
  const demorou = useDemorou()
  const refFiltros = useRef<HTMLDivElement>(null)
  const lente = useLente(refFiltros, 'button.ativo', `${tipo}|${linhas?.length ?? 0}|${comLeituras}`)

  // "agora" é a hora em que os dados chegaram: as contas de hoje/semana ficam estáveis entre um desenho e outro
  const agora = em ?? 0
  const hoje = diaDe(new Date(agora).toISOString())
  const ontem = diaDe(new Date(agora - DIA).toISOString())

  const numeros = useMemo(() => {
    const l = linhas ?? []
    const semana = l.filter((x) => new Date(x.criado_em).getTime() > agora - 7 * DIA)
    return {
      hoje: l.filter((x) => diaDe(x.criado_em) === hoje).length,
      semana: semana.length,
      equipe: new Set(semana.map((x) => x.admin_email)).size,
      contas: new Set(semana.filter((x) => x.alvo_id).map((x) => x.alvo_id)).size,
    }
  }, [linhas, agora, hoje])

  // ações por dia nos últimos 14 dias, empilhadas por tipo
  const grafico = useMemo(() => {
    const dias = Array.from({ length: 14 }, (_, i) => diaDe(new Date(agora - (13 - i) * DIA).toISOString()))
    const tipos = (Object.keys(TIPOS) as Tipo[]).filter((t) => (linhas ?? []).some((x) => tipoDe(x.acao) === t))
    const series = tipos.map((t) => ({
      nome: TIPOS[t].nome, cor: TIPOS[t].cor,
      valores: dias.map((d) => (linhas ?? []).filter((x) => tipoDe(x.acao) === t && diaDe(x.criado_em) === d).length),
    }))
    return { dias, series }
  }, [linhas, agora])

  const filtradas = useMemo(() => {
    const t = termo.trim().toLowerCase()
    return (linhas ?? []).filter((x) => (tipo === 'todos' || tipoDe(x.acao) === tipo)
      && (!t || [x.alvo_email, x.admin_email, x.motivo, NOME_DA_ACAO[x.acao]].some((v) => v?.toLowerCase().includes(t))))
  }, [linhas, tipo, termo])
  const porDia = useMemo(() => {
    const grupos: { dia: string; itens: Linha[] }[] = []
    for (const x of filtradas) {
      const d = diaDe(x.criado_em)
      if (grupos.at(-1)?.dia === d) grupos.at(-1)!.itens.push(x)
      else grupos.push({ dia: d, itens: [x] })
    }
    return grupos
  }, [filtradas])
  const tiposPresentes = (Object.keys(TIPOS) as Tipo[]).filter((t) => (linhas ?? []).some((x) => tipoDe(x.acao) === t))

  return (
    <div className="pagina registro-pagina">
      <header className="pagina-topo">
        <div>
          <h1>Registro do suporte</h1>
          <p className="sub">Cada ação feita pelo painel fica aqui, com quem fez e o motivo. Não dá para apagar.</p>
        </div>
        <Segmentado rotulo="O que mostrar" valor={comLeituras ? 'com' : 'sem'} aoMudar={(v) => setComLeituras(v === 'com')}
          opcoes={[['sem', 'Só ações'], ['com', 'Ações e fichas abertas']]} />
      </header>

      {erro && <ErroNaTela erro={erro} aoTentar={carregar} />}
      {!erro && !linhas && demorou && (
        <div className="esqueleto-lista" aria-busy="true">
          <div className="mini-kpis quatro">{[0, 1, 2, 3].map((i) => <div key={i} className="esqueleto" style={{ height: 96 }} />)}</div>
        </div>
      )}

      {linhas && (
        <>
          <div className="mini-kpis quatro">
            <div className="mini-kpi" style={{ '--c': 'var(--destaque)' } as React.CSSProperties}>
              <span><Icone nome="calendario" tamanho={15} />Hoje</span><strong><Numero valor={numeros.hoje} /></strong><small>{numeros.hoje === 1 ? 'ação' : 'ações'}</small>
            </div>
            <div className="mini-kpi" style={{ '--c': 'var(--caixa)' } as React.CSSProperties}>
              <span><Icone nome="historico" tamanho={15} />Na semana</span><strong><Numero valor={numeros.semana} /></strong><small>nos últimos 7 dias</small>
            </div>
            <div className="mini-kpi" style={{ '--c': 'var(--violeta)' } as React.CSSProperties}>
              <span><Icone nome="escudo" tamanho={15} />Equipe</span><strong><Numero valor={numeros.equipe} /></strong><small>{numeros.equipe === 1 ? 'pessoa atendeu na semana' : 'pessoas atenderam na semana'}</small>
            </div>
            <div className="mini-kpi" style={{ '--c': 'var(--entrada)' } as React.CSSProperties}>
              <span><Icone nome="pessoas" tamanho={15} />Contas</span><strong><Numero valor={numeros.contas} /></strong><small>atendidas na semana</small>
            </div>
          </div>

          {grafico.series.length > 0 && (
            <section className="cartao">
              <header className="cartao-topo">
                <h2><Icone nome="ano" tamanho={18} />Ações por dia</h2>
                <span className="dica-cab">últimos 14 dias</span>
              </header>
              <GraficoBarras altura={190} rotulos={grafico.dias} formato={inteiro} series={grafico.series}
                rotuloDoPonto={(i) => { const [, m, d] = grafico.dias[i].split('-').map(Number); return `${d} ${MESES[m - 1]}` }}
                tituloDoPonto={(i) => nomeDoDia(grafico.dias[i], hoje, ontem)}
                descricao="Quantas ações o suporte fez por dia nos últimos 14 dias, separadas por tipo." />
              <p className="legenda-linha">
                {grafico.series.map((s) => <span key={s.nome}><i style={{ background: s.cor }} />{s.nome}</span>)}
              </p>
            </section>
          )}

          <div className="registro-filtros">
            <label className="busca-media">
              <Icone nome="busca" tamanho={17} />
              <input type="search" value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Buscar por conta, quem fez ou motivo" aria-label="Buscar no registro" />
            </label>
            <div ref={refFiltros} className="filtros" role="group" aria-label="Tipo de ação">
              {lente && <span className="filtro-lente" aria-hidden="true" style={estiloLente(lente)} />}
              <button type="button" className={`filtro ${tipo === 'todos' ? 'ativo' : ''}`} aria-pressed={tipo === 'todos'} onClick={() => setTipo('todos')}>Todas</button>
              {tiposPresentes.map((t) => (
                <button key={t} type="button" className={`filtro ${tipo === t ? 'ativo' : ''}`} aria-pressed={tipo === t}
                  style={{ '--c': TIPOS[t].cor } as React.CSSProperties} onClick={() => setTipo(t)}>
                  <i className="marcador" />{TIPOS[t].nome}
                </button>
              ))}
            </div>
          </div>

          {porDia.length === 0 ? (
            <div className="vazio-grande">
              <span className="vazio-icone"><Icone nome="historico" tamanho={30} /></span>
              <strong>{linhas.length === 0 ? 'Nada registrado ainda' : 'Nada encontrado'}</strong>
              <p>{linhas.length === 0 ? 'As ações feitas pelo painel aparecem aqui.' : 'Tente outro filtro ou outra busca.'}</p>
            </div>
          ) : (
            <div key={`${tipo}-${comLeituras}`} className="registro-dias">
              {porDia.map((g, gi) => (
                <section key={g.dia} className="registro-dia" style={{ '--i': Math.min(gi, 8) } as React.CSSProperties}>
                  <h2 className="registro-dia-nome">{nomeDoDia(g.dia, hoje, ontem)}<span>{g.itens.length === 1 ? '1 ação' : `${g.itens.length} ações`}</span></h2>
                  <ol className="registro-lista">
                    {g.itens.map((x) => {
                      const t = tipoDe(x.acao)
                      return (
                        <li key={x.id} style={{ '--c': TIPOS[t].cor } as React.CSSProperties}>
                          <span className="registro-icone"><Icone nome={ICONE_DA_ACAO[x.acao] ?? 'check'} tamanho={17} /></span>
                          <div className="registro-corpo">
                            <div className="registro-linha">
                              <b>{NOME_DA_ACAO[x.acao] ?? x.acao}</b>
                              {x.alvo_email && (x.alvo_id && x.acao !== 'excluir'
                                ? <a className="registro-conta" href={`#/contas/${x.alvo_id}`}><span className="avatar minusculo">{iniciais(x.alvo_email)}</span><span className="registro-email">{x.alvo_email}</span></a>
                                : <span className="registro-conta apagada"><span className="avatar minusculo">{iniciais(x.alvo_email)}</span><span className="registro-email">{x.alvo_email}</span></span>)}
                            </div>
                            {x.motivo && <p className="registro-motivo">“{x.motivo}”</p>}
                            <span className="registro-quem"><span className="so-celular">{hora.format(new Date(x.criado_em))} · </span>por {x.admin_email}</span>
                          </div>
                          <time className="registro-hora" dateTime={x.criado_em} title={fmtDataHora(x.criado_em)}>{hora.format(new Date(x.criado_em))}</time>
                        </li>
                      )
                    })}
                  </ol>
                </section>
              ))}
            </div>
          )}
          {linhas.length >= 200 && <p className="nota">Mostrando as 200 ações mais recentes.</p>}
        </>
      )}
    </div>
  )
}
