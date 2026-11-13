import { useEffect } from 'react'
import { api } from '../lib/api'
import { useDados } from '../lib/dados'
import { duracao, fmtData, fmtDataCurta, fmtDataHora, haQuanto, inteiro, NOME_DO_APARELHO, NOME_DO_MODO, nomeDaTela, nomeDoIdioma } from '../lib/formato'
import { GraficoBarras } from '../pecas/Graficos'
import { Icone } from '../pecas/Icone'
import { Numero } from '../pecas/Numero'
import { ErroNaTela, Etiqueta } from '../ui'

export interface UsoDados {
  presenca: { visto_em: string; aberto: boolean; tela: string | null; idioma: string | null; aparelho: string | null; versao: string | null
    entrou_em: string; online: boolean } | null
  perfil: { detalhe: string; modulos: Record<string, boolean>; moedas: string[]; moeda: string; onboarding_em: string | null
    tutorial_dispensado: boolean; tem_foto: boolean; objetivo: string | null; saldo_inicial: boolean; criado_em: string; atualizado_em: string } | null
  marcos: { tipo: string; detalhe: Record<string, unknown>; criado_em: string }[]
  telas: { tela: string; segundos: number; interacoes: number; visitas: number; dias: number }[]
  dias: { dia: string; segundos: number; interacoes: number }[]
  total: { segundos: number; interacoes: number; dias: number; desde: string | null }
  contagens: Record<string, { n: number; ultimo: string | null }>
}

const MODULOS: [string, string][] = [
  ['dividas', 'Dívidas'], ['contas', 'Contas do mês'], ['cartoes', 'Cartões'], ['bancos', 'Bancos'], ['investimentos', 'Investimentos'],
  ['moedas', 'Outras moedas'], ['metas', 'Metas'],
]

const OBJETIVOS: Record<string, string> = {
  dividas: 'Sair das dívidas', guardar: 'Guardar dinheiro', tranquilo: 'Ficar tranquilo', controle: 'Ter controle',
  crescer: 'Fazer o dinheiro crescer', 'fechar-mes': 'Fechar o mês no azul',
}

/** O que a pessoa já cadastrou: só a quantidade (nunca o conteúdo). [tabela, nome, ícone] */
const PARTES: [string, string, string][] = [
  ['lancamentos', 'Lançamentos', 'lista'], ['categorias', 'Categorias', 'grade'], ['contas_fixas', 'Contas do mês', 'calendario'],
  ['cartoes', 'Cartões', 'cartao'], ['faturas_pagas', 'Faturas pagas', 'check'], ['dividas', 'Dívidas', 'alerta'],
  ['divida_partes', 'Partes de dívidas', 'reticencias'], ['divida_promessas', 'Promessas de pagamento', 'acordo'],
  ['metas', 'Metas', 'estrela'], ['meta_movimentos', 'Movimentos de metas', 'trocar'], ['bancos', 'Bancos', 'carteira'],
  ['meses', 'Meses com saldo', 'ano'], ['invest_ativos', 'Investimentos', 'investir'], ['invest_operacoes', 'Operações do Invest', 'investir'],
  ['invest_importacoes', 'Importações do Invest', 'importar'],
]

