import { useEffect, useRef, useState, type ReactNode } from 'react'
import { mensagemDe } from './lib/api'
import type { Tom } from './lib/formato'

export function Etiqueta({ tom, children }: { tom: Tom; children: ReactNode }) {
  return <span className={`etiqueta ${tom}`}>{children}</span>
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return <div className="carregando" role="status"><span className="giro" aria-hidden="true" />{texto}</div>
}

export function ErroNaTela({ erro, aoTentar }: { erro: string; aoTentar?: () => void }) {
  return (
    <div className="erro-tela" role="alert">
      <p>{erro}</p>
      {aoTentar && <button className="botao" onClick={aoTentar}>Tentar de novo</button>}
    </div>
  )
}

export function Modal({ titulo, aoFechar, children, largo }: { titulo: string; aoFechar: () => void; children: ReactNode; largo?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])
  return (
    <dialog ref={ref} className={`modal ${largo ? 'largo' : ''}`} onCancel={(e) => { e.preventDefault(); aoFechar() }}
      onClick={(e) => { if (e.target === ref.current) aoFechar() }}>
      <div className="modal-corpo">
        <header className="modal-topo">
          <h2>{titulo}</h2>
          <button className="fechar" onClick={aoFechar} aria-label="Fechar">×</button>
        </header>
        {children}
      </div>
    </dialog>
  )
}

/**
 * Formulário de uma ação do suporte: mostra o erro do servidor, trava o botão enquanto envia e fecha quando dá certo.
 * `executar` devolve a mensagem de sucesso (ou nada).
 */
export function FormularioDeAcao({ textoBotao, perigo, pode = true, executar, aoTerminar, children }: {
  textoBotao: string; perigo?: boolean; pode?: boolean
  executar: () => Promise<string | void>; aoTerminar: (msg?: string) => void; children: ReactNode
}) {
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  return (
    <form className="form" onSubmit={async (e) => {
      e.preventDefault()
      if (enviando || !pode) return
      setEnviando(true)
      setErro(null)
      try {
        const msg = await executar()
        aoTerminar(msg ?? undefined)
      } catch (err) {
        setErro(mensagemDe(err))
        setEnviando(false)
      }
    }}>
      {children}
      {erro && <p className="aviso-erro" role="alert">{erro}</p>}
      <div className="form-botoes">
        <button type="submit" className={`botao ${perigo ? 'perigo' : 'principal'}`} disabled={enviando || !pode}>
          {enviando ? 'Enviando…' : textoBotao}
        </button>
      </div>
    </form>
  )
}

export function CampoMotivo({ valor, aoMudar, dica }: { valor: string; aoMudar: (v: string) => void; dica?: string }) {
  return (
    <label className="campo">
      <span>Motivo <small>(fica no registro)</small></span>
      <input value={valor} onChange={(e) => aoMudar(e.target.value)} maxLength={500} required
        placeholder={dica ?? 'Ex.: pediu pelo WhatsApp em 12/11'} />
    </label>
  )
}
