import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { api, mensagemDe } from '../lib/api'
import { useAviso } from '../lib/useAviso'
import {
  corDoTom, fmtData, fmtDataHora, fmtDinheiro, haQuanto, hojeISO, ICONE_DA_ACAO, iniciais, NOME_DA_ACAO, pagaNoCartao, paraCentavos, situacao,
} from '../lib/formato'
import { estiloLente, useLente } from '../lib/useLente'
import { Icone } from '../pecas/Icone'
import { Numero } from '../pecas/Numero'
import { CampoMotivo, ErroNaTela, Etiqueta, FormularioDeAcao, Modal } from '../ui'
import { CartaoStripe } from './Stripe'

interface Assinatura {
  status: string; teste_fim: string | null; periodo_fim: string | null; stripe_customer_id: string | null
  stripe_subscription_id: string | null; cancela_no_fim: boolean; moeda: string | null; atualizado_em: string
}
interface FichaDados {
  conta: { id: string; email: string; criado_em: string; ultimo_acesso: string | null; confirmado_em: string | null
    bloqueado_ate: string | null; email_novo: string | null; sessoes: number; admin: boolean }
  perfil: { nome: string | null; moeda: string | null; onboarding_em: string | null; atualizado_em: string | null } | null
  assinatura: Assinatura | null
  pix_stripe: { sessao_id: string; valor: number; moeda: string; dias: number; creditado: boolean; pago_em: string }[]
  pagamentos: { id: number; valor: number; moeda: string; forma: string; pago_em: string; observacao: string | null }[]
  anotacoes: { id: number; texto: string; criado_em: string; admin_email: string | null }[]
  registro: { id: number; admin_email: string; acao: string; motivo: string | null; criado_em: string }[]
  erros: { id: number; mensagem: string; onde: string | null; versao: string | null; criado_em: string }[]
}

type Janela = 'liberar' | 'teste' | 'revogar' | 'senha_email' | 'senha_link' | 'confirmar_email' | 'reenviar_confirmacao'
  | 'trocar_email' | 'bloquear' | 'desbloquear' | 'encerrar_sessoes' | 'excluir'
type Aba = 'geral' | 'cartao' | 'pagamentos' | 'suporte' | 'erros'

const FORMAS = [['pix', 'Pix'], ['transferencia', 'Transferência'], ['dinheiro', 'Dinheiro'], ['outro', 'Outro']] as const
const ICONE_FORMA: Record<string, string> = { pix: 'dinheiro', transferencia: 'trocar', dinheiro: 'carteira', outro: 'reticencias' }
const DIA = 86_400_000

/** A hora em que a tela abriu: as contas de prazo usam sempre a mesma, em vez de mudar a cada redesenho. */
const useAgora = () => useState(() => Date.now())[0]

/** Botão grande com ícone, título e uma linha explicando (as ações da ficha). */
function Azulejo({ icone, titulo, texto, aoClicar, tom, destaque }: { icone: string; titulo: string; texto?: string; aoClicar: () => void; tom?: 'perigo'; destaque?: boolean }) {
  return (
    <button type="button" className={`acao-azulejo ${tom ?? ''} ${destaque ? 'destaque' : ''}`} onClick={aoClicar}>
      <span className="acao-icone"><Icone nome={icone} tamanho={19} /></span>
      <span className="acao-textos"><b>{titulo}</b>{texto && <small>{texto}</small>}</span>
    </button>
  )
}

/** Anel com os dias que faltam (teste ou prazo), como os anéis do OpusCash. */
function AnelDias({ fim, inicio, cor }: { fim: string; inicio: number; cor: string }) {
  const agora = useAgora()
  const total = Math.max(DIA, new Date(fim).getTime() - inicio)
  const resta = Math.max(0, new Date(fim).getTime() - agora)
  const dias = Math.ceil(resta / DIA)
  const R = 52, C = 2 * Math.PI * R
  const frac = Math.min(1, resta / total)
  return (
    <div className="anel-dias" style={{ '--c': cor } as React.CSSProperties}>
      <svg viewBox="0 0 128 128" aria-hidden="true">
        <circle cx="64" cy="64" r={R} className="anel-fundo" />
        <circle cx="64" cy="64" r={R} className="anel-cheio" strokeDasharray={`${C * frac} ${C}`} transform="rotate(-90 64 64)" />
      </svg>
      <div className="anel-centro">
        <strong><Numero valor={dias} /></strong>
        <span>{dias === 1 ? 'dia' : 'dias'}</span>
      </div>
    </div>
  )
}

