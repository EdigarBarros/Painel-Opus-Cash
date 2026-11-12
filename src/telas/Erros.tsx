import { useCallback, useEffect, useState } from 'react'
import { api, mensagemDe } from '../lib/api'
import { useAviso } from '../lib/useAviso'
import { fmtDataHora, haQuanto } from '../lib/formato'
import { Carregando, ErroNaTela, Etiqueta } from '../ui'

interface GrupoDeErro {
  mensagem: string; vezes: number; pessoas: number; primeiro: string; ultimo: string
  versoes: string[] | null; onde: string[] | null; resolvido_em: string | null; voltou: boolean
}
interface Ocorrencia { id: number; user_id: string | null; onde: string | null; detalhe: string | null; versao: string | null; criado_em: string }

const PERIODOS = [[7, '7 dias'], [30, '30 dias'], [90, '90 dias'], [365, '1 ano']] as const

/** Erros que quebraram a tela de alguém (o OpusCash grava em erros_app), agrupados pela mensagem. */
export function Erros() {
  const [dias, setDias] = useState(30)
  const [grupos, setGrupos] = useState<GrupoDeErro[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [toast, avisar] = useAviso()

  const carregar = useCallback(() => {
    api<GrupoDeErro[]>('erros', { dias }).then((d) => { setGrupos(d); setErro(null) }).catch((e) => setErro(mensagemDe(e)))
  }, [dias])
  useEffect(carregar, [carregar])

  const marcar = async (mensagem: string, resolvido: boolean) => {
    try {
      await api('erro_resolver', { mensagem, resolvido })
      avisar(resolvido ? 'Marcado como resolvido.' : 'Reaberto.')
      carregar()
    } catch (e) {
      avisar(mensagemDe(e))
    }
  }

  return (
    <div className="pagina">
      <h1>Erros</h1>
      <p className="sub">O que quebrou na tela das pessoas, no site e no app. O mesmo erro aparece uma vez só, com quantas vezes aconteceu.</p>
      <div className="filtros" role="group" aria-label="Período">
        {PERIODOS.map(([d, nome]) => (
          <button key={d} type="button" className={`filtro ${dias === d ? 'ativo' : ''}`} aria-pressed={dias === d} onClick={() => setDias(d)}>{nome}</button>
        ))}
      </div>
      {erro && <ErroNaTela erro={erro} aoTentar={carregar} />}
      {!erro && !grupos && <Carregando />}
      {grupos && grupos.length === 0 && <p className="vazio">Nenhum erro neste período.</p>}
      {grupos && grupos.length > 0 && (
        <ul className="erros">
          {grupos.map((g) => {
            const resolvido = Boolean(g.resolvido_em) && !g.voltou
            return (
              <li key={g.mensagem} className={`cartao erro ${resolvido ? 'resolvido' : ''}`}>
                <button type="button" className="erro-cabeca" aria-expanded={aberto === g.mensagem}
                  onClick={() => setAberto(aberto === g.mensagem ? null : g.mensagem)}>
                  <span className="erro-msg">{g.mensagem}</span>
                  <span className="erro-meta">
                    {g.vezes === 1 ? '1 vez' : `${g.vezes} vezes`} · {g.pessoas === 1 ? '1 pessoa' : `${g.pessoas} pessoas`} · último {haQuanto(g.ultimo)}
                  </span>
                  <span className="etiquetas">
                    {resolvido && <Etiqueta tom="verde">Resolvido</Etiqueta>}
                    {g.voltou && <Etiqueta tom="vermelho">Voltou depois de resolvido</Etiqueta>}
                  </span>
                </button>
                {aberto === g.mensagem && <DetalheDoErro grupo={g} resolvido={resolvido} aoMarcar={marcar} />}
              </li>
            )
          })}
        </ul>
      )}
      {toast}
    </div>
  )
}

function DetalheDoErro({ grupo, resolvido, aoMarcar }: { grupo: GrupoDeErro; resolvido: boolean; aoMarcar: (m: string, r: boolean) => void }) {
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    api<Ocorrencia[]>('erro_detalhe', { mensagem: grupo.mensagem }).then(setOcorrencias).catch((e) => setErro(mensagemDe(e)))
  }, [grupo.mensagem])
  return (
    <div className="erro-detalhe">
      <dl className="dados">
        <dt>Primeira vez</dt><dd>{fmtDataHora(grupo.primeiro)}</dd>
        <dt>Última vez</dt><dd>{fmtDataHora(grupo.ultimo)}</dd>
        {grupo.versoes?.length ? <><dt>Versões</dt><dd>{grupo.versoes.join(', ')}</dd></> : null}
        {grupo.onde?.length ? <><dt>Onde</dt><dd>{grupo.onde.join(' · ')}</dd></> : null}
      </dl>
      <div className="acoes">
        {resolvido
          ? <button className="botao" onClick={() => aoMarcar(grupo.mensagem, false)}>Reabrir</button>
          : <button className="botao principal" onClick={() => aoMarcar(grupo.mensagem, true)}>Marcar como resolvido</button>}
      </div>
      {erro && <p className="aviso-erro">{erro}</p>}
      {!ocorrencias && !erro && <Carregando texto="Carregando as últimas vezes…" />}
      {ocorrencias && (
        <ul className="lista">
          {ocorrencias.map((o) => (
            <li key={o.id}>
              <span className="lista-obs">
                {fmtDataHora(o.criado_em)}{o.onde && ` · ${o.onde}`}{o.versao && ` · versão ${o.versao}`}
                {o.user_id && <> · <a href={`#/contas/${o.user_id}`}>ver conta</a></>}
              </span>
              {o.detalhe && <pre className="pilha">{o.detalhe}</pre>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