function Tutorial({ u }: { u: UsoDados }) {
  const marcos = [...u.marcos].reverse()
  const terminou = marcos.find((m) => m.tipo === 'tutorial_terminou')
  const pulou = marcos.find((m) => m.tipo === 'tutorial_pulou')
  const reviu = u.marcos.filter((m) => m.tipo === 'tutorial_reviu').length
  const passo = (m?: { detalhe: Record<string, unknown> }) => (m ? `passo ${m.detalhe.passo ?? '?'} de ${m.detalhe.total ?? '?'}` : '')
  if (terminou) return <Linha ok icone="check" titulo="Viu o tutorial inteiro" texto={`em ${fmtDataHora(terminou.criado_em)}${reviu ? ` · reviu ${reviu === 1 ? '1 vez' : `${reviu} vezes`}` : ''}`} />
  if (pulou) return <Linha ok={false} icone="seta" titulo="Pulou o tutorial" texto={`no ${passo(pulou)}, em ${fmtDataHora(pulou.criado_em)}${reviu ? ` · reviu ${reviu === 1 ? '1 vez' : `${reviu} vezes`}` : ''}`} />
  if (u.perfil?.tutorial_dispensado) return <Linha ok="neutro" icone="relogio" titulo="Já passou pelo tutorial" texto="Antes de o painel começar a medir (não dá para saber se pulou)" />
  return <Linha ok={false} icone="alerta" titulo="Ainda não viu o tutorial" texto={u.perfil?.onboarding_em ? 'Ele aparece depois das perguntas iniciais' : 'Aparece depois das perguntas iniciais'} />
}

function Linha({ ok, icone, titulo, texto }: { ok: boolean | 'neutro'; icone: string; titulo: string; texto: string }) {
  return (
    <li className={`situacao-linha ${ok === 'neutro' ? '' : ok ? 'ok' : 'atencao'}`}>
      <span className="situacao-icone"><Icone nome={icone} tamanho={17} /></span>
      <span><b>{titulo}</b><small>{texto}</small></span>
    </li>
  )
}