function Acesso({ f, aoAbrir }: { f: FichaDados; aoAbrir: (j: Janela) => void }) {
  const agora = useAgora()
  const a = f.assinatura
  const s = situacao(a?.status ?? 'sem_assinatura', a?.teste_fim, a?.periodo_fim)
  const cartao = pagaNoCartao(a?.status)
  const liberadoPeloPainel = a && ['pix', 'cortesia', 'teste'].includes(a.status)
  const vale = (iso?: string | null) => Boolean(iso && new Date(iso).getTime() > agora)
  const fim = a?.status === 'teste' && vale(a.teste_fim) ? a.teste_fim : a?.status === 'pix' && vale(a.periodo_fim) ? a.periodo_fim : null
  // início aproximado para o anel: o teste começa no cadastro; o prazo, na última mudança da assinatura
  const inicio = a?.status === 'teste' ? new Date(f.conta.criado_em).getTime() : new Date(a?.atualizado_em ?? f.conta.criado_em).getTime()
  const cor = corDoTom(s.tom)

  let visual: ReactNode
  if (fim) {
    visual = (
      <div className="acesso-visual">
        <AnelDias fim={fim} inicio={Math.min(inicio, agora - DIA)} cor={cor} />
        <div className="acesso-textos">
          <span className="acesso-rotulo">{a?.status === 'teste' ? 'Teste grátis' : 'Liberado por prazo'}</span>
          <strong>até {fmtDataHora(fim)}</strong>
          <small>No OpusCash a pessoa vê quantos dias faltam e o botão de renovar.</small>
        </div>
      </div>
    )
  } else if (a?.status === 'cortesia') {
    visual = (
      <div className="acesso-visual">
        <span className="acesso-simbolo" style={{ '--c': cor } as React.CSSProperties}><Icone nome="infinito" tamanho={46} /></span>
        <div className="acesso-textos"><span className="acesso-rotulo">Vitalício</span><strong>Acesso para sempre</strong><small>Sem cobrança. O Stripe nunca mexe nesta conta.</small></div>
      </div>
    )
  } else if (cartao) {
    visual = (
      <div className="acesso-visual">
        <span className="acesso-simbolo" style={{ '--c': cor } as React.CSSProperties}><Icone nome="cartao" tamanho={40} /></span>
        <div className="acesso-textos">
          <span className="acesso-rotulo">Assinatura no cartão</span>
          <strong>{s.texto}</strong>
          <small>{a?.periodo_fim ? `Período pago até ${fmtData(a.periodo_fim)}` : 'Cobrada pelo Stripe todo mês.'}{a?.cancela_no_fim ? ' · cancela no fim do período' : ''}</small>
        </div>
      </div>
    )
  } else {
    visual = (
      <div className="acesso-visual">
        <span className="acesso-simbolo apagado"><Icone nome="cadeado" tamanho={38} /></span>
        <div className="acesso-textos"><span className="acesso-rotulo">Sem acesso</span><strong>{s.texto}</strong><small>A pessoa vê a tela de assinatura ao entrar.</small></div>
      </div>
    )
  }

  return (
    <section className="cartao">
      <header className="cartao-topo"><h2><Icone nome="escudo" tamanho={18} />Acesso ao OpusCash</h2><Etiqueta tom={s.tom}>{s.texto}</Etiqueta></header>
      {visual}
      {a && !['teste', 'sem_assinatura'].includes(a.status) && a.teste_fim && <p className="nota">Já usou o teste grátis (até {fmtData(a.teste_fim)}).</p>}
      {cartao
        ? <p className="nota">O acesso vem do cartão: mexa nele na aba <b>Cartão e Stripe</b>. Para passar para Pix, prazo ou vitalício, use "Cancelar agora" lá (dá para já liberar os dias junto).</p>
        : (
          <div className="azulejos">
            <Azulejo destaque icone="calendario" titulo="Liberar acesso" texto="Dias, até uma data ou vitalício" aoClicar={() => aoAbrir('liberar')} />
            {a?.status !== 'pix' && a?.status !== 'cortesia' && <Azulejo icone="ampulheta" titulo="Estender teste" texto="Mais dias de teste grátis" aoClicar={() => aoAbrir('teste')} />}
            {liberadoPeloPainel && <Azulejo tom="perigo" icone="cadeado" titulo="Tirar acesso" texto="Volta para a assinatura" aoClicar={() => aoAbrir('revogar')} />}
          </div>
        )}
    </section>
  )
}

function Situacao({ ok, icone, titulo, texto }: { ok: boolean | 'neutro'; icone: string; titulo: string; texto: string }) {
  return (
    <li className={`situacao-linha ${ok === 'neutro' ? '' : ok ? 'ok' : 'atencao'}`}>
      <span className="situacao-icone"><Icone nome={icone} tamanho={17} /></span>
      <span><b>{titulo}</b><small>{texto}</small></span>
    </li>
  )
}

