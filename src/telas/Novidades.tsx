import { useState } from 'react'
import { api, mensagemDe } from '../lib/api'
import { useDados, useDemorou } from '../lib/dados'
import { fmtDataHora, inteiro } from '../lib/formato'
import { useAviso } from '../lib/useAviso'
import { CartaoNovidade, CORES_NOVIDADE, type CorNovidade } from '../pecas/CartaoNovidade'
import { Icone } from '../pecas/Icone'
import { Segmentado } from '../pecas/Segmentado'
import { ErroNaTela, Etiqueta, Modal } from '../ui'

/*
 * Novidades: o pop-up "Tem novidade!" que aparece UMA vez no OpusCash (site e app) para quem já tinha conta.
 * Publicar aqui não pede versão nova do site nem do app: eles leem a mais recente publicada (migração 31 do OpusCash).
 */

type Texto = { pt: string; en?: string; es?: string }
interface Novidade {
  id: number; titulo: Texto; itens: { icone: string; texto: Texto }[]; icone: string; cor: CorNovidade; tela: string | null
  onde: 'todos' | 'site' | 'app'; publicada_em: string | null; criada_em: string; atualizada_em: string; vistas: number; publico: number
}
type Rascunho = Pick<Novidade, 'titulo' | 'itens' | 'icone' | 'cor' | 'tela' | 'onde'>

/** Ícones do OpusCash que dá para usar (os mesmos nomes do app). */
const ICONES = ['estrela', 'ideia', 'pessoa', 'email', 'sino', 'calendario', 'cartao', 'carteira', 'investir', 'meta', 'bussola',
  'escudo', 'cofre', 'relatorio', 'globo', 'camera', 'lapis', 'acordo', 'relogio', 'engrenagem', 'ajustes', 'olho', 'trocar',
  'importar', 'exportar', 'receber', 'enviar', 'lista', 'ano', 'inicio', 'divida', 'check', 'historico', 'busca', 'sol', 'lua']

const NOME_DA_COR: Record<CorNovidade, string> = { marca: 'OpusCash', verde: 'Verde', azul: 'Azul', violeta: 'Violeta', amarelo: 'Amarelo', rosa: 'Rosa' }
const FUNDO_DA_COR: Record<CorNovidade, string> = {
  marca: 'linear-gradient(140deg, var(--marca-1), var(--marca-3))', verde: 'linear-gradient(140deg, #12b886, var(--entrada))',
  azul: 'linear-gradient(140deg, #2f6bff, var(--caixa))', violeta: 'linear-gradient(140deg, #6d4ef0, var(--violeta))',
  amarelo: 'linear-gradient(140deg, #f08c00, var(--divida))', rosa: 'linear-gradient(140deg, #e8456a, var(--saida))',
}

/** Para onde o botão "Ver agora" leva no OpusCash (as páginas do painel do app). */
const TELAS: [string, string][] = [
  ['', 'Só fechar (sem botão "Ver agora")'], ['inicio', 'Início'], ['lancamentos', 'Lançamentos'], ['analise', 'Consultor'],
  ['invest', 'Invest'], ['contas', 'Contas do mês'], ['cartoes', 'Cartões'], ['dividas', 'Dívidas'], ['metas', 'Metas'],
  ['patrimonio', 'Dinheiro guardado'], ['ano', 'Resumo do ano'], ['configuracoes', 'Configurações'],
]
const ONDE: [Novidade['onde'], string][] = [['todos', 'Site e app'], ['site', 'Só no site'], ['app', 'Só no app']]

const ROTULOS = { selo: 'Novidade', ver: 'Ver agora', ok: 'Legal!', depois: 'Depois', fechar: 'Fechar' }
const NOVA: Rascunho = { titulo: { pt: '' }, itens: [{ icone: 'estrela', texto: { pt: '' } }], icone: 'estrela', cor: 'marca', tela: null, onde: 'todos' }

function Previa({ r, pequena }: { r: Rascunho; pequena?: boolean }) {
  const itens = r.itens.filter((i) => i.texto.pt.trim()).map((i) => ({ icone: i.icone, texto: i.texto.pt }))
  return (
    <div className={`novidade-previa ${pequena ? 'pequena' : ''}`}>
      <CartaoNovidade previa titulo={r.titulo.pt || 'Título da novidade'} itens={itens} icone={r.icone} cor={r.cor}
        rotulos={ROTULOS} temBotaoVer={Boolean(r.tela)} aoVer={() => {}} aoFechar={() => {}} />
    </div>
  )
}

