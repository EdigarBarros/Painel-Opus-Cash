import { useState } from 'react'
import { manterNoAparelho, supabase } from '../lib/supabase'
import { Marca } from '../pecas/Marca'

export function Entrar() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)
  const [manter, setManter] = useState(false)

  return (
    <main className="entrada">
      <form className="cartao-entrada" onSubmit={async (e) => {
        e.preventDefault()
        setEntrando(true)
        setErro(null)
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
        if (error) {
          setErro(/invalid/i.test(error.message) ? 'E-mail ou senha errados.' : error.message)
          setEntrando(false)
        } else if (manter) await manterNoAparelho()
      }}>
        <div className="entrada-marca"><Marca grande /></div>
        <h1>Entrar no painel</h1>
        <p className="sub">Acesso restrito à equipe de suporte. Use a mesma conta do OpusCash.</p>
        <label className="campo">
          <span>E-mail</span>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="campo">
          <span>Senha</span>
          <input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </label>
        <label className="manter-conectado">
          <input type="checkbox" checked={manter} onChange={(e) => setManter(e.target.checked)} />
          <span><b>Manter conectado por 7 dias</b><small>Só no seu computador ou celular. O código do celular continua sendo pedido.</small></span>
        </label>
        {erro && <p className="aviso-erro" role="alert">{erro}</p>}
        <button className="botao principal largo" disabled={entrando}>{entrando ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </main>
  )
}