function Login({ f, bloqueada, aoAbrir }: { f: FichaDados; bloqueada: boolean; aoAbrir: (j: Janela) => void }) {
  const c = f.conta
  return (
    <section className="cartao">
      <header className="cartao-topo"><h2><Icone nome="cadeado" tamanho={18} />Login e senha</h2></header>
      <ul className="situacoes">
        <Situacao ok={Boolean(c.confirmado_em)} icone={c.confirmado_em ? 'check' : 'alerta'} titulo={c.confirmado_em ? 'E-mail confirmado' : 'E-mail não confirmado'}
          texto={c.confirmado_em ? `em ${fmtData(c.confirmado_em)}` : 'A pessoa ainda não clicou no link do e-mail'} />
        {c.email_novo && <Situacao ok={false} icone="trocar" titulo="Troca de e-mail pendente" texto={`para ${c.email_novo}`} />}
        <Situacao ok="neutro" icone="relogio" titulo="Último acesso" texto={haQuanto(c.ultimo_acesso)} />
        <Situacao ok="neutro" icone="pessoa" titulo={c.sessoes === 1 ? '1 aparelho conectado' : `${c.sessoes} aparelhos conectados`} texto="Celulares e computadores com login ativo" />
        <Situacao ok={!bloqueada} icone={bloqueada ? 'cadeado' : 'escudo'} titulo={bloqueada ? 'Bloqueada pelo suporte' : 'Conta livre'} texto={bloqueada ? 'Não consegue entrar até desbloquear' : 'Entra normalmente'} />
      </ul>
      <div className="azulejos">
        <Azulejo icone="email" titulo="E-mail de senha nova" texto="O mesmo do “Esqueci a senha”" aoClicar={() => aoAbrir('senha_email')} />
        <Azulejo icone="copiar" titulo="Link de senha nova" texto="Para mandar pelo WhatsApp" aoClicar={() => aoAbrir('senha_link')} />
        {!c.confirmado_em && <Azulejo icone="email" titulo="Reenviar confirmação" aoClicar={() => aoAbrir('reenviar_confirmacao')} />}
        {!c.confirmado_em && <Azulejo icone="check" titulo="Confirmar e-mail" texto="Sem o link" aoClicar={() => aoAbrir('confirmar_email')} />}
        {!c.admin && <Azulejo icone="trocar" titulo="Trocar e-mail" texto="Perdeu o e-mail antigo" aoClicar={() => aoAbrir('trocar_email')} />}
        {c.sessoes > 0 && <Azulejo icone="sair" titulo="Desconectar aparelhos" texto="Sai de todos" aoClicar={() => aoAbrir('encerrar_sessoes')} />}
        {bloqueada
          ? <Azulejo icone="escudo" titulo="Desbloquear conta" aoClicar={() => aoAbrir('desbloquear')} />
          : !c.admin && <Azulejo tom="perigo" icone="cadeado" titulo="Bloquear conta" texto="Impede de entrar" aoClicar={() => aoAbrir('bloquear')} />}
      </div>
    </section>
  )
}

