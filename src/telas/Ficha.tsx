import { useCallback, useEffect, useState } from 'react'
import { api, mensagemDe } from '../lib/api'
import { useAviso } from '../lib/useAviso'
import {
  fmtData, fmtDataHora, fmtDinheiro, haQuanto, hojeISO, NOME_DA_ACAO, pagaNoCartao, paraCentavos, situacao,
} from '../lib/formato'
import { CampoMotivo, Carregando, ErroNaTela, Etiqueta, FormularioDeAcao, Modal } from '../ui'

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

const FORMAS = [['pix', 'Pix'], ['transferencia', 'Transferência'], ['dinheiro', 'Dinheiro'], ['outro', 'Outro']] as const
const DIA = 86_400_000

/** A hora em que a tela abriu: as contas de prazo usam sempre a mesma, em vez de mudar a cada redesenho. */
const useAgora = () => useState(() => Date.now())[0]

export function Ficha({ id }: { id: string }) {
  const [f, setF] = useState<FichaDados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [janela, setJanela] = useState<Janela | null>(null)
  const [toast, avisar] = useAviso()
  const [agora, setAgora] = useState(() => Date.now())

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
  if (!f) return <Carregando />

  const a = f.assinatura
  const s = situacao(a?.status ?? 'sem_assinatura', a?.teste_fim, a?.periodo_fim)
  const cartao = pagaNoCartao(a?.status)
  const bloqueada = Boolean(f.conta.bloqueado_ate && new Date(f.conta.bloqueado_ate).getTime() > agora)
  const liberadoPeloPainel = a && ['pix', 'cortesia', 'teste'].includes(a.status)
  const stripe = a?.stripe_customer_id ? `https://dashboard.stripe.com/customers/${a.stripe_customer_id}` : null

  return (
    <div className="pagina">
      <a href="#/contas" className="voltar">← Contas</a>
      <header className="ficha-topo">
        <div>
          <h1 className="ficha-email">{f.conta.email}</h1>
          <p className="sub">{f.perfil?.nome || 'Sem nome no perfil'} · conta criada em {fmtData(f.conta.criado_em)}</p>
        </div>
        <div className="etiquetas">
          <Etiqueta tom={s.tom}>{s.texto}</Etiqueta>
          {bloqueada && <Etiqueta tom="vermelho">Bloqueada</Etiqueta>}
          {f.conta.admin && <Etiqueta tom="violeta">Administrador</Etiqueta>}
        </div>
      </header>

      <div className="grade-ficha">
        <section className="cartao">
          <h2>Acesso ao OpusCash</h2>
          <dl className="dados">
            <dt>Situação</dt><dd>{s.texto}</dd>
            {a?.teste_fim && <><dt>Teste grátis</dt><dd>{new Date(a.teste_fim).getTime() > agora ? 'vai' : 'foi'} até {fmtDataHora(a.teste_fim)}</dd></>}
            {a?.periodo_fim && <><dt>{a.status === 'pix' ? 'Liberado até' : 'Período pago até'}</dt><dd>{fmtDataHora(a.periodo_fim)}</dd></>}
            {a?.cancela_no_fim && <><dt>Cartão</dt><dd>cancela no fim do período</dd></>}
            {f.perfil?.moeda && <><dt>Moeda</dt><dd>{f.perfil.moeda}</dd></>}
          </dl>
          {cartao
            ? (
              <p className="nota">
                Esta conta paga pelo cartão: o acesso dela é do Stripe. Para mudar, cancele ou ajuste a assinatura lá
                {stripe && <> (<a href={stripe} target="_blank" rel="noreferrer">abrir no Stripe</a>)</>}.
              </p>
            )
            : (
              <div className="acoes">
                <button className="botao principal" onClick={() => setJanela('liberar')}>Liberar acesso</button>
                {a?.status !== 'pix' && a?.status !== 'cortesia' && <button className="botao" onClick={() => setJanela('teste')}>Estender teste grátis</button>}
                {liberadoPeloPainel && <button className="botao perigo-leve" onClick={() => setJanela('revogar')}>Tirar acesso</button>}
              </div>
            )}
          {!cartao && stripe && <p className="nota"><a href={stripe} target="_blank" rel="noreferrer">Ver cliente no Stripe</a></p>}
        </section>

        <section className="cartao">
          <h2>Login e senha</h2>
          <dl className="dados">
            <dt>E-mail</dt><dd>{f.conta.confirmado_em ? `confirmado em ${fmtData(f.conta.confirmado_em)}` : 'não confirmado'}</dd>
            {f.conta.email_novo && <><dt>Troca pendente</dt><dd>para {f.conta.email_novo}</dd></>}
            <dt>Último acesso</dt><dd>{haQuanto(f.conta.ultimo_acesso)}</dd>
            <dt>Aparelhos conectados</dt><dd>{f.conta.sessoes}</dd>
            {bloqueada && <><dt>Bloqueio</dt><dd>bloqueada pelo suporte</dd></>}
          </dl>
          <div className="acoes">
            <button className="botao" onClick={() => setJanela('senha_email')}>Mandar e-mail de senha nova</button>
            <button className="botao" onClick={() => setJanela('senha_link')}>Gerar link de senha nova</button>
            {!f.conta.confirmado_em && <button className="botao" onClick={() => setJanela('reenviar_confirmacao')}>Reenviar confirmação</button>}
            {!f.conta.confirmado_em && <button className="botao" onClick={() => setJanela('confirmar_email')}>Confirmar e-mail</button>}
            {!f.conta.admin && <button className="botao" onClick={() => setJanela('trocar_email')}>Trocar e-mail</button>}
            {f.conta.sessoes > 0 && <button className="botao" onClick={() => setJanela('encerrar_sessoes')}>Desconectar de todos os aparelhos</button>}
            {bloqueada
              ? <button className="botao" onClick={() => setJanela('desbloquear')}>Desbloquear conta</button>
              : !f.conta.admin && <button className="botao perigo-leve" onClick={() => setJanela('bloquear')}>Bloquear conta</button>}
          </div>
        </section>

        <section className="cartao">
          <h2>Pagamentos</h2>
          {f.pix_stripe.length === 0 && f.pagamentos.length === 0 && <p className="vazio">Nenhum Pix do site nem pagamento por fora.</p>}
          <ul className="lista">
            {f.pix_stripe.map((p) => (
              <li key={p.sessao_id}>
                <strong>{fmtDinheiro(p.valor, p.moeda)}</strong> Pix pelo site · {fmtData(p.pago_em)} · {p.dias} dias
                {!p.creditado && <Etiqueta tom="vermelho">Não virou dias: devolver</Etiqueta>}
              </li>
            ))}
            {f.pagamentos.map((p) => (
              <li key={p.id}>
                <strong>{fmtDinheiro(p.valor, p.moeda)}</strong> {FORMAS.find(([v]) => v === p.forma)?.[1] ?? p.forma} por fora · {fmtData(p.pago_em + 'T12:00:00')}
                {p.observacao && <span className="lista-obs">{p.observacao}</span>}
              </li>
            ))}
          </ul>
          {cartao && stripe && <p className="nota">Cobranças do cartão: <a href={stripe} target="_blank" rel="noreferrer">no Stripe</a>.</p>}
        </section>

        <Anotacoes id={id} anotacoes={f.anotacoes} aoSalvar={() => { avisar('Anotação salva.'); carregar() }} />

        <section className="cartao">
          <h2>Erros desta conta</h2>
          {f.erros.length === 0
            ? <p className="vazio">Nenhum erro registrado.</p>
            : (
              <ul className="lista">
                {f.erros.map((e) => (
                  <li key={e.id}>
                    <strong>{e.mensagem}</strong>
                    <span className="lista-obs">{fmtDataHora(e.criado_em)}{e.onde && ` · ${e.onde}`}{e.versao && ` · versão ${e.versao}`}</span>
                  </li>
                ))}
              </ul>
            )}
        </section>

        <section className="cartao">
          <h2>O que o suporte fez aqui</h2>
          {f.registro.length === 0
            ? <p className="vazio">Nada ainda.</p>
            : (
              <ul className="lista">
                {f.registro.map((r) => (
                  <li key={r.id}>
                    <strong>{NOME_DA_ACAO[r.acao] ?? r.acao}</strong>
                    <span className="lista-obs">{fmtDataHora(r.criado_em)} · {r.admin_email}{r.motivo && ` · "${r.motivo}"`}</span>
                  </li>
                ))}
              </ul>
            )}
        </section>
      </div>

      {!f.conta.admin && (
        <section className="cartao zona-perigo">
          <h2>Excluir conta</h2>
          <p>Apaga o login e todos os dados da pessoa e cancela a cobrança no cartão. Não tem volta.</p>
          <button className="botao perigo" onClick={() => setJanela('excluir')}>Excluir esta conta</button>
        </section>
      )}

      {janela === 'liberar' && <Liberar f={f} aoFechar={() => setJanela(null)} aoTerminar={terminar} />}
      {janela === 'teste' && <EstenderTeste f={f} aoFechar={() => setJanela(null)} aoTerminar={terminar} />}
      {janela === 'revogar' && (
        <AcaoComMotivo titulo="Tirar o acesso" texto={`${f.conta.email} volta para a tela de assinatura na hora. Pagamentos registrados continuam guardados.`}
          botao="Tirar acesso" perigo aoFechar={() => setJanela(null)} aoTerminar={terminar}
          executar={async (motivo) => { await api('acesso', { id, acao: 'revogar', motivo }); return 'Acesso retirado.' }} />
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
          acao: opcao === 'vitalicio' ? 'vitalicio' : opcao === 'ate' ? 'ate' : 'dias',
          dias: opcao === 'vitalicio' || opcao === 'ate' ? undefined : dias,
          ate: opcao === 'ate' ? fim!.toISOString() : undefined,
          motivo,
          pagamento: pagou ? { valor: centavos, forma, pago_em: pagoEm, observacao: obs } : undefined,
        })
        return opcao === 'vitalicio' ? 'Acesso vitalício liberado.' : `Acesso liberado até ${fmtData(fim!.toISOString())}.`
      }}>
        <fieldset className="opcoes">
          <legend>Por quanto tempo</legend>
          {([['15', '15 dias'], ['30', '30 dias'], ['outro', 'Outra quantidade de dias'], ['ate', 'Até uma data'], ['vitalicio', 'Vitalício (para sempre)']] as const).map(([v, nome]) => (
            <label key={v} className="opcao">
              <input type="radio" name="tempo" checked={opcao === v} onChange={() => setOpcao(v)} /> {nome}
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
        executar={async () => { await api('acesso', { id: f.conta.id, acao: 'teste', dias: n, motivo }); return `Teste grátis até ${fmtData(new Date(base + n * DIA).toISOString())}.` }}>
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
      <h2>Anotações do suporte</h2>
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
          placeholder="Ex.: falou comigo no WhatsApp, prometeu pagar dia 15" aria-label="Nova anotação" />
        {erro && <p className="aviso-erro" role="alert">{erro}</p>}
        <button className="botao" disabled={salvando || !texto.trim()}>{salvando ? 'Salvando…' : 'Salvar anotação'}</button>
      </form>
      <ul className="lista">
        {anotacoes.map((n) => (
          <li key={n.id}>
            <span className="anotacao-texto">{n.texto}</span>
            <span className="lista-obs">{fmtDataHora(n.criado_em)}{n.admin_email && ` · ${n.admin_email}`}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
