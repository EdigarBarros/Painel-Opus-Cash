import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { api, mensagemDe, ouvirPerdaDeAcesso } from './lib/api'
import { supabase } from './lib/supabase'
import { Codigo } from './telas/Codigo'
import { Contas } from './telas/Contas'
import { Entrar } from './telas/Entrar'
import { Erros } from './telas/Erros'
import { Ficha } from './telas/Ficha'
import { Inicio } from './telas/Inicio'
import { Registro } from './telas/Registro'
import { Carregando, ErroNaTela } from './ui'

const PARADO_MAX = 30 * 60_000

/** Nível do login lido do token (aal1 = só senha; aal2 = senha + código do celular). Quem decide de verdade é o servidor. */
function nivelDoToken(token: string) {
  try {
    const meio = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return (JSON.parse(atob(meio)) as { aal?: string }).aal ?? 'aal1'
  } catch {
    return 'aal1'
  }
}

function useRota() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const f = () => { setHash(location.hash); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  const [caminho, busca = ''] = hash.replace(/^#/, '').split('?')
  return { partes: caminho.split('/').filter(Boolean), params: new URLSearchParams(busca) }
}

type Eu = { admin: boolean; nivel: string; email: string }

export default function App() {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined)
  const [eu, setEu] = useState<Eu | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [avisoSaida, setAvisoSaida] = useState<string | null>(null)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSessao(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s))
    return () => data.subscription.unsubscribe()
  }, [])

  // pergunta ao servidor se esta conta é administradora (de novo quando o login muda de nível, depois do código)
  const chave = sessao ? `${sessao.user.id}:${nivelDoToken(sessao.access_token)}:${tentativa}` : null
  useEffect(() => {
    if (!chave) return
    let cancelado = false
    api<Eu>('eu').then((r) => { if (!cancelado) { setEu(r); setErro(null) } }).catch((e) => { if (!cancelado) setErro(mensagemDe(e)) })
    return () => { cancelado = true }
  }, [chave])

  // o servidor recusou no meio do uso: login caiu (volta ao início) ou falta o código (pede de novo)
  useEffect(() => ouvirPerdaDeAcesso((motivo) => {
    if (motivo === 'login') { setEu(null); void supabase.auth.signOut() }
    else setEu((e) => (e ? { ...e, nivel: 'aal1' } : e))
  }), [])

  // parado 30 minutos: sai sozinho
  useEffect(() => {
    if (!sessao) return
    let ultimo = Date.now()
    const mexeu = () => { ultimo = Date.now() }
    const eventos = ['pointerdown', 'keydown', 'mousemove', 'scroll', 'touchstart'] as const
    eventos.forEach((ev) => window.addEventListener(ev, mexeu, { passive: true }))
    const t = window.setInterval(() => {
      if (Date.now() - ultimo > PARADO_MAX) {
        setAvisoSaida('Você saiu sozinho depois de 30 minutos parado. Entre de novo.')
        setEu(null)
        void supabase.auth.signOut()
      }
    }, 30_000)
    return () => {
      eventos.forEach((ev) => window.removeEventListener(ev, mexeu))
      window.clearInterval(t)
    }
  }, [sessao])

  const sair = () => { setAvisoSaida(null); setEu(null); void supabase.auth.signOut() }

  if (sessao === undefined) return <Carregando />
  if (!sessao) return <Entrar aviso={avisoSaida} />
  if (erro) return <main className="entrada"><ErroNaTela erro={erro} aoTentar={() => setTentativa((n) => n + 1)} /><button className="link" onClick={sair}>Sair</button></main>
  if (!eu || eu.email !== sessao.user.email) return <Carregando />
  if (!eu.admin) {
    return (
      <main className="entrada">
        <div className="cartao-entrada">
          <h1>Sem permissão</h1>
          <p className="sub">{eu.email} não é uma conta de administrador do OpusCash.</p>
          <button className="botao principal largo" onClick={sair}>Sair</button>
        </div>
      </main>
    )
  }
  if (eu.nivel !== 'aal2') return <Codigo email={eu.email} aoConfirmar={() => setTentativa((n) => n + 1)} aoSair={sair} />
  return <Painel email={eu.email} aoSair={sair} />
}

function Painel({ email, aoSair }: { email: string; aoSair: () => void }) {
  const { partes, params } = useRota()
  const secao = partes[0] ?? 'inicio'
  const itens = [['inicio', 'Início', '#/'], ['contas', 'Contas', '#/contas'], ['erros', 'Erros', '#/erros'], ['registro', 'Registro', '#/registro']] as const
  return (
    <div className="casca">
      <header className="topo">
        <a href="#/" className="marca"><img src="/simbolo.webp" alt="" width={28} height={28} /><span>Painel <strong>OpusCash</strong></span></a>
        <nav className="menu" aria-label="Seções">
          {itens.map(([id, nome, href]) => (
            <a key={id} href={href} className={secao === id ? 'ativo' : ''} aria-current={secao === id ? 'page' : undefined}>{nome}</a>
          ))}
        </nav>
        <div className="quem">
          <span className="quem-email">{email}</span>
          <button className="botao pequeno" onClick={aoSair}>Sair</button>
        </div>
      </header>
      <main className="conteudo">
        {secao === 'contas' && partes[1] ? <Ficha key={partes[1]} id={partes[1]} />
          : secao === 'contas' ? <Contas filtroInicial={params.get('filtro')} />
          : secao === 'erros' ? <Erros />
          : secao === 'registro' ? <Registro />
          : <Inicio />}
      </main>
    </div>
  )
}
