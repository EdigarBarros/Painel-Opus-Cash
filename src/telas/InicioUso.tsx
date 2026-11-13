import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useDados } from '../lib/dados'
import { duracao, fmtDataHora, fmtDinheiro, haQuanto, iniciais, inteiro, NOME_DO_APARELHO, NOME_DO_MODO, nomeDaTela, nomeDoIdioma } from '../lib/formato'
import { Icone } from '../pecas/Icone'

interface Online { id: string; email: string; nome: string | null; foto: string | null; tela: string | null; visto_em: string; entrou_em: string; aparelho: string | null; idioma: string | null }
interface UsoGeral {
  online: number; vistos_24h: number
  telas: { tela: string; segundos: number; interacoes: number; pessoas: number }[]
  tutorial: { terminou: number; pulou: number; passo_medio_ao_pular: number | null }
  modos: Record<string, number>; idiomas: Record<string, number>; aparelhos: Record<string, number>
  sem_perguntas: number; com_foto: number
}
interface Reembolso {
  id: string; valor: number; moeda: string; status: string; criado: string | null; motivo: string | null
  cobranca: string | null; cobrado: number | null; cobrado_em: string | null; tipo: string | null; email_stripe: string | null
  user_id: string | null; email: string | null; nome: string | null
}

const semMigracao = (e: string) => /adm_|function|schema/i.test(e)

/** Atualiza sozinho a cada `ms` com a aba do painel visível. */
function useAoVivo(recarregar: () => void, ms: number) {
  useEffect(() => {
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') recarregar() }, ms)
    return () => window.clearInterval(t)
  }, [recarregar, ms])
}

function Foto({ foto, texto }: { foto: string | null; texto: string }) {
  return <span className="avatar">{foto ? <img src={foto} alt="" loading="lazy" /> : iniciais(texto)}</span>
}