function Pagamentos({ f }: { f: FichaDados }) {
  type Item = { chave: string; valor: number; moeda: string; quando: string; titulo: string; icone: string; detalhe?: string | null; alerta?: string }
  const itens: Item[] = [
    ...f.pix_stripe.map((p) => ({ chave: p.sessao_id, valor: p.valor, moeda: p.moeda, quando: p.pago_em, titulo: 'Pix pelo site', icone: 'dinheiro',
      detalhe: `${p.dias} dias de acesso`, alerta: p.creditado ? undefined : 'Não virou dias: devolver' })),
    ...f.pagamentos.map((p) => ({ chave: `f${p.id}`, valor: p.valor, moeda: p.moeda, quando: `${p.pago_em}T12:00:00`,
      titulo: `${FORMAS.find(([v]) => v === p.forma)?.[1] ?? p.forma} por fora`, icone: ICONE_FORMA[p.forma] ?? 'dinheiro', detalhe: p.observacao })),
  ].sort((x, y) => new Date(y.quando).getTime() - new Date(x.quando).getTime())
  const brl = (l: { valor: number; moeda: string }[]) => l.filter((p) => (p.moeda ?? 'brl').toLowerCase() === 'brl').reduce((s, p) => s + p.valor, 0)
  const pix = brl(f.pix_stripe.filter((p) => p.creditado))
  const fora = brl(f.pagamentos)
  return (
    <div className="pilha-ficha">
      <div className="mini-kpis">
        <div className="mini-kpi" style={{ '--c': 'var(--entrada)' } as React.CSSProperties}><span>Total recebido</span><strong><Numero valor={pix + fora} formato={(n) => fmtDinheiro(Math.round(n))} /></strong><small>{itens.length === 1 ? '1 pagamento' : `${itens.length} pagamentos`}</small></div>
        <div className="mini-kpi" style={{ '--c': 'var(--caixa)' } as React.CSSProperties}><span>Pix do site</span><strong><Numero valor={pix} formato={(n) => fmtDinheiro(Math.round(n))} /></strong><small>pago pelo Stripe</small></div>
        <div className="mini-kpi" style={{ '--c': 'var(--violeta)' } as React.CSSProperties}><span>Por fora</span><strong><Numero valor={fora} formato={(n) => fmtDinheiro(Math.round(n))} /></strong><small>registrado pelo suporte</small></div>
      </div>
      <section className="cartao">
        <header className="cartao-topo"><h2><Icone nome="dinheiro" tamanho={18} />Pagamentos</h2></header>
        {itens.length === 0
          ? <div className="vazio-grande pequeno"><span className="vazio-icone"><Icone nome="dinheiro" tamanho={26} /></span><strong>Nenhum pagamento ainda</strong><p>Nem Pix do site, nem pagamento por fora. O cartão aparece na aba Cartão e Stripe.</p></div>
          : (
            <ul className="lista-movimentos">
              {itens.map((p, i) => (
                <li key={p.chave} style={{ '--i': Math.min(i, 12) } as React.CSSProperties}>
                  <span className="mov-icone"><Icone nome={p.icone} tamanho={18} /></span>
                  <span className="mov-texto"><b>{p.titulo}</b><small>{fmtData(p.quando)}{p.detalhe && ` · ${p.detalhe}`}</small>{p.alerta && <Etiqueta tom="vermelho">{p.alerta}</Etiqueta>}</span>
                  <strong className="mov-valor">{fmtDinheiro(p.valor, p.moeda)}</strong>
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  )
}

function Historico({ registro }: { registro: FichaDados['registro'] }) {
  return (
    <section className="cartao">
      <header className="cartao-topo"><h2><Icone nome="historico" tamanho={18} />O que o suporte fez aqui</h2></header>
      {registro.length === 0
        ? <p className="vazio-bonito"><Icone nome="check" tamanho={20} />Nenhuma ação nesta conta ainda.</p>
        : (
          <ol className="linha-do-tempo com-icones">
            {registro.map((r) => (
              <li key={r.id}>
                <span className="ponto-icone"><Icone nome={ICONE_DA_ACAO[r.acao] ?? 'check'} tamanho={14} /></span>
                <span className="lt-texto"><b>{NOME_DA_ACAO[r.acao] ?? r.acao}</b></span>
                {r.motivo && <span className="lt-motivo">“{r.motivo}”</span>}
                <span className="lt-quando">{fmtDataHora(r.criado_em)} · {r.admin_email}</span>
              </li>
            ))}
          </ol>
        )}
    </section>
  )
}

function ErrosDaConta({ erros }: { erros: FichaDados['erros'] }) {
  return (
    <section className="cartao">
      <header className="cartao-topo"><h2><Icone nome="inseto" tamanho={18} />Erros desta conta</h2>{erros.length > 0 && <a className="ver-mais pequeno" href="#/erros">Ver todos os erros<Icone nome="seta" tamanho={16} /></a>}</header>
      {erros.length === 0
        ? <p className="vazio-bonito"><Icone nome="check" tamanho={20} />Nenhum erro registrado para esta pessoa.</p>
        : (
          <ul className="lista-movimentos erros-conta">
            {erros.map((e, i) => (
              <li key={e.id} style={{ '--i': Math.min(i, 12) } as React.CSSProperties}>
                <span className="mov-icone"><Icone nome="inseto" tamanho={18} /></span>
                <span className="mov-texto"><b>{e.mensagem}</b><small>{fmtDataHora(e.criado_em)}{e.onde && ` · ${e.onde}`}{e.versao && ` · versão ${e.versao}`}</small></span>
              </li>
            ))}
          </ul>
        )}
    </section>
  )
}

export function Ficha({ id }: { id: string }) {
  const [f, setF] = useState<FichaDados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [janela, setJanela] = useState<Janela | null>(null)
  const [aba, setAba] = useState<Aba>('geral')
  const [copiado, setCopiado] = useState(false)
  const [toast, avisar] = useAviso()
  const [agora, setAgora] = useState(() => Date.now())
  const refAbas = useRef<HTMLDivElement>(null)
  const lente = useLente(refAbas, 'button.ativo', `${aba}|${Boolean(f)}`)

  const carregar = useCallback(() => {
    api<FichaDados>('ficha', { id }).then((d) => { setF(d); setErro(null) }).catch((e) => setErro(mensagemDe(e)))
  }, [id])
  useEffect(carregar, [carregar])

  const terminar = (msg?: string) => {
    setJanela(null)
    setAgora(Date.now())
    if (msg) avisar(msg)
    carregar()
  }

  if (erro) return <ErroNaTela erro={erro} aoTentar={carregar} />
  if (!f) {
    return (
      <div className="pagina ficha" aria-busy="true">
        <div className="esqueleto" style={{ height: 22, width: 90 }} />
        <div className="esqueleto" style={{ height: 230 }} />
        <div className="esqueleto" style={{ height: 46, width: 'min(560px, 100%)' }} />
        <div className="grade-ficha"><div className="esqueleto" style={{ height: 320 }} /><div className="esqueleto" style={{ height: 320 }} /></div>
      </div>
    )
  }

  const a = f.assinatura
  const s = situacao(a?.status ?? 'sem_assinatura', a?.teste_fim, a?.periodo_fim)
  const bloqueada = Boolean(f.conta.bloqueado_ate && new Date(f.conta.bloqueado_ate).getTime() > agora)
  const temStripe = Boolean(a?.stripe_customer_id)
  const nome = f.perfil?.nome
  const nPag = f.pix_stripe.length + f.pagamentos.length
  const abas: [Aba, string, string, number?][] = [
    ['geral', 'Visão geral', 'inicio'],
    ...(temStripe ? [['cartao', 'Cartão e Stripe', 'cartao'] as [Aba, string, string]] : []),
    ['pagamentos', 'Pagamentos', 'dinheiro', nPag],
    ['suporte', 'Anotações e histórico', 'lapis', f.anotacoes.length],
    ['erros', 'Erros', 'inseto', f.erros.length],
  ]
  const copiarEmail = async () => {
    await navigator.clipboard.writeText(f.conta.email)
    setCopiado(true)
    window.setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div className="pagina ficha">
      <a href="#/contas" className="voltar"><Icone nome="esq" tamanho={16} />Contas</a>

      <section className="ficha-heroi" style={{ '--c': corDoTom(s.tom) } as React.CSSProperties}>
        <div className="heroi-aurora" aria-hidden="true"><i /><i /></div>
        <div className="heroi-quem">
          <span className="avatar-heroi">{iniciais(nome || f.conta.email)}</span>
          <div className="heroi-textos">
            <h1>{nome || f.conta.email}</h1>
            <p className="heroi-email">
              {nome && <span>{f.conta.email}</span>}
              <button type="button" className="copiar" onClick={() => void copiarEmail()} aria-label="Copiar e-mail">
                <Icone nome={copiado ? 'check' : 'copiar'} tamanho={14} />{copiado ? 'Copiado' : 'Copiar e-mail'}
              </button>
            </p>
            <div className="etiquetas">
              <Etiqueta tom={s.tom}>{s.texto}</Etiqueta>
              {bloqueada && <Etiqueta tom="vermelho">Bloqueada</Etiqueta>}
              {!f.conta.confirmado_em && <Etiqueta tom="amarelo">E-mail não confirmado</Etiqueta>}
              {f.conta.admin && <Etiqueta tom="violeta">Administrador</Etiqueta>}
            </div>
          </div>
        </div>
        <dl className="heroi-dados">
          <div><dt><Icone nome="calendario" tamanho={15} />Cadastro</dt><dd>{fmtData(f.conta.criado_em)}<small>{haQuanto(f.conta.criado_em)}</small></dd></div>
          <div><dt><Icone nome="relogio" tamanho={15} />Último acesso</dt><dd>{haQuanto(f.conta.ultimo_acesso)}<small>{f.conta.ultimo_acesso ? fmtDataHora(f.conta.ultimo_acesso) : 'nunca entrou'}</small></dd></div>
          <div><dt><Icone nome="pessoa" tamanho={15} />Aparelhos</dt><dd>{f.conta.sessoes}<small>com login ativo</small></dd></div>
          <div><dt><Icone nome="globo" tamanho={15} />Moeda</dt><dd>{f.perfil?.moeda ?? '—'}<small>{f.perfil?.onboarding_em ? 'fez as perguntas iniciais' : 'não terminou as perguntas'}</small></dd></div>
        </dl>
      </section>

      <div ref={refAbas} className="abas-ficha" role="tablist" aria-label="Partes da ficha">
        {lente && <span className="lente" aria-hidden="true" style={estiloLente(lente)} />}
        {abas.map(([v, nomeAba, icone, n]) => (
          <button key={v} type="button" role="tab" aria-selected={aba === v} className={`aba-ficha ${aba === v ? 'ativo' : ''}`} onClick={() => setAba(v)}>
            <Icone nome={icone} tamanho={16} />{nomeAba}{n ? <b>{n}</b> : null}
          </button>
        ))}
      </div>

      <div key={aba} className="ficha-conteudo">
        {aba === 'geral' && (
          <>
            <div className="grade-ficha">
              <Acesso f={f} aoAbrir={setJanela} />
              <Login f={f} bloqueada={bloqueada} aoAbrir={setJanela} />
            </div>
            {!f.conta.admin && (
              <section className="cartao zona-perigo">
                <span className="zona-icone"><Icone nome="lixeira" tamanho={20} /></span>
                <div><h2>Excluir conta</h2><p>Apaga o login e todos os dados da pessoa e cancela a cobrança no cartão. Não tem volta.</p></div>
                <button className="botao perigo" onClick={() => setJanela('excluir')}>Excluir esta conta</button>
              </section>
            )}
          </>
        )}
        {aba === 'cartao' && temStripe && <CartaoStripe id={id} email={f.conta.email} aoMudar={carregar} avisar={avisar} />}
        {aba === 'pagamentos' && <Pagamentos f={f} />}
        {aba === 'suporte' && (
          <div className="grade-ficha">
            <Anotacoes id={id} anotacoes={f.anotacoes} aoSalvar={() => { avisar('Anotação salva.'); carregar() }} />
            <Historico registro={f.registro} />
          </div>
        )}
        {aba === 'erros' && <ErrosDaConta erros={f.erros} />}
      </div>

      {janela === 'liberar' && <Liberar f={f} aoFechar={() => setJanela(null)} aoTerminar={terminar} />}
      {janela === 'teste' && <EstenderTeste f={f} aoFechar={() => setJanela(null)} aoTerminar={terminar} />}
      {janela === 'revogar' && (
        <AcaoComMotivo titulo="Tirar o acesso" texto={`${f.conta.email} volta para a tela de assinatura na hora. Pagamentos registrados continuam guardados.`}
          botao="Tirar acesso" perigo aoFechar={() => setJanela(null)} aoTerminar={terminar}
          executar={async (motivo) => { await api('acesso', { id, tipo: 'revogar', motivo }); return 'Acesso retirado.' }} />
      )}
      {janela === 'senha_email' && (
        <AcaoSimples titulo="Mandar e-mail de senha nova" botao="Mandar e-mail" aoFechar={() => setJanela(null)} aoTerminar={terminar}
          texto={`Vai para ${f.conta.email} o mesmo e-mail do "Esqueci minha senha". A pessoa cria a senha nova sozinha: ninguém do suporte vê ou escolhe a senha.`}
          executar={async () => { await api('senha_email', { id }); return 'E-mail de senha nova enviado.' }} />
      )}
      {janela === 'senha_link' && <LinkDeSenha id={id} email={f.conta.email} aoFechar={() => setJanela(null)} aoTerminar={terminar} />}
      {janela === 'reenviar_confirmacao' && (
        <AcaoSimples titulo="Reenviar confirmação" botao="Reenviar e-mail" aoFechar={() => setJanela(null)} aoTerminar={terminar}
          texto={`Manda de novo para ${f.conta.email} o e-mail de confirmar a conta.`}
          executar={async () => { await api('reenviar_confirmacao', { id }); return 'Confirmação reenviada.' }} />
      )}
      {janela === 'confirmar_email' && (
        <AcaoComMotivo titulo="Confirmar o e-mail sem o link" botao="Confirmar e-mail" aoFechar={() => setJanela(null)} aoTerminar={terminar}
          texto="Use só quando tiver certeza de que o e-mail é da pessoa (ela falou com você por ele, por exemplo)."
          executar={async (motivo) => { await api('confirmar_email', { id, motivo }); return 'E-mail confirmado.' }} />
      )}
      {janela === 'trocar_email' && <TrocarEmail id={id} atual={f.conta.email} aoFechar={() => setJanela(null)} aoTerminar={terminar} />}
      {janela === 'encerrar_sessoes' && (
        <AcaoSimples titulo="Desconectar de todos os aparelhos" botao="Desconectar" aoFechar={() => setJanela(null)} aoTerminar={terminar}
          texto="A pessoa precisa entrar de novo em todos os aparelhos (pode levar até uma hora para cair em todos). Útil se ela perdeu o celular."
          executar={async () => { await api('encerrar_sessoes', { id }); return 'Desconectada de todos os aparelhos.' }} />
      )}
      {janela === 'bloquear' && (
        <AcaoComMotivo titulo="Bloquear a conta" botao="Bloquear" perigo aoFechar={() => setJanela(null)} aoTerminar={terminar}
          texto="A pessoa não consegue mais entrar até você desbloquear. Os dados continuam guardados."
          executar={async (motivo) => { await api('bloquear', { id, motivo }); return 'Conta bloqueada.' }} />
      )}
      {janela === 'desbloquear' && (
        <AcaoComMotivo titulo="Desbloquear a conta" botao="Desbloquear" aoFechar={() => setJanela(null)} aoTerminar={terminar}
          texto="A pessoa volta a conseguir entrar."
          executar={async (motivo) => { await api('desbloquear', { id, motivo }); return 'Conta desbloqueada.' }} />
      )}
      {janela === 'excluir' && <Excluir id={id} email={f.conta.email} aoFechar={() => setJanela(null)} />}
      {toast}
    </div>
  )
}

type PropsJanela = { aoFechar: () => void; aoTerminar: (msg?: string) => void }

function AcaoSimples({ titulo, texto, botao, executar, aoFechar, aoTerminar }: PropsJanela & {
  titulo: string; texto: string; botao: string; executar: () => Promise<string>
}) {
  return (
    <Modal titulo={titulo} aoFechar={aoFechar}>
      <FormularioDeAcao textoBotao={botao} executar={executar} aoTerminar={aoTerminar}>
        <p>{texto}</p>
      </FormularioDeAcao>
    </Modal>
  )
}

function AcaoComMotivo({ titulo, texto, botao, perigo, executar, aoFechar, aoTerminar }: PropsJanela & {
  titulo: string; texto: string; botao: string; perigo?: boolean; executar: (motivo: string) => Promise<string>
}) {
  const [motivo, setMotivo] = useState('')
  return (
    <Modal titulo={titulo} aoFechar={aoFechar}>
      <FormularioDeAcao textoBotao={botao} perigo={perigo} pode={motivo.trim().length > 0} executar={() => executar(motivo)} aoTerminar={aoTerminar}>
        <p>{texto}</p>
        <CampoMotivo valor={motivo} aoMudar={setMotivo} />
      </FormularioDeAcao>
    </Modal>
  )
}

/** Liberar acesso: 15 ou 30 dias, outra quantidade, até uma data ou vitalício, com o pagamento recebido (se houver). */
function Liberar({ f, aoFechar, aoTerminar }: PropsJanela & { f: FichaDados }) {
  type Opcao = '15' | '30' | 'outro' | 'ate' | 'vitalicio'
  const [opcao, setOpcao] = useState<Opcao>('30')
  const [outros, setOutros] = useState('60')
  const [ate, setAte] = useState('')
  const [motivo, setMotivo] = useState('')
  const [pagou, setPagou] = useState(true)
  const [valor, setValor] = useState('9,99')
  const [forma, setForma] = useState('pix')
  const [pagoEm, setPagoEm] = useState(hojeISO())
  const [obs, setObs] = useState('')

  const a = f.assinatura
  const dias = opcao === '15' ? 15 : opcao === '30' ? 30 : opcao === 'outro' ? Math.floor(Number(outros)) : 0
  // a mesma conta do banco (adm_mudar_acesso): soma ao que sobrou do acesso por prazo ou do teste grátis
  const agora = useAgora()
  const base = Math.max(agora,
    a?.status === 'pix' && a.periodo_fim ? new Date(a.periodo_fim).getTime() : 0,
    a?.status === 'teste' && a.teste_fim ? new Date(a.teste_fim).getTime() : 0)
  const fim = opcao === 'vitalicio' ? null : opcao === 'ate' ? (ate ? new Date(`${ate}T23:59:59`) : null) : new Date(base + dias * DIA)
  const centavos = paraCentavos(valor)
  const diasOk = opcao !== 'outro' || (Number.isInteger(dias) && dias >= 1 && dias <= 3650)
  const ateOk = opcao !== 'ate' || Boolean(fim && fim.getTime() > agora)
  const pode = motivo.trim().length > 0 && diasOk && ateOk && (!pagou || centavos !== null)
  const somou = base > agora && (opcao === '15' || opcao === '30' || opcao === 'outro')

  return (
    <Modal titulo="Liberar acesso" aoFechar={aoFechar} largo>
      <FormularioDeAcao textoBotao="Liberar acesso" pode={pode} aoTerminar={aoTerminar} executar={async () => {
        await api('acesso', {
          id: f.conta.id,
          tipo: opcao === 'vitalicio' ? 'vitalicio' : opcao === 'ate' ? 'ate' : 'dias',
          dias: opcao === 'vitalicio' || opcao === 'ate' ? undefined : dias,
          ate: opcao === 'ate' ? fim!.toISOString() : undefined,
          motivo,
          pagamento: pagou ? { valor: centavos, forma, pago_em: pagoEm, observacao: obs } : undefined,
        })
        return opcao === 'vitalicio' ? 'Acesso vitalício liberado.' : `Acesso liberado até ${fmtData(fim!.toISOString())}.`
      }}>
        <fieldset className="opcoes-azulejo">
          <legend>Por quanto tempo</legend>
          {([['15', '15 dias', 'calendario'], ['30', '30 dias', 'calendario'], ['outro', 'Outros dias', 'mais'], ['ate', 'Até uma data', 'relogio'], ['vitalicio', 'Vitalício', 'infinito']] as const).map(([v, nome, icone]) => (
            <label key={v} className={`opcao-azulejo ${opcao === v ? 'ativo' : ''}`}>
              <input type="radio" name="tempo" checked={opcao === v} onChange={() => setOpcao(v)} />
              <Icone nome={icone} tamanho={20} /><span>{nome}</span>
            </label>
          ))}
        </fieldset>
        {opcao === 'outro' && (
          <label className="campo curto"><span>Dias</span>
            <input type="number" min={1} max={3650} value={outros} onChange={(e) => setOutros(e.target.value)} required />
          </label>
        )}
        {opcao === 'ate' && (
          <label className="campo curto"><span>Até o fim do dia</span>
            <input type="date" min={hojeISO()} value={ate} onChange={(e) => setAte(e.target.value)} required />
          </label>
        )}
        <p className="previa">
          {opcao === 'vitalicio'
            ? 'Fica liberado para sempre, sem cobrança.'
            : fim && diasOk && ateOk ? <>Fica liberado até <strong>{fmtDataHora(fim.toISOString())}</strong>{somou && ' (somado ao que ainda sobrava)'}.</> : 'Escolha o prazo.'}
          {' '}No OpusCash a pessoa vê "Acesso por Pix até…", com o botão de renovar pelo Pix do site.
        </p>
        <CampoMotivo valor={motivo} aoMudar={setMotivo} dica="Ex.: pagou Pix direto na conta em 12/11" />
        <label className="opcao">
          <input type="checkbox" checked={pagou} onChange={(e) => setPagou(e.target.checked)} /> Recebi um pagamento por isto
        </label>
        {pagou && (
          <div className="linha-campos">
            <label className="campo"><span>Valor (R$)</span>
              <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} required />
            </label>
            <label className="campo"><span>Forma</span>
              <select value={forma} onChange={(e) => setForma(e.target.value)}>
                {FORMAS.map(([v, nome]) => <option key={v} value={v}>{nome}</option>)}
              </select>
            </label>
            <label className="campo"><span>Pago em</span>
              <input type="date" max={hojeISO()} value={pagoEm} onChange={(e) => setPagoEm(e.target.value)} required />
            </label>
            <label className="campo inteiro"><span>Observação <small>(opcional)</small></span>
              <input value={obs} onChange={(e) => setObs(e.target.value)} maxLength={500} placeholder="Ex.: Pix de Fulano, banco X" />
            </label>
          </div>
        )}
      </FormularioDeAcao>
    </Modal>
  )
}

function EstenderTeste({ f, aoFechar, aoTerminar }: PropsJanela & { f: FichaDados }) {
  const [dias, setDias] = useState('7')
  const [motivo, setMotivo] = useState('')
  const n = Math.floor(Number(dias))
  const a = f.assinatura
  const agora = useAgora()
  const base = Math.max(agora, a?.status === 'teste' && a.teste_fim ? new Date(a.teste_fim).getTime() : 0)
  const ok = Number.isInteger(n) && n >= 1 && n <= 365
  return (
    <Modal titulo="Estender o teste grátis" aoFechar={aoFechar}>
      <FormularioDeAcao textoBotao="Estender teste" pode={ok && motivo.trim().length > 0} aoTerminar={aoTerminar}
        executar={async () => { await api('acesso', { id: f.conta.id, tipo: 'teste', dias: n, motivo }); return `Teste grátis até ${fmtData(new Date(base + n * DIA).toISOString())}.` }}>
        <label className="campo curto"><span>Mais quantos dias</span>
          <input type="number" min={1} max={365} value={dias} onChange={(e) => setDias(e.target.value)} required />
        </label>
        {ok && <p className="previa">O teste vai até <strong>{fmtDataHora(new Date(base + n * DIA).toISOString())}</strong>.</p>}
        <CampoMotivo valor={motivo} aoMudar={setMotivo} />
      </FormularioDeAcao>
    </Modal>
  )
}

function LinkDeSenha({ id, email, aoFechar, aoTerminar }: PropsJanela & { id: string; email: string }) {
  const [motivo, setMotivo] = useState('')
  const [link, setLink] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  if (link) {
    return (
      <Modal titulo="Link de senha nova" aoFechar={() => aoTerminar()}>
        <p>Mande este link só para {email}, por um canal em que você tem certeza de que é a pessoa. Ele vale uma vez e expira em pouco tempo.</p>
        <textarea className="link-gerado" readOnly value={link} rows={4} onFocus={(e) => e.currentTarget.select()} />
        <div className="form-botoes">
          <button className="botao principal" onClick={async () => { await navigator.clipboard.writeText(link); setCopiado(true) }}>
            {copiado ? 'Copiado' : 'Copiar link'}
          </button>
        </div>
      </Modal>
    )
  }
  return (
    <Modal titulo="Gerar link de senha nova" aoFechar={aoFechar}>
      <FormularioDeAcao textoBotao="Gerar link" pode={motivo.trim().length > 0} aoTerminar={() => {}}
        executar={async () => { const r = await api<{ link: string }>('senha_link', { id, motivo }); setLink(r.link) }}>
        <p>Para quando o e-mail não chega: o painel gera o link e você manda pelo WhatsApp. A pessoa abre e cria a senha nova sozinha.</p>
        <CampoMotivo valor={motivo} aoMudar={setMotivo} dica="Ex.: e-mail não chega, pediu pelo WhatsApp" />
      </FormularioDeAcao>
    </Modal>
  )
}

function TrocarEmail({ id, atual, aoFechar, aoTerminar }: PropsJanela & { id: string; atual: string }) {
  const [email, setEmail] = useState('')
  const [motivo, setMotivo] = useState('')
  return (
    <Modal titulo="Trocar o e-mail da conta" aoFechar={aoFechar}>
      <FormularioDeAcao textoBotao="Trocar e-mail" pode={email.includes('@') && motivo.trim().length > 0} aoTerminar={aoTerminar}
        executar={async () => { await api('trocar_email', { id, email, motivo }); return 'E-mail trocado.' }}>
        <p>Para quem perdeu o acesso a <strong>{atual}</strong>. A conta passa a entrar pelo e-mail novo na hora, já confirmado. Faça isso só depois de ter certeza de que é a dona da conta.</p>
        <label className="campo"><span>E-mail novo</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <CampoMotivo valor={motivo} aoMudar={setMotivo} dica="Ex.: perdeu o e-mail antigo; confirmou o CPF do Pix" />
      </FormularioDeAcao>
    </Modal>
  )
}

function Excluir({ id, email, aoFechar }: { id: string; email: string; aoFechar: () => void }) {
  const [confirmar, setConfirmar] = useState('')
  const [motivo, setMotivo] = useState('')
  return (
    <Modal titulo="Excluir a conta" aoFechar={aoFechar}>
      <FormularioDeAcao textoBotao="Excluir para sempre" perigo pode={confirmar.trim().toLowerCase() === email.toLowerCase() && motivo.trim().length > 0}
        aoTerminar={() => { location.hash = '#/contas' }}
        executar={async () => { await api('excluir', { id, confirmar, motivo }) }}>
        <p>Apaga o login e <strong>todos os dados</strong> de {email} e cancela a assinatura no cartão. Não tem volta.</p>
        <label className="campo"><span>Digite o e-mail da conta para confirmar</span>
          <input value={confirmar} onChange={(e) => setConfirmar(e.target.value)} autoComplete="off" required />
        </label>
        <CampoMotivo valor={motivo} aoMudar={setMotivo} dica="Ex.: pediu a exclusão por e-mail em 12/11" />
      </FormularioDeAcao>
    </Modal>
  )
}

function Anotacoes({ id, anotacoes, aoSalvar }: { id: string; anotacoes: FichaDados['anotacoes']; aoSalvar: () => void }) {
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  return (
    <section className="cartao">
      <header className="cartao-topo"><h2><Icone nome="lapis" tamanho={18} />Anotações do suporte</h2></header>
      <form className="anotar" onSubmit={async (e) => {
        e.preventDefault()
        if (!texto.trim()) return
        setSalvando(true)
        setErro(null)
        try {
          await api('anotar', { id, texto })
          setTexto('')
          aoSalvar()
        } catch (err) {
          setErro(mensagemDe(err))
        }
        setSalvando(false)
      }}>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} maxLength={2000}
          placeholder="Ex.: falou comigo no WhatsApp, prometeu pagar dia 15" aria-label="Nova anotação"
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) e.currentTarget.form?.requestSubmit() }} />
        {erro && <p className="aviso-erro" role="alert">{erro}</p>}
        <div className="anotar-pe">
          <small>{texto.length > 0 ? `${texto.length}/2000 · Ctrl+Enter salva` : 'Só o suporte vê'}</small>
          <button className="botao principal" disabled={salvando || !texto.trim()}><Icone nome="enviar" tamanho={16} />{salvando ? 'Salvando…' : 'Salvar anotação'}</button>
        </div>
      </form>
      {anotacoes.length === 0
        ? <p className="vazio-bonito"><Icone nome="lapis" tamanho={20} />Nenhuma anotação ainda.</p>
        : (
          <ul className="baloes">
            {anotacoes.map((n, i) => (
              <li key={n.id} style={{ '--i': Math.min(i, 10) } as React.CSSProperties}>
                <span className="avatar pequeno" aria-hidden="true">{iniciais(n.admin_email ?? '?')}</span>
                <div className="balao">
                  <p>{n.texto}</p>
                  <small>{n.admin_email ? `${n.admin_email.split('@')[0]} · ` : ''}{haQuanto(n.criado_em)} · {fmtDataHora(n.criado_em)}</small>
                </div>
              </li>
            ))}
          </ul>
        )}
    </section>
  )
}
