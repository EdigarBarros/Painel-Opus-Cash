import { useCallback, useEffect, useState } from 'react'
import { api, mensagemDe } from '../lib/api'
import { fmtData, fmtDataHora, fmtDinheiro } from '../lib/formato'
import { Icone } from '../pecas/Icone'
import { CampoMotivo, Carregando, Etiqueta, FormularioDeAcao, Modal } from '../ui'

type Cartao = { bandeira: string; final: string; validade: string } | null
interface DadosStripe {
  cliente: { id: string; email: string | null; criado: string | null; cartao: Cartao } | null
  apagado?: boolean
  assinatura?: {
    id: string; status: string; criada: string | null; fim_periodo: string | null; teste_fim: string | null
    cancela_no_fim: boolean; cancela_em: string | null; cancelada_em: string | null; cartao: Cartao
  } | null
  faturas?: { id: string; numero: string | null; status: string; valor: number; pago: number; moeda: string; criada: string | null
    link: string | null; tentativas: number; proxima_tentativa: string | null }[]
  cobrancas?: { id: string; valor: number; reembolsado: number; moeda: string; status: string; criada: string | null
    tipo: string | null; final: string | null; bandeira: string | null; falha: string | null; recibo: string | null; descricao: string | null }[]
}

const SITUACAO: Record<string, [string, 'verde' | 'azul' | 'amarelo' | 'vermelho' | 'cinza']> = {
  active: ['Em dia', 'verde'],
  trialing: ['Em dias grátis no cartão', 'azul'],
  past_due: ['Cobrança recusada: o Stripe está tentando de novo', 'amarelo'],
  unpaid: ['Não paga: o Stripe desistiu de cobrar', 'vermelho'],
  incomplete: ['Primeiro pagamento não concluído', 'vermelho'],
  incomplete_expired: ['Expirou sem pagar', 'cinza'],
  paused: ['Pausada', 'cinza'],
  canceled: ['Cancelada', 'cinza'],
}
const BANDEIRA: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex', elo: 'Elo', hipercard: 'Hipercard', diners: 'Diners' }
const nomeCartao = (c: Cartao) => (c ? `${BANDEIRA[c.bandeira] ?? c.bandeira} •••• ${c.final} (vence ${c.validade})` : 'nenhum cartão salvo')
const COR_BANDEIRA: Record<string, string> = { visa: '#1a3fd6', mastercard: '#d9480f', amex: '#0f7ac2', elo: '#222a3a', hipercard: '#b3141b', diners: '#3a4a63' }

/** Chip dourado do cartão (o mesmo do CartaoIlustrado do OpusCash). */
function Chip() {
  return (
    <svg className="cc-chip" width={38} height={29} viewBox="0 0 38 29" aria-hidden="true">
      <defs>
        <linearGradient id="cc-ouro" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbe7a6" /><stop offset=".5" stopColor="#d6ad4f" /><stop offset="1" stopColor="#f2d589" />
        </linearGradient>
      </defs>
      <rect x=".5" y=".5" width="37" height="28" rx="6" fill="url(#cc-ouro)" stroke="rgba(120,85,20,.45)" />
      <path d="M13 .5v28M25 .5v28M.5 10h12.5M25 10h12.5M.5 19h12.5M25 19h12.5M13 14.5h12" stroke="rgba(120,85,20,.5)" fill="none" />
    </svg>
  )
}

/** O cartão salvo desenhado como um cartão de verdade, que inclina de leve seguindo o mouse. */
function Plastico({ cartao, email }: { cartao: Cartao; email: string }) {
  const cor = cartao ? COR_BANDEIRA[cartao.bandeira] ?? '#334155' : '#475569'
  const mexer = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height
    e.currentTarget.style.setProperty('--ry', `${(x - 0.5) * 14}deg`)
    e.currentTarget.style.setProperty('--rx', `${(0.5 - y) * 12}deg`)
    e.currentTarget.style.setProperty('--mx', `${x * 100}%`)
    e.currentTarget.style.setProperty('--my', `${y * 100}%`)
  }
  const soltar = (e: React.PointerEvent<HTMLDivElement>) => { ['--rx', '--ry', '--mx', '--my'].forEach((v) => e.currentTarget.style.removeProperty(v)) }
  return (
    <div className="cc-plastico" style={{ '--c': cor } as React.CSSProperties} onPointerMove={mexer} onPointerLeave={soltar} aria-label={nomeCartao(cartao)}>
      <span className="cc-brilho" aria-hidden="true" />
      <div className="cc-plastico-topo"><strong>{cartao ? BANDEIRA[cartao.bandeira] ?? cartao.bandeira : 'Sem cartão'}</strong><span className="cc-tipo">crédito</span></div>
      <div className="cc-plastico-meio"><Chip /><span className="cc-numero">•••• •••• •••• {cartao?.final ?? '••••'}</span></div>
      <div className="cc-plastico-pe"><span className="cc-plastico-rodape">{email}</span><span className="cc-plastico-rodape">{cartao ? `vence ${cartao.validade}` : ''}</span></div>
    </div>
  )
}