function EscolherIcone({ valor, aoMudar, rotulo, grande }: { valor: string; aoMudar: (v: string) => void; rotulo: string; grande?: boolean }) {
  const [aberto, setAberto] = useState(false)
  return (
    <div className="escolher-icone">
      <button type="button" className={`icone-atual ${grande ? 'grande' : ''}`} onClick={() => setAberto(!aberto)} aria-expanded={aberto} aria-label={rotulo} title={rotulo}>
        <Icone nome={valor} tamanho={grande ? 26 : 19} /><Icone nome="abaixo" tamanho={14} />
      </button>
      {aberto && (
        <div className="grade-icones" role="listbox" aria-label={rotulo}>
          {ICONES.map((n) => (
            <button key={n} type="button" role="option" aria-selected={n === valor} className={n === valor ? 'ativo' : ''} title={n}
              onClick={() => { aoMudar(n); setAberto(false) }}><Icone nome={n} tamanho={19} /></button>
          ))}
        </div>
      )}
    </div>
  )
}

function CampoIdiomas({ valor, aoMudar, max, rotulo, dica, traducoes }: {
  valor: Texto; aoMudar: (t: Texto) => void; max: number; rotulo: string; dica?: string; traducoes: boolean
}) {
  return (
    <div className="campo-idiomas">
      <label className="campo">
        <span>{rotulo}{dica && <small> · {dica}</small>}</span>
        <input value={valor.pt} maxLength={max} onChange={(e) => aoMudar({ ...valor, pt: e.target.value })} />
      </label>
      {traducoes && (
        <div className="traducoes">
          <label className="campo"><span>Em inglês</span><input value={valor.en ?? ''} maxLength={max} onChange={(e) => aoMudar({ ...valor, en: e.target.value })} /></label>
          <label className="campo"><span>Em espanhol</span><input value={valor.es ?? ''} maxLength={max} onChange={(e) => aoMudar({ ...valor, es: e.target.value })} /></label>
        </div>
      )}
    </div>
  )
}