/** Quem está com o OpusCash aberto agora, em qual tela e há quanto tempo. */
export function UsandoAgora() {
  const { dados, erro, recarregar } = useDados('online', () => api<Online[]>('online'))
  useAoVivo(recarregar, 20_000)
  return (
    <section className="cartao">
      <header className="cartao-topo">
        <h2><Icone nome="pessoa" tamanho={18} />Usando agora{dados ? ` · ${dados.length}` : ''}</h2>
        <a className="ver-mais pequeno" href="#/contas?filtro=online">Ver na lista<Icone nome="seta" tamanho={16} /></a>
      </header>
      {erro && !dados ? <p className="vazio-bonito">{semMigracao(erro) ? 'Falta rodar a migração 03 do painel no Supabase.' : 'Não deu para carregar agora.'}</p>
        : !dados ? <div className="esqueleto" style={{ height: 160 }} />
        : dados.length === 0 ? <p className="vazio-bonito"><Icone nome="relogio" tamanho={20} />Ninguém com o app aberto neste minuto.</p>
        : (
          <ul className="online-lista">
            {dados.map((o) => (
              <li key={o.id}>
                <a href={`#/contas/${o.id}`}>
                  <span className="avatar-anel"><Foto foto={o.foto} texto={o.nome || o.email} /><i className="presenca agora" /></span>
                  <span className="online-texto">
                    <b>{o.nome || o.email}</b>
                    <small>{nomeDaTela(o.tela)} · abriu {haQuanto(o.entrou_em)} · {NOME_DO_APARELHO[o.aparelho ?? ''] ?? o.aparelho ?? '—'} · {nomeDoIdioma(o.idioma)}</small>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
    </section>
  )
}

const lista = (r: Record<string, number>, nome: (k: string) => string) =>
  Object.entries(r).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${nome(k)} ${inteiro(n)}`).join(' · ') || '—'

/** Como todo mundo usa o app (últimos 30 dias): telas mais usadas, tutorial, jeito de ver, idiomas e aparelhos. */
export function UsoDoApp() {
  const { dados: u, erro } = useDados('uso-geral', () => api<UsoGeral>('uso_geral'))
  const max = Math.max(1, ...(u?.telas ?? []).map((t) => t.segundos))
  return (
    <section className="cartao">
      <header className="cartao-topo"><h2><Icone nome="grade" tamanho={18} />Como o app é usado</h2><small className="nota-topo">Últimos 30 dias</small></header>
      {erro && !u ? <p className="vazio-bonito">{semMigracao(erro) ? 'Falta rodar a migração 03 do painel no Supabase.' : 'Não deu para carregar agora.'}</p>
        : !u ? <div className="esqueleto" style={{ height: 220 }} />
        : (
          <>
            <ul className="situacoes">
              <li className="situacao-linha"><span className="situacao-icone"><Icone nome="ideia" tamanho={17} /></span>
                <span><b>Tutorial: {inteiro(u.tutorial.terminou)} viram inteiro, {inteiro(u.tutorial.pulou)} pularam</b>
                  <small>{u.tutorial.passo_medio_ao_pular ? `Quem pula, pula em média no passo ${String(u.tutorial.passo_medio_ao_pular).replace('.', ',')}` : 'Ninguém pulou ainda'}</small></span></li>
              <li className="situacao-linha"><span className="situacao-icone"><Icone nome="olho" tamanho={17} /></span>
                <span><b>Jeito de ver</b><small>{lista(u.modos, (k) => NOME_DO_MODO[k] ?? k)}</small></span></li>
              <li className="situacao-linha"><span className="situacao-icone"><Icone nome="globo" tamanho={17} /></span>
                <span><b>Idiomas</b><small>{lista(u.idiomas, nomeDoIdioma)}</small></span></li>
              <li className="situacao-linha"><span className="situacao-icone"><Icone nome="pessoa" tamanho={17} /></span>
                <span><b>Onde usam</b><small>{lista(u.aparelhos, (k) => NOME_DO_APARELHO[k] ?? k)}</small></span></li>
              <li className="situacao-linha"><span className="situacao-icone"><Icone nome="camera" tamanho={17} /></span>
                <span><b>{inteiro(u.com_foto)} com foto · {inteiro(u.sem_perguntas)} sem responder as perguntas</b><small>{inteiro(u.vistos_24h)} abriram o app nas últimas 24 horas</small></span></li>
            </ul>
            {u.telas.length > 0 && (
              <>
                <p className="uso-rotulo">Telas onde passam mais tempo</p>
                <ul className="uso-telas">
                  {u.telas.slice(0, 8).map((t, i) => (
                    <li key={t.tela} style={{ '--i': i } as React.CSSProperties}>
                      <span className="uso-tela-nome"><b>{nomeDaTela(t.tela)}</b><small>{t.pessoas === 1 ? '1 pessoa' : `${inteiro(t.pessoas)} pessoas`} · {inteiro(t.interacoes)} interações</small></span>
                      <span className="uso-tela-barra"><i style={{ width: `${Math.max(2, (t.segundos / max) * 100)}%` }} /></span>
                      <strong>{duracao(t.segundos)}</strong>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
    </section>
  )
}

const MOTIVO: Record<string, string> = { requested_by_customer: 'pedido da pessoa', duplicate: 'cobrança duplicada', fraudulent: 'fraude', expired_uncaptured_charge: 'expirou' }
const SITUACAO: Record<string, string> = { succeeded: 'feito', pending: 'processando', failed: 'falhou', canceled: 'cancelado', requires_action: 'esperando ação' }

/** Reembolsos feitos no Stripe (pelo painel ou direto no Stripe), lidos na hora. */
export function Reembolsos() {
  const { dados, erro, recarregar } = useDados('reembolsos', () => api<Reembolso[]>('reembolsos'))
  const [todos, setTodos] = useState(false)
  const [agora] = useState(() => Date.now())
  const itens = dados ? (todos ? dados : dados.slice(0, 6)) : null
  const total30 = (dados ?? []).filter((r) => r.status === 'succeeded' && r.moeda === 'brl' && r.criado && agora - new Date(r.criado).getTime() < 30 * 86_400_000)
    .reduce((s, r) => s + r.valor, 0)
  return (
    <section className="cartao">
      <header className="cartao-topo">
        <h2><Icone nome="desfazer" tamanho={18} />Reembolsos no Stripe{dados?.length ? ` · ${fmtDinheiro(total30)} em 30 dias` : ''}</h2>
        <button type="button" className="ver-mais pequeno" onClick={recarregar}>Atualizar<Icone nome="atualizar" tamanho={15} /></button>
      </header>
      {erro && !dados ? <p className="vazio-bonito">Não deu para ler o Stripe agora: {erro}</p>
        : !itens ? <div className="esqueleto" style={{ height: 160 }} />
        : itens.length === 0 ? <p className="vazio-bonito"><Icone nome="check" tamanho={20} />Nenhum reembolso feito.</p>
        : (
          <>
            <ul className="lista-movimentos">
              {itens.map((r, i) => {
                const quem = r.nome || r.email || r.email_stripe || 'Conta não encontrada'
                const corpo = (
                  <>
                    <span className="mov-icone"><Icone nome="desfazer" tamanho={17} /></span>
                    <span className="mov-texto">
                      <b>{quem}</b>
                      <small>
                        {fmtDataHora(r.criado)} · {r.tipo === 'pix' ? 'Pix' : r.tipo === 'card' ? 'Cartão' : r.tipo ?? 'Stripe'}
                        {r.cobrado !== null && r.valor < r.cobrado ? ` · parcial de ${fmtDinheiro(r.cobrado, r.moeda)}` : ''}
                        {r.cobrado_em ? ` · pago em ${fmtDataHora(r.cobrado_em).slice(0, 10)}` : ''}
                        {r.motivo ? ` · ${MOTIVO[r.motivo] ?? r.motivo}` : ''}
                        {r.status !== 'succeeded' ? ` · ${SITUACAO[r.status] ?? r.status}` : ''}
                      </small>
                    </span>
                    <strong className="mov-valor reembolso-valor">−{fmtDinheiro(r.valor, r.moeda)}</strong>
                  </>
                )
                return (
                  <li key={r.id} style={{ '--i': Math.min(i, 12) } as React.CSSProperties}>
                    {r.user_id ? <a href={`#/contas/${r.user_id}`} className="mov-link">{corpo}</a> : corpo}
                  </li>
                )
              })}
            </ul>
            {(dados?.length ?? 0) > 6 && (
              <button type="button" className="botao pequeno" onClick={() => setTodos(!todos)}>{todos ? 'Mostrar menos' : `Ver todos (${dados!.length})`}</button>
            )}
            {dados?.some((r) => r.tipo === 'pix') && <p className="nota">Reembolso de Pix não tira o acesso sozinho: se for o caso, use "Tirar acesso" na ficha.</p>}
          </>
        )}
    </section>
  )
}