const VIVA = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']

type Janela =
  | { tipo: 'cancelar_fim' | 'desfazer_cancelamento' | 'cancelar_agora' | 'link_cartao' | 'dias_gratis' }
  | { tipo: 'cobrar_de_novo'; fatura: string; valor: string }
  | { tipo: 'reembolsar'; cobranca: string; valor: string }

/** Tudo o que o Stripe sabe da conta, com as ações de suporte (cada uma com motivo e registro). */
export function CartaoStripe({ id, email, aoMudar, avisar }: { id: string; email: string; aoMudar: () => void; avisar: (m: string) => void }) {
  const [d, setD] = useState<DadosStripe | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [janela, setJanela] = useState<Janela | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)

  const carregar = useCallback(() => {
    api<DadosStripe>('stripe', { id }).then((r) => { setD(r); setErro(null) }).catch((e) => setErro(mensagemDe(e)))
  }, [id])
  useEffect(carregar, [carregar])

  const terminar = (msg?: string) => {
    setJanela(null)
    if (msg) avisar(msg)
    carregar()
    aoMudar()
  }
  const copiar = async (texto: string, chave: string) => {
    await navigator.clipboard.writeText(texto)
    setCopiado(chave)
    window.setTimeout(() => setCopiado(null), 2500)
  }

  const painelStripe = d?.cliente ? `https://dashboard.stripe.com/customers/${d.cliente.id}` : null
  const s = d?.assinatura
  const viva = Boolean(s && VIVA.includes(s.status))
  const aberta = d?.faturas?.find((f) => f.status === 'open') ?? null

  return (
    <section className="cartao stripe">
      <header className="cartao-topo">
        <h2><Icone nome="cartao" tamanho={18} />Stripe (cartão e Pix do site)</h2>
        {painelStripe && <a className="ver-mais pequeno" href={painelStripe} target="_blank" rel="noreferrer">Abrir no Stripe<Icone nome="exportar" tamanho={15} /></a>}
      </header>
      {erro && <p className="aviso-erro" role="alert">{erro} <button className="link" onClick={carregar}>Tentar de novo</button></p>}
      {!erro && !d && <Carregando texto="Lendo o Stripe…" />}
      {d && !d.cliente && <p className="vazio">{d.apagado ? 'O cadastro desta conta foi apagado no Stripe.' : 'Esta conta nunca abriu o pagamento: não tem cadastro no Stripe.'}</p>}
      {d?.cliente && (
        <>
          <div className="grade-stripe">
            <div className="stripe-assinatura">
              <Plastico cartao={s?.cartao ?? d.cliente.cartao} email={email} />
              <h3>Assinatura no cartão</h3>
              {!s
                ? <p className="vazio">Nunca assinou no cartão.</p>
                : (
                  <dl className="dados">
                    <dt>Situação</dt><dd><Etiqueta tom={SITUACAO[s.status]?.[1] ?? 'cinza'}>{SITUACAO[s.status]?.[0] ?? s.status}</Etiqueta></dd>
                    <dt>Assinou em</dt><dd>{fmtData(s.criada)}</dd>
                    {s.status === 'trialing' && s.teste_fim && <><dt>Próxima cobrança</dt><dd>{fmtDataHora(s.teste_fim)}</dd></>}
                    {['active', 'past_due'].includes(s.status) && s.fim_periodo && (
                      <><dt>{s.cancela_no_fim ? 'Acesso até' : 'Próxima cobrança'}</dt><dd>{fmtDataHora(s.fim_periodo)}</dd></>
                    )}
                    {s.cancela_no_fim && <><dt>Cancelamento</dt><dd>marcado para o fim do período</dd></>}
                    {s.cancelada_em && s.status === 'canceled' && <><dt>Cancelada em</dt><dd>{fmtDataHora(s.cancelada_em)}</dd></>}
                    <dt>Cartão</dt><dd>{nomeCartao(s.cartao ?? d.cliente.cartao)}</dd>
                  </dl>
                )}
            </div>
            {aberta && (
              <div className="fatura-aberta">
                <h3><Icone nome="alerta" tamanho={16} />Fatura em aberto</h3>
                <dl className="dados">
                  <dt>Valor</dt><dd><strong>{fmtDinheiro(aberta.valor, aberta.moeda)}</strong></dd>
                  <dt>Criada em</dt><dd>{fmtData(aberta.criada)}</dd>
                  <dt>Tentativas</dt><dd>{aberta.tentativas}</dd>
                  <dt>Próxima tentativa</dt><dd>{aberta.proxima_tentativa ? fmtDataHora(aberta.proxima_tentativa) : 'o Stripe não vai tentar de novo sozinho'}</dd>
                </dl>
                <div className="acoes">
                  <button className="botao principal" onClick={() => setJanela({ tipo: 'cobrar_de_novo', fatura: aberta.id, valor: fmtDinheiro(aberta.valor, aberta.moeda) })}>Tentar cobrar de novo</button>
                  {aberta.link && <button className="botao" onClick={() => void copiar(aberta.link!, 'fatura')}>{copiado === 'fatura' ? 'Link copiado' : 'Copiar link para pagar a fatura'}</button>}
                </div>
                <p className="nota">Pelo link a pessoa paga esta fatura com outro cartão, sem precisar entrar no OpusCash.</p>
              </div>
            )}
          </div>

          <div className="acoes">
            {viva && !s!.cancela_no_fim && <button className="botao" onClick={() => setJanela({ tipo: 'cancelar_fim' })}>Cancelar no fim do período</button>}
            {viva && s!.cancela_no_fim && <button className="botao" onClick={() => setJanela({ tipo: 'desfazer_cancelamento' })}>Desfazer o cancelamento</button>}
            {viva && <button className="botao perigo-leve" onClick={() => setJanela({ tipo: 'cancelar_agora' })}>Cancelar agora</button>}
            {s && ['active', 'trialing'].includes(s.status) && <button className="botao" onClick={() => setJanela({ tipo: 'dias_gratis' })}>Dar dias grátis no cartão</button>}
            <button className="botao" onClick={() => setJanela({ tipo: 'link_cartao' })}>Gerar link para trocar o cartão</button>
          </div>

          <h3>Cobranças</h3>
          {!d.cobrancas?.length
            ? <p className="vazio">Nenhuma cobrança ainda.</p>
            : (
              <ul className="lista-movimentos">
                {d.cobrancas.map((c, i) => {
                  const total = c.reembolsado >= c.valor && c.valor > 0
                  const forma = c.tipo === 'pix' ? 'Pix' : c.final ? `${BANDEIRA[c.bandeira ?? ''] ?? 'Cartão'} •••• ${c.final}` : (c.tipo ?? '—')
                  const estado = c.status === 'failed' ? 'recusada' : c.status === 'pending' ? 'aguardando' : total || c.reembolsado > 0 ? 'reembolsada' : 'paga'
                  return (
                    <li key={c.id} className={`cobranca ${estado}`} style={{ '--i': Math.min(i, 12) } as React.CSSProperties}>
                      <span className="mov-icone"><Icone nome={estado === 'recusada' ? 'fechar' : estado === 'aguardando' ? 'relogio' : estado === 'reembolsada' ? 'desfazer' : 'check'} tamanho={17} /></span>
                      <span className="mov-texto">
                        <b>{forma}</b>
                        <small>
                          {fmtDataHora(c.criada)} · {c.status === 'failed' ? `Recusada${c.falha ? `: ${c.falha}` : ''}` : c.status === 'pending' ? 'Aguardando' : total ? 'Reembolsada' : c.reembolsado > 0 ? `Paga, ${fmtDinheiro(c.reembolsado, c.moeda)} reembolsado` : 'Paga'}
                          {c.recibo && <> · <a href={c.recibo} target="_blank" rel="noreferrer">recibo</a></>}
                        </small>
                      </span>
                      <strong className="mov-valor">{fmtDinheiro(c.valor, c.moeda)}</strong>
                      {c.status === 'succeeded' && !total && (
                        <button className="botao pequeno perigo-leve" onClick={() => setJanela({ tipo: 'reembolsar', cobranca: c.id, valor: fmtDinheiro(c.valor - c.reembolsado, c.moeda) })}>Reembolsar</button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
        </>
      )}

      {janela && <JanelaStripe id={id} email={email} janela={janela} fimPeriodo={s?.fim_periodo ?? null} aoFechar={() => setJanela(null)} aoTerminar={terminar} />}
    </section>
  )
}

function JanelaStripe({ id, email, janela, fimPeriodo, aoFechar, aoTerminar }: {
  id: string; email: string; janela: Janela; fimPeriodo: string | null; aoFechar: () => void; aoTerminar: (m?: string) => void
}) {
  const [motivo, setMotivo] = useState('')
  const [dias, setDias] = useState('30')
  const [liberar, setLiberar] = useState(false)
  const [diasLiberar, setDiasLiberar] = useState('30')
  const [link, setLink] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const n = Math.floor(Number(dias))
  const nLiberar = Math.floor(Number(diasLiberar))
  const acao = (extra: Record<string, unknown> = {}) => api<Record<string, unknown>>('stripe_acao', { id, tipo: janela.tipo, motivo, ...extra })
  const temMotivo = motivo.trim().length > 0

  if (link) {
    return (
      <Modal titulo="Link para trocar o cartão" aoFechar={() => aoTerminar()}>
        <p>Mande para {email} agora: o link vale por pouco tempo. Pela página do Stripe a pessoa troca o cartão e paga o que estiver em aberto.</p>
        <textarea className="link-gerado" readOnly value={link} rows={3} onFocus={(e) => e.currentTarget.select()} />
        <div className="form-botoes">
          <button className="botao principal" onClick={async () => { await navigator.clipboard.writeText(link); setCopiado(true) }}>{copiado ? 'Copiado' : 'Copiar link'}</button>
        </div>
      </Modal>
    )
  }

  switch (janela.tipo) {
    case 'cancelar_fim':
      return (
        <Modal titulo="Cancelar no fim do período" aoFechar={aoFechar}>
          <FormularioDeAcao textoBotao="Cancelar no fim do período" pode={temMotivo} aoTerminar={aoTerminar}
            executar={async () => { await acao(); return 'Assinatura vai acabar no fim do período.' }}>
            <p>O cartão não é mais cobrado. A pessoa continua com acesso até {fimPeriodo ? fmtDataHora(fimPeriodo) : 'o fim do período pago'} e depois volta para a tela de assinatura.</p>
            <CampoMotivo valor={motivo} aoMudar={setMotivo} dica="Ex.: pediu para cancelar pelo WhatsApp" />
          </FormularioDeAcao>
        </Modal>
      )
    case 'desfazer_cancelamento':
      return (
        <Modal titulo="Desfazer o cancelamento" aoFechar={aoFechar}>
          <FormularioDeAcao textoBotao="Desfazer o cancelamento" pode={temMotivo} aoTerminar={aoTerminar}
            executar={async () => { await acao(); return 'A assinatura volta a renovar sozinha.' }}>
            <p>A assinatura volta a renovar todo mês no cartão.</p>
            <CampoMotivo valor={motivo} aoMudar={setMotivo} dica="Ex.: mudou de ideia e pediu para continuar" />
          </FormularioDeAcao>
        </Modal>
      )
    case 'cancelar_agora': {
      const podeLiberar = !liberar || (Number.isInteger(nLiberar) && nLiberar >= 1 && nLiberar <= 3650)
      return (
        <Modal titulo="Cancelar a assinatura agora" aoFechar={aoFechar}>
          <FormularioDeAcao textoBotao={liberar ? 'Cancelar e liberar' : 'Cancelar agora'} perigo pode={temMotivo && podeLiberar} aoTerminar={aoTerminar}
            executar={async () => {
              await acao()
              if (!liberar) return 'Assinatura cancelada.'
              await api('acesso', { id, tipo: 'dias', dias: nLiberar, motivo: `${motivo} (depois de cancelar o cartão)` })
              return `Assinatura cancelada e acesso liberado por ${nLiberar} dias.`
            }}>
            <p>O cartão para de ser cobrado e o acesso pelo cartão acaba na hora. Fatura em aberto deixa de ser cobrada. Não há reembolso automático: se precisar, reembolse a cobrança na lista.</p>
            <label className="opcao">
              <input type="checkbox" checked={liberar} onChange={(e) => setLiberar(e.target.checked)} /> Em seguida, liberar dias de acesso (ex.: a pessoa pagou por Pix)
            </label>
            {liberar && (
              <label className="campo curto"><span>Dias de acesso</span>
                <input type="number" min={1} max={3650} value={diasLiberar} onChange={(e) => setDiasLiberar(e.target.value)} required />
              </label>
            )}
            <CampoMotivo valor={motivo} aoMudar={setMotivo} dica="Ex.: cartão recusado, vai pagar por Pix" />
          </FormularioDeAcao>
        </Modal>
      )
    }
    case 'cobrar_de_novo':
      return (
        <Modal titulo="Tentar cobrar de novo" aoFechar={aoFechar}>
          <FormularioDeAcao textoBotao={`Cobrar ${janela.valor}`} pode={temMotivo} aoTerminar={aoTerminar}
            executar={async () => { await acao({ fatura: janela.fatura }); return 'Cobrança feita: a fatura foi paga.' }}>
            <p>O Stripe tenta agora cobrar {janela.valor} no cartão salvo. Se a pessoa já trocou o cartão, é a hora. Se recusar de novo, a tentativa fica no registro.</p>
            <CampoMotivo valor={motivo} aoMudar={setMotivo} dica="Ex.: disse que liberou o limite do cartão" />
          </FormularioDeAcao>
        </Modal>
      )
    case 'dias_gratis': {
      const ok = Number.isInteger(n) && n >= 1 && n <= 365
      return (
        <Modal titulo="Dar dias grátis no cartão" aoFechar={aoFechar}>
          <FormularioDeAcao textoBotao="Dar dias grátis" pode={temMotivo && ok} aoTerminar={aoTerminar}
            executar={async () => { const r = await acao({ dias: n }); return `Próxima cobrança passou para ${fmtData(String(r.proxima_cobranca))}.` }}>
            <p>A próxima cobrança anda alguns dias para frente, sem custo. O que já foi pago continua valendo.</p>
            <label className="campo curto"><span>Quantos dias</span>
              <input type="number" min={1} max={365} value={dias} onChange={(e) => setDias(e.target.value)} required />
            </label>
            <CampoMotivo valor={motivo} aoMudar={setMotivo} dica="Ex.: compensação por problema no app" />
          </FormularioDeAcao>
        </Modal>
      )
    }
    case 'reembolsar':
      return (
        <Modal titulo="Reembolsar a cobrança" aoFechar={aoFechar}>
          <FormularioDeAcao textoBotao={`Reembolsar ${janela.valor}`} perigo pode={temMotivo} aoTerminar={aoTerminar}
            executar={async () => { await acao({ cobranca: janela.cobranca }); return 'Reembolso pedido ao Stripe.' }}>
            <p>Devolve {janela.valor} para a pessoa (no cartão leva alguns dias para aparecer). O reembolso não mexe no acesso: se for o caso, cancele a assinatura ou tire o acesso também.</p>
            <CampoMotivo valor={motivo} aoMudar={setMotivo} dica="Ex.: pagou o Pix já tendo cortesia" />
          </FormularioDeAcao>
        </Modal>
      )
    case 'link_cartao':
      return (
        <Modal titulo="Gerar link para trocar o cartão" aoFechar={aoFechar}>
          <FormularioDeAcao textoBotao="Gerar link" pode={temMotivo} aoTerminar={() => {}}
            executar={async () => { const r = await acao(); setLink(String(r.link)) }}>
            <p>Gera a página do Stripe em que a pessoa troca o cartão, sem precisar entrar no OpusCash. Para mandar pelo WhatsApp.</p>
            <CampoMotivo valor={motivo} aoMudar={setMotivo} dica="Ex.: cartão recusado, vai trocar" />
          </FormularioDeAcao>
        </Modal>
      )
  }
}