function Editor({ inicial, id, aoTerminar }: { inicial: Rascunho; id: number | null; aoTerminar: (msg?: string) => void }) {
  const [r, setR] = useState<Rascunho>(inicial)
  const [traducoes, setTraducoes] = useState(Boolean(inicial.titulo.en || inicial.titulo.es))
  const [enviando, setEnviando] = useState<'salvar' | 'publicar' | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const mudarItem = (i: number, it: Partial<Rascunho['itens'][number]>) => setR({ ...r, itens: r.itens.map((x, k) => (k === i ? { ...x, ...it } : x)) })

  const salvar = async (publicar: boolean) => {
    setErro(null)
    if (!r.titulo.pt.trim()) return setErro('Escreva o título.')
    setEnviando(publicar ? 'publicar' : 'salvar')
    try {
      const { id: novoId } = await api<{ id: number }>('novidade_salvar', { id, novidade: r })
      if (publicar) await api('novidade_publicar', { id: novoId, publicar: true })
      aoTerminar(publicar ? 'Novidade publicada: aparece na próxima vez que cada pessoa abrir o OpusCash.' : 'Rascunho salvo.')
    } catch (e) {
      setErro(mensagemDe(e))
    } finally {
      setEnviando(null)
    }
  }

  return (
    <section className="cartao editor-novidade">
      <div className="editor-form">
        <header className="cartao-topo"><h2><Icone nome="lapis" tamanho={18} />{id ? 'Editar novidade' : 'Nova novidade'}</h2></header>

        <div className="linha-escolhas">
          <div>
            <p className="uso-rotulo">Ícone grande</p>
            <EscolherIcone grande valor={r.icone} aoMudar={(icone) => setR({ ...r, icone })} rotulo="Ícone grande" />
          </div>
          <div>
            <p className="uso-rotulo">Cor</p>
            <div className="cores-novidade" role="group" aria-label="Cor">
              {CORES_NOVIDADE.map((c) => (
                <button key={c} type="button" className={r.cor === c ? 'ativo' : ''} style={{ background: FUNDO_DA_COR[c] }}
                  aria-pressed={r.cor === c} aria-label={NOME_DA_COR[c]} title={NOME_DA_COR[c]} onClick={() => setR({ ...r, cor: c })} />
              ))}
            </div>
          </div>
        </div>

        <CampoIdiomas rotulo="Título" dica="curto, até 60 letras" max={60} valor={r.titulo} traducoes={traducoes} aoMudar={(titulo) => setR({ ...r, titulo })} />

        <p className="uso-rotulo">O que tem de novo <small>(até 4, poucas palavras cada)</small></p>
        <ul className="itens-novidade">
          {r.itens.map((it, i) => (
            <li key={i}>
              <EscolherIcone valor={it.icone} aoMudar={(icone) => mudarItem(i, { icone })} rotulo={`Ícone do item ${i + 1}`} />
              <CampoIdiomas rotulo={`Item ${i + 1}`} max={40} valor={it.texto} traducoes={traducoes} aoMudar={(texto) => mudarItem(i, { texto })} />
              <button type="button" className="icone-btn" aria-label={`Tirar o item ${i + 1}`} onClick={() => setR({ ...r, itens: r.itens.filter((_, k) => k !== i) })}><Icone nome="lixeira" tamanho={17} /></button>
            </li>
          ))}
        </ul>
        {r.itens.length < 4 && (
          <button type="button" className="botao pequeno" onClick={() => setR({ ...r, itens: [...r.itens, { icone: 'check', texto: { pt: '' } }] })}>
            <Icone nome="mais" tamanho={16} />Pôr item
          </button>
        )}

        <label className="campo">
          <span>O botão leva para</span>
          <select value={r.tela ?? ''} onChange={(e) => setR({ ...r, tela: e.target.value || null })}>
            {TELAS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </select>
        </label>
        <p className="uso-rotulo">Aparece</p>
        <Segmentado rotulo="Onde aparece" valor={r.onde} aoMudar={(onde) => setR({ ...r, onde })} opcoes={ONDE} />
        <p className="nota">No app Android, só aparece para quem já tem a versão 2.5.0 ou mais nova.</p>

        <label className="caixa-marcar">
          <input type="checkbox" checked={traducoes} onChange={(e) => setTraducoes(e.target.checked)} />
          Escrever também em inglês e espanhol <small>(sem isso, quem usa o app nesses idiomas vê em português)</small>
        </label>

        {erro && <p className="aviso-erro" role="alert">{erro}</p>}
        <div className="form-botoes">
          <button type="button" className="botao" onClick={() => aoTerminar()} disabled={Boolean(enviando)}>Cancelar</button>
          <button type="button" className="botao" onClick={() => void salvar(false)} disabled={Boolean(enviando)}>{enviando === 'salvar' ? 'Salvando…' : 'Salvar rascunho'}</button>
          <button type="button" className="botao principal" onClick={() => void salvar(true)} disabled={Boolean(enviando)}>{enviando === 'publicar' ? 'Publicando…' : 'Salvar e publicar'}</button>
        </div>
      </div>
      <aside className="editor-previa">
        <p className="uso-rotulo">Como a pessoa vê</p>
        <Previa r={r} />
      </aside>
    </section>
  )
}

export function Novidades() {
  const { dados, erro, recarregar } = useDados('novidades', () => api<Novidade[]>('novidades'))
  const demorou = useDemorou()
  const [editando, setEditando] = useState<{ id: number | null; r: Rascunho } | null>(null)
  const [confirmar, setConfirmar] = useState<{ tipo: 'publicar' | 'tirar' | 'apagar'; n: Novidade } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [toast, avisar] = useAviso()

  const terminar = (msg?: string) => {
    setEditando(null)
    if (msg) avisar(msg)
    recarregar()
  }
  const executar = async () => {
    if (!confirmar) return
    setOcupado(true)
    try {
      if (confirmar.tipo === 'apagar') await api('novidade_apagar', { id: confirmar.n.id })
      else await api('novidade_publicar', { id: confirmar.n.id, publicar: confirmar.tipo === 'publicar' })
      avisar(confirmar.tipo === 'apagar' ? 'Novidade apagada.' : confirmar.tipo === 'publicar' ? 'Novidade publicada.' : 'Novidade tirada do ar.')
      setConfirmar(null)
      recarregar()
    } catch (e) {
      avisar(mensagemDe(e))
    } finally {
      setOcupado(false)
    }
  }

  const semMigracao = erro && /adm_novidades|function|schema/i.test(erro)
  const publicada = dados?.find((n) => n.publicada_em)

  return (
    <div className="pagina novidades">
      <header className="pagina-topo">
        <div>
          <h1>Novidades</h1>
          <p className="sub">O pop-up que aparece uma vez no OpusCash, para quem já usa, mostrando o que tem de novo.</p>
        </div>
        {!editando && <button className="botao principal" onClick={() => setEditando({ id: null, r: NOVA })}><Icone nome="mais" tamanho={17} />Criar novidade</button>}
      </header>

      {editando && <Editor key={editando.id ?? 'nova'} inicial={editando.r} id={editando.id} aoTerminar={terminar} />}

      {erro && !dados && <ErroNaTela erro={semMigracao ? 'Falta rodar a migração 31 do OpusCash e a 04 do painel no Supabase.' : erro} aoTentar={recarregar} />}
      {!dados && !erro && demorou && <div className="esqueleto" style={{ height: 220 }} />}
      {dados && dados.length === 0 && !editando && (
        <div className="vazio-grande">
          <span className="vazio-icone"><Icone nome="estrela" tamanho={30} /></span>
          <strong>Nenhuma novidade ainda</strong>
          <p>Lançou algo no OpusCash? Crie uma novidade: ícone, cor, um título curto e até 4 itens. Ela aparece uma vez para cada pessoa.</p>
        </div>
      )}
      {dados && dados.length > 0 && (
        <div className="lista-novidades">
          {dados.map((n, i) => {
            const pct = n.publico ? Math.round((n.vistas / n.publico) * 100) : 0
            const noAr = n.id === publicada?.id
            return (
              <article key={n.id} className={`cartao novidade-linha ${noAr ? 'no-ar' : ''}`} style={{ '--i': Math.min(i, 10) } as React.CSSProperties}>
                <Previa r={n} pequena />
                <div className="novidade-info">
                  <div className="etiquetas">
                    {noAr ? <Etiqueta tom="verde">No ar agora</Etiqueta>
                      : n.publicada_em ? <Etiqueta tom="cinza">Já saiu</Etiqueta>
                      : <Etiqueta tom="amarelo">Rascunho</Etiqueta>}
                    <Etiqueta tom="azul">{ONDE.find(([v]) => v === n.onde)?.[1]}</Etiqueta>
                  </div>
                  <h2>{n.titulo.pt}</h2>
                  <p className="nota">{n.publicada_em ? `Publicada em ${fmtDataHora(n.publicada_em)}` : `Criada em ${fmtDataHora(n.criada_em)}`}</p>
                  {n.publicada_em && (
                    <div className="medidor">
                      <span className="medidor-topo"><span>Viram</span><b>{inteiro(n.vistas)}<small> de {inteiro(n.publico)} · {pct}%</small></b></span>
                      <span className="progresso"><span style={{ width: `${pct}%`, background: 'var(--entrada)' }} /></span>
                    </div>
                  )}
                  {n.publicada_em && !noAr && <p className="nota">Só a novidade mais recente aparece. Esta não aparece mais para ninguém.</p>}
                  <div className="form-botoes">
                    <button className="botao pequeno" onClick={() => setEditando({ id: n.id, r: n })}><Icone nome="lapis" tamanho={15} />Editar</button>
                    {n.publicada_em
                      ? <button className="botao pequeno" onClick={() => setConfirmar({ tipo: 'tirar', n })}>Tirar do ar</button>
                      : <button className="botao pequeno principal" onClick={() => setConfirmar({ tipo: 'publicar', n })}>Publicar</button>}
                    <button className="botao pequeno perigo-leve" onClick={() => setConfirmar({ tipo: 'apagar', n })}><Icone nome="lixeira" tamanho={15} />Apagar</button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {confirmar && (
        <Modal titulo={confirmar.tipo === 'publicar' ? 'Publicar a novidade' : confirmar.tipo === 'tirar' ? 'Tirar do ar' : 'Apagar a novidade'} aoFechar={() => setConfirmar(null)}>
          <p>
            {confirmar.tipo === 'publicar' ? `"${confirmar.n.titulo.pt}" aparece uma vez para cada pessoa que já tem conta, na próxima vez que ela abrir o OpusCash. Se outra novidade estiver no ar, esta passa na frente.`
              : confirmar.tipo === 'tirar' ? `"${confirmar.n.titulo.pt}" para de aparecer. Quem já viu não é afetado.`
              : `"${confirmar.n.titulo.pt}" some daqui de vez. Não tem volta.`}
          </p>
          <div className="form-botoes">
            <button className="botao" onClick={() => setConfirmar(null)} disabled={ocupado}>Cancelar</button>
            <button className={`botao ${confirmar.tipo === 'apagar' ? 'perigo' : 'principal'}`} onClick={() => void executar()} disabled={ocupado}>
              {ocupado ? 'Um momento…' : confirmar.tipo === 'publicar' ? 'Publicar' : confirmar.tipo === 'tirar' ? 'Tirar do ar' : 'Apagar'}
            </button>
          </div>
        </Modal>
      )}
      {toast}
    </div>
  )
}
