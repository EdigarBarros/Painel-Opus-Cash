import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { useDados, useDemorou } from '../lib/dados'
import { fmtDinheiro, haQuanto, iniciais, inteiro, NOME_DA_ACAO } from '../lib/formato'
import { GraficoArea, GraficoBarras, Mini, Rosca, type Fatia } from '../pecas/Graficos'
import { Icone } from '../pecas/Icone'
import { Numero } from '../pecas/Numero'
import { Segmentado } from '../pecas/Segmentado'
import { ErroNaTela } from '../ui'

interface Dia { dia: string; cadastros: number; pix: number; por_fora: number; erros: number }
interface Atencao { id: string; email: string; nome: string | null; status: string; motivo: 'cartao_recusado' | 'prazo_vence' | 'teste_vence'; quando: string | null }
interface Cadastro { id: string; email: string; nome: string | null; criado_em: string; status: string | null; teste_fim: string | null; periodo_fim: string | null }
interface Acao { id: number; admin_email: string; acao: string; alvo_id: string | null; alvo_email: string | null; criado_em: string }

interface Resumo {
  contas: number; novas_7d: number; novas_7d_antes?: number; novas_30d: number; ativas_7d: number; ativas_30d?: number
  nao_confirmados?: number; bloqueados?: number
  em_teste: number; teste_vence_7d: number; cartao: number; cartao_pendente: number; cancela_no_fim?: number
  pix: number; pix_vence_7d: number; cortesia: number; sem_acesso: number
  pix_stripe_30d: number; pix_stripe_30d_antes?: number; pix_sem_credito: number; por_fora_30d: number; por_fora_30d_antes?: number
  erros_7d: number; erros_7d_antes?: number; erros_pessoas_7d?: number
  cadastros_por_dia: { dia: string; n: number }[]
  por_dia_90d?: Dia[]
  divisao?: Partial<Record<'teste' | 'cartao' | 'cartao_recusado' | 'prazo' | 'vitalicio' | 'sem_acesso', number>>
  atencao?: Atencao[]
  ultimos_cadastros?: Cadastro[]
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const diaCurto = (iso: string) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${MESES[m - 1]}` }
const diaLongo = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
const fmtDiaLongo = (iso: string) => diaLongo.format(new Date(`${iso}T12:00:00`)).replace(/\./g, '')
const hojeLongo = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const dinheiroCurto = (c: number) => (c >= 100_000
  ? `R$ ${(c / 100_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  : `R$ ${Math.round(c / 100).toLocaleString('pt-BR')}`)
const dinheiro = (c: number) => fmtDinheiro(Math.round(c))

function saudacao() {
  const h = new Date().getHours()
  return h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

/** Diferença contra o período anterior: "+3 que na semana passada", com cor de bom ou ruim. */
function Variacao({ agora, antes, texto, menosEhBom, dinheiro: emDinheiro }: { agora: number; antes?: number; texto: string; menosEhBom?: boolean; dinheiro?: boolean }) {
  if (antes === undefined) return null
  const d = agora - antes
  if (d === 0) return <span className="kpi-delta"><Icone nome="seta" tamanho={14} />igual {texto}</span>
  const subiu = d > 0
  const bom = menosEhBom ? !subiu : subiu
  const pct = antes > 0 ? `${Math.round(Math.abs(d / antes) * 100)}%` : null
  const valor = emDinheiro ? (pct ?? dinheiroCurto(Math.abs(d))) : String(Math.abs(d))
  return (
    <span className={`kpi-delta ${bom ? 'bom' : 'ruim'}`}>
      <Icone nome={subiu ? 'sobe' : 'desce'} tamanho={14} />
      {subiu ? '+' : '−'}{valor}<span>{texto}</span>
    </span>
  )
}

function Kpi({ cor, icone, rotulo, valor, formato, sub, delta, mini, href, alerta }: {
  cor: string; icone: string; rotulo: string; valor: number; formato?: (n: number) => string
  sub?: ReactNode; delta?: ReactNode; mini?: number[]; href?: string; alerta?: boolean
}) {
  const corpo = (
    <>
      <span className="kpi-topo">
        <span className="kpi-icone"><Icone nome={icone} tamanho={22} /></span>
        {href && <span className="kpi-seta"><Icone nome="dir" tamanho={18} /></span>}
      </span>
      <span className="kpi-rotulo">{rotulo}</span>
      <strong className="kpi-valor"><Numero valor={valor} formato={formato} /></strong>
      {sub && <span className="kpi-sub">{sub}</span>}
      {delta}
      {mini && <Mini valores={mini} cor={cor} />}
    </>
  )
  const props = { className: `kpi ${alerta ? 'alerta' : ''}`, style: { '--c': cor } as React.CSSProperties }
  return href ? <a {...props} href={href}>{corpo}</a> : <div {...props}>{corpo}</div>
}

type Aba = 'cadastros' | 'dinheiro' | 'erros'
type Periodo = 30 | 90

/** Cadastros, dinheiro recebido e erros nos últimos 30 ou 90 dias, comparando com o período anterior quando dá. */
function Movimento({ dias }: { dias: Dia[] }) {
  const [aba, setAba] = useState<Aba>('cadastros')
  const [periodo, setPeriodo] = useState<Periodo>(30)
  const recorte = dias.slice(-periodo)
  const anterior = periodo === 30 ? dias.slice(-60, -30) : null

  const soma = (lista: Dia[], f: (d: Dia) => number) => lista.reduce((s, d) => s + f(d), 0)
  const valorDe: Record<Aba, (d: Dia) => number> = {
    cadastros: (d) => d.cadastros,
    dinheiro: (d) => d.pix + d.por_fora,
    erros: (d) => d.erros,
  }
  const total = soma(recorte, valorDe[aba])
  const totalAntes = anterior ? soma(anterior, valorDe[aba]) : undefined
  const resumo = aba === 'cadastros' ? (total === 1 ? 'cadastro' : 'cadastros') : aba === 'erros' ? (total === 1 ? 'erro registrado' : 'erros registrados') : 'recebidos'

  // dinheiro: barras por dia em 30 dias e por semana em 90 (dia a dia ficaria quase tudo vazio)
  const semanas = useMemo(() => {
    const out: { ini: string; fim: string; pix: number; por_fora: number }[] = []
    for (let i = recorte.length; i > 0; i -= 7) {
      const bloco = recorte.slice(Math.max(0, i - 7), i)
      out.unshift({ ini: bloco[0].dia, fim: bloco[bloco.length - 1].dia, pix: soma(bloco, (d) => d.pix), por_fora: soma(bloco, (d) => d.por_fora) })
    }
    return out
  }, [recorte])

  let grafico: ReactNode
  if (aba === 'dinheiro') {
    const porSemana = periodo === 90
    const pontos = porSemana ? semanas : recorte.map((d) => ({ ini: d.dia, fim: d.dia, pix: d.pix, por_fora: d.por_fora }))
    grafico = (
      <GraficoBarras altura={280} encher rotulos={pontos.map((p) => p.ini)} formato={dinheiroCurto}
        series={[
          { nome: 'Pix do site', cor: 'var(--caixa)', valores: pontos.map((p) => p.pix) },
          { nome: 'Por fora', cor: 'var(--violeta)', valores: pontos.map((p) => p.por_fora) },
        ]}
        rotuloDoPonto={(i) => diaCurto(pontos[i].ini)}
        tituloDoPonto={(i) => (porSemana ? `${diaCurto(pontos[i].ini)} a ${diaCurto(pontos[i].fim)}` : fmtDiaLongo(pontos[i].ini))}
        descricao={`Dinheiro recebido ${porSemana ? 'por semana' : 'por dia'} nos últimos ${periodo} dias: ${dinheiro(total)}.`} />
    )
  } else {
    grafico = (
      <GraficoArea altura={280} encher rotulos={recorte.map((d) => d.dia)} formato={inteiro}
        serie={{ nome: aba === 'cadastros' ? 'Cadastros' : 'Erros', cor: aba === 'cadastros' ? 'var(--destaque)' : 'var(--saida)', valores: recorte.map(valorDe[aba]) }}
        rotuloDoPonto={(i) => diaCurto(recorte[i].dia)} tituloDoPonto={(i) => fmtDiaLongo(recorte[i].dia)}
        descricao={`${aba === 'cadastros' ? 'Cadastros' : 'Erros'} por dia nos últimos ${periodo} dias: ${total} no total.`} />
    )
  }

  return (
    <section className="cartao movimento">
      <header className="cartao-topo com-controles">
        <div>
          <h2>Movimento</h2>
          <p className="movimento-total">
            <strong><Numero key={`${aba}-${periodo}`} valor={total} formato={aba === 'dinheiro' ? dinheiro : inteiro} duracao={700} /></strong>
            {' '}{resumo} em {periodo} dias
            {totalAntes !== undefined && (
              <Variacao agora={total} antes={totalAntes} texto="que nos 30 dias antes" menosEhBom={aba === 'erros'} dinheiro={aba === 'dinheiro'} />
            )}
          </p>
        </div>
        <div className="controles">
          <Segmentado rotulo="O que mostrar" valor={aba} aoMudar={(v) => setAba(v)}
            opcoes={[['cadastros', 'Cadastros'], ['dinheiro', 'Recebido'], ['erros', 'Erros']]} />
          <Segmentado rotulo="Período" valor={periodo} aoMudar={(v) => setPeriodo(v)} opcoes={[[30, '30 dias'], [90, '90 dias']]} />
        </div>
      </header>
      {grafico}
      {aba === 'dinheiro' && (
        <p className="legenda-linha">
          <span><i style={{ background: 'var(--caixa)' }} />Pix do site</span>
          <span><i style={{ background: 'var(--violeta)' }} />Pagamentos por fora</span>
          <span className="nota-inline">O cartão é cobrado pelo Stripe e não entra aqui.</span>
        </p>
      )}
    </section>
  )
}

function Avatar({ email, nome }: { email: string; nome?: string | null }) {
  return <span className="avatar pequeno" aria-hidden="true">{iniciais(nome || email)}</span>
}

function quandoVence(iso: string | null) {
  if (!iso) return ''
  const dias = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
  return dias <= 0 ? 'vence hoje' : dias === 1 ? 'vence amanhã' : `vence em ${dias} dias`
}

function PedeAtencao({ itens, total, cartoes, prazos, testes }: { itens: Atencao[]; total: number; cartoes: number; prazos: number; testes: number }) {
  const MOTIVO: Record<Atencao['motivo'], { texto: (a: Atencao) => string; tom: string }> = {
    cartao_recusado: { texto: () => 'Cartão recusado', tom: 'vermelho' },
    prazo_vence: { texto: (a) => `Prazo ${quandoVence(a.quando)}`, tom: 'amarelo' },
    teste_vence: { texto: (a) => `Teste ${quandoVence(a.quando)}`, tom: 'azul' },
  }
  return (
    <section className="cartao">
      <header className="cartao-topo">
        <h2><Icone nome="sino" tamanho={18} />Pede atenção</h2>
        {total > 0 && <span className="contador">{total}</span>}
      </header>
      <div className="rolagem">
      {itens.length === 0
        ? <div className="calmo"><span className="vazio-icone"><Icone nome="check" tamanho={26} /></span><strong>Tudo em dia</strong><span>Nada vencendo nos próximos 7 dias e nenhum cartão recusado.</span></div>
        : (
          <ul className="lista-pessoas">
            {itens.map((a) => {
              const m = MOTIVO[a.motivo]
              return (
                <li key={`${a.id}-${a.motivo}`}>
                  <a href={`#/contas/${a.id}`}>
                    <Avatar email={a.email} nome={a.nome} />
                    <span className="pessoa-texto">
                      <span className="pessoa-nome">{a.nome || a.email}</span>
                      {a.nome && <span className="pessoa-sub">{a.email}</span>}
                    </span>
                    <span className={`etiqueta ${m.tom}`}>{m.texto(a)}</span>
                  </a>
                </li>
              )
            })}
          </ul>
        )}
      {itens.length > 0 && itens.length < 4 && (
        <div className="calmo pouco"><Icone nome="check" tamanho={20} /><span>Fora {itens.length === 1 ? 'esta conta' : 'estas contas'}, tudo em dia.</span></div>
      )}
      </div>
      {total > itens.length && <a className="ver-mais" href="#/contas?filtro=problemas">Ver todas as contas com problema<Icone nome="seta" tamanho={16} /></a>}
      <div className="placar">
        <a href="#/contas?filtro=problemas" className={cartoes ? 'tem' : ''} style={{ '--c': 'var(--saida)' } as React.CSSProperties}>
          <Icone nome={cartoes ? 'cartao' : 'check'} tamanho={16} /><b>{cartoes}</b><span>{cartoes === 1 ? 'cartão recusado' : 'cartões recusados'}</span>
        </a>
        <a href="#/contas?filtro=liberados" className={prazos ? 'tem' : ''} style={{ '--c': 'var(--divida)' } as React.CSSProperties}>
          <Icone nome={prazos ? 'relogio' : 'check'} tamanho={16} /><b>{prazos}</b><span>{prazos === 1 ? 'prazo vence' : 'prazos vencem'} em 7 dias</span>
        </a>
        <a href="#/contas?filtro=teste_vence" className={testes ? 'tem' : ''} style={{ '--c': 'var(--caixa)' } as React.CSSProperties}>
          <Icone nome={testes ? 'ampulheta' : 'check'} tamanho={16} /><b>{testes}</b><span>{testes === 1 ? 'teste vence' : 'testes vencem'} em 7 dias</span>
        </a>
      </div>
    </section>
  )
}

function situacaoCurta(c: Cadastro): { texto: string; tom: string } {
  const vale = (iso: string | null) => Boolean(iso && new Date(iso).getTime() > Date.now())
  switch (c.status) {
    case 'teste': return vale(c.teste_fim) ? { texto: 'Em teste', tom: 'azul' } : { texto: 'Teste acabou', tom: 'cinza' }
    case 'pix': return vale(c.periodo_fim) ? { texto: 'Liberado', tom: 'verde' } : { texto: 'Venceu', tom: 'cinza' }
    case 'cortesia': return { texto: 'Vitalício', tom: 'violeta' }
    case 'active': case 'trialing': return { texto: 'Cartão', tom: 'verde' }
    case 'past_due': return { texto: 'Cartão recusado', tom: 'amarelo' }
    default: return { texto: 'Sem plano', tom: 'cinza' }
  }
}

function UltimosCadastros({ lista }: { lista: Cadastro[] }) {
  return (
    <section className="cartao">
      <header className="cartao-topo">
        <h2><Icone nome="pessoas" tamanho={18} />Últimos cadastros</h2>
        <a className="ver-mais pequeno" href="#/contas">Ver contas<Icone nome="seta" tamanho={16} /></a>
      </header>
      {lista.length === 0 ? <p className="vazio-bonito">Ninguém se cadastrou ainda.</p> : (
        <ul className="lista-pessoas">
          {lista.map((c) => {
            const s = situacaoCurta(c)
            return (
              <li key={c.id}>
                <a href={`#/contas/${c.id}`}>
                  <Avatar email={c.email} nome={c.nome} />
                  <span className="pessoa-texto">
                    <span className="pessoa-nome">{c.nome || c.email}</span>
                    <span className="pessoa-sub">{`Chegou ${haQuanto(c.criado_em)}`}</span>
                  </span>
                  <span className={`etiqueta ${s.tom}`}>{s.texto}</span>
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function Medidor({ rotulo, valor, total, cor, detalhe, href }: { rotulo: string; valor: number; total: number; cor: string; detalhe?: string; href?: string }) {
  const pct = total ? Math.round((valor / total) * 100) : 0
  const corpo = (
    <>
      <span className="medidor-topo"><span>{rotulo}</span><b>{valor}<small> · {pct}%</small></b></span>
      <span className="progresso"><span style={{ width: `${pct}%`, background: cor }} /></span>
      {detalhe && <span className="medidor-detalhe">{detalhe}</span>}
    </>
  )
  return href ? <a className="medidor" href={href}>{corpo}</a> : <div className="medidor">{corpo}</div>
}

function Uso({ r }: { r: Resumo }) {
  return (
    <section className="cartao">
      <header className="cartao-topo"><h2><Icone nome="olho" tamanho={18} />Uso e cadastro</h2></header>
      <div className="medidores">
        <Medidor rotulo="Entraram na semana" valor={r.ativas_7d} total={r.contas} cor="var(--destaque)" />
        {r.ativas_30d !== undefined && <Medidor rotulo="Entraram no mês" valor={r.ativas_30d} total={r.contas} cor="var(--caixa)" />}
        <Medidor rotulo="Pagam (cartão ou prazo)" valor={r.cartao + r.pix} total={r.contas} cor="var(--entrada)"
          detalhe={r.cancela_no_fim ? `${r.cancela_no_fim} ${r.cancela_no_fim === 1 ? 'vai cancelar' : 'vão cancelar'} no fim do período` : undefined}
          href="#/contas?filtro=pagantes" />
        {r.nao_confirmados !== undefined && (
          <Medidor rotulo="E-mail não confirmado" valor={r.nao_confirmados} total={r.contas} cor="var(--divida)" href="#/contas?filtro=problemas" />
        )}
        {r.bloqueados ? <Medidor rotulo="Bloqueadas" valor={r.bloqueados} total={r.contas} cor="var(--saida)" href="#/contas?filtro=problemas" /> : null}
      </div>
    </section>
  )
}

function UltimasAcoes() {
  const { dados, erro: falhou } = useDados('registro:sem-leituras', () => api<Acao[]>('registro', { sem_leituras: true }))
  const linhas = dados ? dados.slice(0, 15) : null
  const erro = Boolean(falhou && !dados)
  return (
    <section className="cartao">
      <header className="cartao-topo">
        <h2><Icone nome="historico" tamanho={18} />O que o suporte fez</h2>
        <a className="ver-mais pequeno" href="#/registro">Ver registro<Icone nome="seta" tamanho={16} /></a>
      </header>
      {erro ? <p className="vazio-bonito">Não deu para carregar o registro agora.</p>
        : !linhas ? <div className="esqueleto" style={{ height: 180 }} />
        : linhas.length === 0 ? <p className="vazio-bonito">Nenhuma ação ainda.</p>
        : (
          <ol className="linha-do-tempo rolagem">
            {linhas.map((l) => (
              <li key={l.id}>
                <span className="ponto" />
                <span className="lt-texto">
                  <b>{NOME_DA_ACAO[l.acao] ?? l.acao}</b>
                  {l.alvo_email && <> · {l.alvo_id && l.acao !== 'excluir' ? <a href={`#/contas/${l.alvo_id}`}>{l.alvo_email}</a> : l.alvo_email}</>}
                </span>
                <span className="lt-quando">{haQuanto(l.criado_em)} · {l.admin_email.split('@')[0]}</span>
              </li>
            ))}
            {linhas.length < 4 && <li className="calmo pouco"><Icone nome="check" tamanho={20} /><span>Só isso por enquanto.</span></li>}
          </ol>
        )}
    </section>
  )
}

function Esqueleto() {
  return (
    <div className="pagina inicio" aria-busy="true" aria-label="Carregando">
      <div className="esqueleto" style={{ height: 64, width: 'min(380px, 80%)' }} />
      <div className="kpis">{[0, 1, 2, 3].map((i) => <div key={i} className="esqueleto" style={{ height: 210 }} />)}</div>
      <div className="grade-inicio"><div className="esqueleto" style={{ height: 380 }} /><div className="esqueleto" style={{ height: 380 }} /></div>
    </div>
  )
}

export function Inicio() {
  const { dados: r, erro, em, buscando: atualizando, recarregar: carregar } = useDados('resumo', () => api<Resumo>('resumo'))
  const quando = em ? new Date(em) : null
  const demorou = useDemorou()
  const [busca, setBusca] = useState('')

  // atualiza sozinho a cada 5 minutos enquanto a aba estiver aberta na frente
  useEffect(() => {
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') carregar() }, 5 * 60_000)
    return () => window.clearInterval(t)
  }, [carregar])

  if (erro && !r) return <ErroNaTela erro={erro} aoTentar={carregar} />
  if (!r) return demorou ? <Esqueleto /> : <div className="pagina-esperando" />

  // o painel antigo do banco devolvia só 30 dias de cadastros: monta o mesmo formato para não quebrar
  const dias: Dia[] = r.por_dia_90d ?? r.cadastros_por_dia.map((d) => ({ dia: d.dia, cadastros: d.n, pix: 0, por_fora: 0, erros: 0 }))
  const ult30 = dias.slice(-30)
  const recebido = r.pix_stripe_30d + r.por_fora_30d
  const recebidoAntes = r.pix_stripe_30d_antes !== undefined && r.por_fora_30d_antes !== undefined ? r.pix_stripe_30d_antes + r.por_fora_30d_antes : undefined
  const div = r.divisao ?? {}
  const fatias: Fatia[] = [
    { id: 'cartao', nome: 'Cartão', valor: div.cartao ?? r.cartao, cor: 'var(--entrada)', href: '#/contas?filtro=pagantes' },
    { id: 'prazo', nome: 'Liberados por prazo', valor: div.prazo ?? r.pix, cor: 'var(--caixa)', href: '#/contas?filtro=liberados' },
    { id: 'vitalicio', nome: 'Vitalícios', valor: div.vitalicio ?? r.cortesia, cor: 'var(--violeta)', href: '#/contas?filtro=vitalicio' },
    { id: 'teste', nome: 'Em teste grátis', valor: div.teste ?? r.em_teste, cor: 'var(--indigo)', href: '#/contas?filtro=teste' },
    { id: 'cartao_recusado', nome: 'Cartão recusado', valor: div.cartao_recusado ?? 0, cor: 'var(--divida)', href: '#/contas?filtro=problemas' },
    { id: 'sem_acesso', nome: 'Sem acesso', valor: div.sem_acesso ?? r.sem_acesso, cor: 'var(--cinza-grafico)', href: '#/contas?filtro=sem_acesso' },
  ]
  const totalAtencao = r.cartao_pendente + r.pix_vence_7d + r.teste_vence_7d
  const hoje = hojeLongo.format(quando ?? 0)

  return (
    <div className="pagina inicio">
      <header className="saudacao">
        <div>
          <h1>{saudacao().split(' ').map((p, i) => <span key={i} className="palavra" style={{ animationDelay: `${i * 90}ms` }}>{i ? ` ${p}` : p}</span>)}</h1>
          <p className="data-hoje"><Icone nome="calendario" tamanho={18} /><span><b>{hoje[0].toUpperCase() + hoje.slice(1)}</b>
            {quando && <>Atualizado às {hora.format(quando)}</>}</span></p>
        </div>
        <div className="saudacao-acoes">
          <form className="busca-topo" role="search" onSubmit={(e) => {
            e.preventDefault()
            location.hash = busca.trim() ? `#/contas?busca=${encodeURIComponent(busca.trim())}` : '#/contas'
          }}>
            <Icone nome="busca" tamanho={18} />
            <input type="search" placeholder="Achar conta por e-mail ou nome" value={busca} onChange={(e) => setBusca(e.target.value)}
              aria-label="Achar conta por e-mail ou nome" />
          </form>
          <button className={`icone-btn ${atualizando ? 'girando' : ''}`} onClick={carregar} disabled={atualizando} aria-label="Atualizar os números" title="Atualizar os números">
            <Icone nome="atualizar" tamanho={18} />
          </button>
        </div>
      </header>

      {erro && <p className="faixa alerta" role="status">Não deu para atualizar agora ({erro}). Os números abaixo são de {quando ? hora.format(quando) : 'antes'}.</p>}
      {r.pix_sem_credito > 0 && (
        <p className="faixa alerta" role="status">
          <Icone nome="alerta" tamanho={18} />
          <span>{r.pix_sem_credito === 1 ? '1 Pix foi pago' : `${r.pix_sem_credito} Pix foram pagos`} por quem já tinha acesso (cortesia ou cartão) e não
          {r.pix_sem_credito === 1 ? ' virou' : ' viraram'} dias. Confira no Stripe e devolva o dinheiro.</span>
        </p>
      )}

      <div className="kpis">
        <Kpi cor="var(--destaque)" icone="pessoas" rotulo="Contas" valor={r.contas} href="#/contas"
          sub={r.novas_7d === 1 ? '1 nova na semana' : `${r.novas_7d} novas na semana`}
          delta={<Variacao agora={r.novas_7d} antes={r.novas_7d_antes} texto="que na semana passada" />}
          mini={ult30.map((d) => d.cadastros)} />
        <Kpi cor="var(--entrada)" icone="estrela" rotulo="Pagando agora" valor={r.cartao + r.pix} href="#/contas?filtro=pagantes"
          sub={`${r.cartao} no cartão · ${r.pix} por prazo · ${r.cortesia} vitalícios`}
          delta={r.cartao_pendente > 0
            ? <span className="kpi-delta ruim"><Icone nome="alerta" tamanho={14} />{r.cartao_pendente === 1 ? '1 cartão recusado' : `${r.cartao_pendente} cartões recusados`}</span>
            : <span className="kpi-delta bom"><Icone nome="check" tamanho={14} />nenhum cartão recusado</span>}
          alerta={r.cartao_pendente > 0} />
        <Kpi cor="var(--caixa)" icone="dinheiro" rotulo="Recebido em 30 dias" valor={recebido} formato={dinheiro}
          sub={`${fmtDinheiro(r.pix_stripe_30d)} Pix do site · ${fmtDinheiro(r.por_fora_30d)} por fora`}
          delta={<Variacao agora={recebido} antes={recebidoAntes} texto="que nos 30 dias antes" dinheiro />}
          mini={ult30.map((d) => d.pix + d.por_fora)} />
        <Kpi cor="var(--saida)" icone="inseto" rotulo="Erros na semana" valor={r.erros_7d} href="#/erros" alerta={r.erros_7d > 0}
          sub={r.erros_pessoas_7d !== undefined ? (r.erros_pessoas_7d === 1 ? 'em 1 pessoa' : `em ${r.erros_pessoas_7d} pessoas`) : undefined}
          delta={<Variacao agora={r.erros_7d} antes={r.erros_7d_antes} texto="que na semana passada" menosEhBom />}
          mini={ult30.map((d) => d.erros)} />
      </div>

      <div className="grade-inicio">
        <Movimento dias={dias} />
        <section className="cartao">
          <header className="cartao-topo">
            <h2><Icone nome="meta" tamanho={18} />Como estão as contas</h2>
          </header>
          <Rosca fatias={fatias} />
        </section>
      </div>

      <div className="grade-inicio metades">
        <PedeAtencao itens={r.atencao ?? []} total={totalAtencao} cartoes={r.cartao_pendente} prazos={r.pix_vence_7d} testes={r.teste_vence_7d} />
        <UltimosCadastros lista={r.ultimos_cadastros ?? []} />
      </div>

      <div className="grade-inicio metades">
        <Uso r={r} />
        <UltimasAcoes />
      </div>

    </div>
  )
}
