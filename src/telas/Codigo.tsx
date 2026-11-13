import { useEffect, useState } from 'react'
import { mensagemDe } from '../lib/api'
import { supabase } from '../lib/supabase'
import { Marca } from '../pecas/Marca'
import { Carregando } from '../ui'

type Etapa =
  | { tipo: 'carregando' }
  | { tipo: 'cadastrar'; fatorId: string; qr: string; segredo: string }
  | { tipo: 'confirmar'; fatorId: string }
  | { tipo: 'erro'; msg: string }

/**
 * Segunda etapa do login: o código de 6 dígitos de um app autenticador (Google Authenticator, Authy, 1Password...).
 * Na primeira vez, mostra o QR para cadastrar o celular; depois, só pede o código.
 */
export function Codigo({ email, aoConfirmar, aoSair }: { email: string; aoConfirmar: () => void; aoSair: () => void }) {
  const [etapa, setEtapa] = useState<Etapa>({ tipo: 'carregando' })
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [verSegredo, setVerSegredo] = useState(false)

  useEffect(() => {
    let cancelado = false
    void (async () => {
      try {
        const { data, error } = await supabase.auth.mfa.listFactors()
        if (error) throw error
        const pronto = data.totp.find((f) => f.status === 'verified')
        if (pronto) {
          if (!cancelado) setEtapa({ tipo: 'confirmar', fatorId: pronto.id })
          return
        }
        // cadastro que ficou pela metade (QR gerado e nunca confirmado): apaga e começa de novo
        for (const f of data.all.filter((f) => f.factor_type === 'totp' && f.status !== 'verified')) {
          await supabase.auth.mfa.unenroll({ factorId: f.id })
        }
        const novo = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Painel OpusCash', issuer: 'Painel OpusCash' })
        if (novo.error) throw novo.error
        if (!cancelado) setEtapa({ tipo: 'cadastrar', fatorId: novo.data.id, qr: novo.data.totp.qr_code, segredo: novo.data.totp.secret })
      } catch (e) {
        if (!cancelado) setEtapa({ tipo: 'erro', msg: mensagemDe(e) })
      }
    })()
    return () => { cancelado = true }
  }, [])

  const confirmar = async (fatorId: string) => {
    setEnviando(true)
    setErro(null)
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fatorId, code: codigo.replace(/\D/g, '') })
    setEnviando(false)
    if (error) {
      setErro(/invalid|expired/i.test(error.message) ? 'Código errado ou vencido. Confira o relógio do celular e tente de novo.' : error.message)
      setCodigo('')
      return
    }
    aoConfirmar()
  }

  return (
    <main className="entrada">
      <div className="cartao-entrada">
        <div className="entrada-marca"><Marca grande /></div>
        {etapa.tipo === 'carregando' && <Carregando />}
        {etapa.tipo === 'erro' && <p className="aviso-erro" role="alert">{etapa.msg}</p>}
        {etapa.tipo === 'cadastrar' && (
          <>
            <h1>Proteja o painel com o celular</h1>
            <ol className="passos">
              <li>Abra um app de código no celular (Google Authenticator, Microsoft Authenticator, Authy ou 1Password).</li>
              <li>Toque em adicionar e leia este QR.</li>
              <li>Digite abaixo o código de 6 dígitos que aparecer.</li>
            </ol>
            <img className="qr" src={etapa.qr} alt="QR para cadastrar o painel no app de código" width={200} height={200} />
            <button type="button" className="link" onClick={() => setVerSegredo((v) => !v)}>
              {verSegredo ? 'Esconder a chave' : 'Não consigo ler o QR'}
            </button>
            {verSegredo && <p className="segredo">Digite esta chave no app: <code>{etapa.segredo}</code></p>}
          </>
        )}
        {etapa.tipo === 'confirmar' && (
          <>
            <h1>Código do celular</h1>
            <p className="sub">Abra o app de código e digite os 6 dígitos do Painel OpusCash.</p>
          </>
        )}
        {(etapa.tipo === 'cadastrar' || etapa.tipo === 'confirmar') && (
          <form onSubmit={(e) => { e.preventDefault(); void confirmar(etapa.fatorId) }}>
            <label className="campo">
              <span>Código</span>
              <input className="codigo" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} autoFocus
                value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} required />
            </label>
            {erro && <p className="aviso-erro" role="alert">{erro}</p>}
            <button className="botao principal largo" disabled={enviando || codigo.length !== 6}>
              {enviando ? 'Conferindo…' : 'Confirmar'}
            </button>
          </form>
        )}
        <p className="rodape-entrada">Entrou como {email}. <button type="button" className="link" onClick={aoSair}>Sair</button></p>
      </div>
    </main>
  )
}
