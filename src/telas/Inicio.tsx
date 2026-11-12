import { useCallback, useEffect, useState } from 'react'
import { api, mensagemDe } from '../lib/api'
import { fmtData, fmtDataCurta, fmtDinheiro } from '../lib/formato'
import { Carregando, ErroNaTela } from '../ui'

interface Resumo {
  contas: number; novas_7d: number; novas_30d: number; ativas_7d: number
  em_teste: number; teste_vence_7d: number; cartao: number; cartao_pendente: number
  pix: number; pix_vence_7d: number; cortesia: number; sem_acesso: number
  pix_stripe_30d: number; pix_sem_credito: number; por_fora_30d: number; erros_7d: number
  cadastros_por_dia: { dia: string; n: number }[]
}

function Numero({ titulo, valor, detalhe, alerta, href }: { titulo: string; valor: string | number; detalhe?: string; alerta?: boolean; href?: string }) {
  const corpo = (
    <>
      <span className="numero-titulo">{titulo}</span>
      <strong className="numero-valor">{valor}</strong>
      {detalhe && <span className="numero-detalhe">{detalhe}</span>}
    </>
  )
  return href ? <a className={`numero ${alerta ? 'alerta' : ''}`} href={href}>{corpo}</a> : <div className={`numero ${alerta ? 'alerta' : ''}`}>{corpo}</div>
}

/** Cadastros por dia (últimos 30 dias): barras finas de uma cor só, com o valor ao passar o mouse ou tocar. */
function GraficoCadastros({ dias }: { dias: { dia: string; n: number }[] }) {
  const [foco, setFoco] = useState<number | null>(null)
  const max = Math.max(1, ...dias.map((d) => d.n))
  const total = dias.reduce((s, d) => s + d.n, 0)
  const atual = foco !== null ? dias[foco] : null
  return (
    <section className="cartao">
      <header className="cartao-topo">
        <h2>Cadastros por dia</h2>
        <span className="grafico-leitura" aria-live="polite">
          {atual ? <><strong>{atual.n}</strong> em {fmtData(atual.dia + 'T12:00:00')}</> : <><strong>{total}</strong> nos últimos 30 dias</>}
        </span>
      </header>
      <div className="grafico" role="list" aria-label="Cadastros por dia nos últimos 30 dias" onMouseLeave={() => setFoco(null)}>
        {dias.map((d, i) => (
          <button key={d.dia} type="button" role="listitem" className={`coluna ${foco === i ? 'foco' : ''}`}
            aria-label={`${fmtData(d.dia + 'T12:00:00')}: ${d.n} ${d.n === 1 ? 'cadastro' : 'cadastros'}`}
            onMouseEnter={() => setFoco(i)} onFocus={() => setFoco(i)} onClick={() => setFoco(i)}>
            <span className="barra" style={{ height: d.n ? `${Math.max(4, (d.n / max) * 100)}%` : '0' }} />
          </button>
        ))}
      </div>
      <div className="grafico-eixo">
        <span>{fmtDataCurta(dias[0]?.dia + 'T12:00:00')}</span>
        <span>hoje</span>
      </div>
    </section>
  )
}

export function Inicio() {
  const [r, setR] = useState<Resumo | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const carregar = useCallback(() => {
    api<Resumo>('resumo').then((d) => { setR(d); setErro(null) }).catch((e) => setErro(mensagemDe(e)))
  }, [])
  useEffect(carregar, [carregar])

  if (erro) return <ErroNaTela erro={erro} aoTentar={carregar} />
  if (!r) return <Carregando />
  const recebido = r.pix_stripe_30d + r.por_fora_30d
  return (
    <div className="pagina">
      <h1>Início</h1>
      {r.pix_sem_credito > 0 && (
        <p className="faixa alerta">
          {r.pix_sem_credito === 1 ? '1 Pix foi pago' : `${r.pix_sem_credito} Pix foram pagos`} por quem já tinha acesso (cortesia ou cartão) e não
          {r.pix_sem_credito === 1 ? ' virou' : ' viraram'} dias. Confira no Stripe e devolva o dinheiro.
        </p>
      )}
      <div className="numeros">
        <Numero titulo="Contas" valor={r.contas} detalhe={`${r.novas_7d} novas na semana`} href="#/contas" />
        <Numero titulo="Entraram na semana" valor={r.ativas_7d} detalhe={`de ${r.contas} contas`} />
        <Numero titulo="Em teste grátis" valor={r.em_teste} detalhe={`${r.teste_vence_7d} vencem em 7 dias`} href="#/contas?filtro=teste" />
        <Numero titulo="Assinantes no cartão" valor={r.cartao}
          detalhe={r.cartao_pendente ? `${r.cartao_pendente} com cartão recusado` : 'nenhum com cartão recusado'} alerta={r.cartao_pendente > 0} href="#/contas?filtro=pagantes" />
        <Numero titulo="Liberados por prazo" valor={r.pix} detalhe={`${r.pix_vence_7d} vencem em 7 dias`} href="#/contas?filtro=liberados" />
        <Numero titulo="Vitalícios" valor={r.cortesia} href="#/contas?filtro=vitalicio" />
        <Numero titulo="Sem acesso" valor={r.sem_acesso} detalhe="teste acabou, cancelou ou não escolheu plano" href="#/contas?filtro=sem_acesso" />
        <Numero titulo="Recebido em 30 dias" valor={fmtDinheiro(recebido)}
          detalhe={`${fmtDinheiro(r.pix_stripe_30d)} Pix do site · ${fmtDinheiro(r.por_fora_30d)} por fora`} />
        <Numero titulo="Erros na semana" valor={r.erros_7d} alerta={r.erros_7d > 0} href="#/erros" />
      </div>
      <GraficoCadastros dias={r.cadastros_por_dia} />
      <p className="nota">A assinatura no cartão é cobrada pelo Stripe: o valor recebido por ela fica no painel do Stripe.</p>
    </div>
  )
}