export function UsoDaConta({ id }: { id: string }) {
  const { dados: u, erro, recarregar } = useDados(`uso:${id}`, () => api<UsoDados>('uso', { id }))
  // ao vivo: confere de novo a cada 20 segundos se a pessoa está usando e em qual tela
  useEffect(() => {
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') recarregar() }, 20_000)
    return () => window.clearInterval(t)
  }, [recarregar])

  if (erro && !u) {
    return /adm_uso|function|schema/i.test(erro)
      ? <ErroNaTela erro="Falta rodar no Supabase a migração 30 do OpusCash e a 03 do painel (uso do app)." aoTentar={recarregar} />
      : <ErroNaTela erro={erro} aoTentar={recarregar} />
  }
  if (!u) return <div className="esqueleto" style={{ height: 320 }} />

  const pr = u.presenca
  const pe = u.perfil
  const ligados = MODULOS.filter(([k]) => pe?.modulos?.[k])
  const maxTela = Math.max(1, ...u.telas.map((t) => t.segundos))
  const cadastros = PARTES.filter(([k]) => u.contagens[k])
  const vazio = cadastros.every(([k]) => !u.contagens[k].n)

  return (
    <div className="pilha-ficha uso">
      <section className={`cartao ao-vivo ${pr?.online ? 'online' : ''}`}>
        <span className="ao-vivo-ponto" aria-hidden="true" />
        <div className="ao-vivo-textos">
          {pr?.online ? (
            <>
              <strong>Usando o OpusCash agora</strong>
              <span>Em <b>{nomeDaTela(pr.tela)}</b> · abriu {haQuanto(pr.entrou_em)} (às {fmtDataHora(pr.entrou_em).slice(-5)})</span>
            </>
          ) : pr ? (
            <>
              <strong>Não está usando agora</strong>
              <span>Visto pela última vez {haQuanto(pr.visto_em)} ({fmtDataHora(pr.visto_em)}), em {nomeDaTela(pr.tela)}</span>
            </>
          ) : (
            <>
              <strong>Ainda sem dados de uso</strong>
              <span>A medição começa na próxima vez que a pessoa abrir o OpusCash (site ou app atualizado).</span>
            </>
          )}
        </div>
        {pr && (
          <dl className="ao-vivo-dados">
            <div><dt><Icone nome="globo" tamanho={14} />Idioma</dt><dd>{nomeDoIdioma(pr.idioma)}</dd></div>
            <div><dt><Icone nome="pessoa" tamanho={14} />Onde usa</dt><dd>{NOME_DO_APARELHO[pr.aparelho ?? ''] ?? pr.aparelho ?? '—'}</dd></div>
            <div><dt><Icone nome="atualizar" tamanho={14} />Versão</dt><dd>{pr.versao ?? '—'}</dd></div>
          </dl>
        )}
      </section>

      <div className="mini-kpis quatro">
        <div className="mini-kpi" style={{ '--c': 'var(--caixa)' } as React.CSSProperties}><span><Icone nome="relogio" tamanho={15} />Tempo no app</span><strong>{duracao(u.total.segundos)}</strong><small>{u.total.desde ? `desde ${fmtData(u.total.desde)}` : 'nada medido ainda'}</small></div>
        <div className="mini-kpi" style={{ '--c': 'var(--entrada)' } as React.CSSProperties}><span><Icone nome="calendario" tamanho={15} />Dias de uso</span><strong><Numero valor={u.total.dias} /></strong><small>dias em que abriu o app</small></div>
        <div className="mini-kpi" style={{ '--c': 'var(--violeta)' } as React.CSSProperties}><span><Icone nome="olho" tamanho={15} />Interações</span><strong><Numero valor={u.total.interacoes} formato={inteiro} /></strong><small>toques e teclas (só a quantidade)</small></div>
        <div className="mini-kpi" style={{ '--c': 'var(--divida)' } as React.CSSProperties}><span><Icone nome="grade" tamanho={15} />Por dia de uso</span><strong>{duracao(u.total.dias ? u.total.segundos / u.total.dias : 0)}</strong><small>tempo médio</small></div>
      </div>

      <div className="grade-ficha">
        <section className="cartao">
          <header className="cartao-topo"><h2><Icone nome="ideia" tamanho={18} />Primeiros passos</h2></header>
          <ul className="situacoes">
            <Linha ok={Boolean(pe?.onboarding_em)} icone={pe?.onboarding_em ? 'check' : 'alerta'}
              titulo={pe?.onboarding_em ? 'Respondeu as perguntas iniciais' : 'Não respondeu as perguntas iniciais'}
              texto={pe?.onboarding_em ? `em ${fmtDataHora(pe.onboarding_em)}` : 'Parou antes de montar o painel'} />
            <Tutorial u={u} />
            <Linha ok={Boolean(pe?.objetivo)} icone="bussola" titulo={pe?.objetivo ? 'Respondeu o Consultor' : 'Não respondeu o Consultor'}
              texto={pe?.objetivo ? `Objetivo: ${OBJETIVOS[pe.objetivo] ?? pe.objetivo}` : 'Ainda não escolheu um objetivo'} />
            <Linha ok={Boolean(pe?.tem_foto)} icone="camera" titulo={pe?.tem_foto ? 'Pôs foto de perfil' : 'Sem foto de perfil'} texto={pe?.tem_foto ? 'Aparece no topo da ficha' : 'Usa as iniciais'} />
            <Linha ok={Boolean(pe?.saldo_inicial)} icone="cofre" titulo={pe?.saldo_inicial ? 'Informou o saldo inicial' : 'Sem saldo inicial'} texto="De onde o saldo do mês parte" />
          </ul>
        </section>

        <section className="cartao">
          <header className="cartao-topo"><h2><Icone nome="ajustes" tamanho={18} />Como o painel está montado</h2></header>
          <ul className="situacoes">
            <Linha ok="neutro" icone="olho" titulo={`Jeito de ver: ${NOME_DO_MODO[pe?.detalhe ?? ''] ?? pe?.detalhe ?? '—'}`}
              texto={pe?.detalhe === 'simples' ? 'Só o essencial, sem gráficos' : pe?.detalhe === 'detalhado' ? 'Tudo: categorias, lançamentos e o ano' : 'O painel completo, com gráficos'} />
            <Linha ok="neutro" icone="globo" titulo={`Moeda principal: ${pe?.moeda ?? '—'}`} texto={pe?.moedas?.length ? `Outras: ${pe.moedas.join(', ')}` : 'Sem outras moedas'} />
          </ul>
          <p className="uso-rotulo">Abas ligadas</p>
          <div className="etiquetas">
            {MODULOS.map(([k, nome]) => <Etiqueta key={k} tom={pe?.modulos?.[k] ? 'verde' : 'cinza'}>{pe?.modulos?.[k] ? '✓ ' : ''}{nome}</Etiqueta>)}
          </div>
          {pe && <p className="nota">{ligados.length === 1 ? '1 aba extra ligada' : `${ligados.length} abas extras ligadas`} · painel mudado pela última vez em {fmtData(pe.atualizado_em)}</p>}
        </section>
      </div>

      <section className="cartao">
        <header className="cartao-topo"><h2><Icone nome="lista" tamanho={18} />O que já preencheu</h2><small className="nota-topo">Só a quantidade. O painel não vê o conteúdo.</small></header>
        {vazio
          ? <p className="vazio-bonito"><Icone nome="lista" tamanho={20} />Ainda não cadastrou nada.</p>
          : (
            <ul className="preenchido">
              {cadastros.map(([k, nome, icone], i) => {
                const c = u.contagens[k]
                return (
                  <li key={k} className={c.n ? '' : 'zero'} style={{ '--i': Math.min(i, 14) } as React.CSSProperties}>
                    <span className="mov-icone"><Icone nome={icone} tamanho={16} /></span>
                    <span className="preenchido-texto"><b>{nome}</b><small>{c.ultimo ? `último em ${fmtDataCurta(c.ultimo)}` : c.n ? '' : 'nenhum'}</small></span>
                    <strong>{inteiro(c.n)}</strong>
                  </li>
                )
              })}
            </ul>
          )}
      </section>

      <section className="cartao">
        <header className="cartao-topo"><h2><Icone nome="ano" tamanho={18} />Tempo no app por dia</h2><small className="nota-topo">Últimos 30 dias</small></header>
        <GraficoBarras altura={200} rotulos={u.dias.map((d) => d.dia)} formato={(n) => duracao(n)}
          series={[{ nome: 'Tempo', cor: 'var(--caixa)', valores: u.dias.map((d) => d.segundos) }]}
          rotuloDoPonto={(i) => fmtDataCurta(`${u.dias[i].dia}T12:00:00`)}
          tituloDoPonto={(i) => `${fmtDataCurta(`${u.dias[i].dia}T12:00:00`)}: ${duracao(u.dias[i].segundos)}, ${inteiro(u.dias[i].interacoes)} interações`}
          descricao="Quanto tempo a pessoa ficou no app em cada dia." />
      </section>

      <section className="cartao">
        <header className="cartao-topo"><h2><Icone nome="grade" tamanho={18} />Tempo em cada tela</h2><small className="nota-topo">Últimos 30 dias</small></header>
        {u.telas.length === 0
          ? <p className="vazio-bonito"><Icone nome="relogio" tamanho={20} />Nada medido ainda.</p>
          : (
            <ul className="uso-telas">
              {u.telas.map((t, i) => (
                <li key={t.tela} style={{ '--i': Math.min(i, 14) } as React.CSSProperties}>
                  <span className="uso-tela-nome"><b>{nomeDaTela(t.tela)}</b><small>{t.visitas === 1 ? '1 visita' : `${inteiro(t.visitas)} visitas`} · {inteiro(t.interacoes)} interações · {t.dias === 1 ? '1 dia' : `${t.dias} dias`}</small></span>
                  <span className="uso-tela-barra"><i style={{ width: `${Math.max(2, (t.segundos / maxTela) * 100)}%` }} /></span>
                  <strong>{duracao(t.segundos)}</strong>
                </li>
              ))}
            </ul>
          )}
      </section>

      <p className="nota">O OpusCash mede só telas, tempo, número de toques, idioma e aparelho. Nada do que a pessoa digita ou lança chega aqui.</p>
    </div>
  )
}
