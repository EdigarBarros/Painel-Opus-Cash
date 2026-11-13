import type { Session } from '@supabase/supabase-js'
import { useEffect, useRef, useState } from 'react'
import { api, mensagemDe, ouvirPerdaDeAcesso } from './lib/api'
import { esquecerTudo, useDados } from './lib/dados'
import { entrarNaTela, esquecerVisitas } from './lib/visitas'
import { supabase } from './lib/supabase'
import { estiloLente, useLente } from './lib/useLente'
import { Codigo } from './telas/Codigo'
import { Contas } from './telas/Contas'
import { Entrar } from './telas/Entrar'
import { Novidades } from './telas/Novidades'
import { Erros } from './telas/Erros'
import { Ficha } from './telas/Ficha'
import { Inicio } from './telas/Inicio'
import { Registro } from './telas/Registro'
import type { Contagem } from './lib/suporte'
import { Suporte } from './telas/Suporte'
import { Conta } from './pecas/Conta'
import { Icone } from './pecas/Icone'
import { Marca } from './pecas/Marca'
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
    if (motivo === 'login') { setEu(null); esquecerTudo(); esquecerVisitas(); void supabase.auth.signOut() }
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
        esquecerTudo(); esquecerVisitas(); void supabase.auth.signOut()
      }
    }, 30_000)
    return () => {
      eventos.forEach((ev) => window.removeEventListener(ev, mexeu))
      window.clearInterval(t)
    }
  }, [sessao])

  const sair = () => { setAvisoSaida(null); setEu(null); esquecerTudo(); esquecerVisitas(); void supabase.auth.signOut() }

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

const SECOES = [
  { id: 'inicio', nome: 'Início', href: '#/', icone: 'inicio' },
  { id: 'contas', nome: 'Contas', href: '#/contas', icone: 'pessoas' },
  { id: 'suporte', nome: 'Suporte', href: '#/suporte', icone: 'conversa' },
  { id: 'novidades', nome: 'Novidades', href: '#/novidades', icone: 'estrela' },
  { id: 'erros', nome: 'Erros', href: '#/erros', icone: 'inseto' },
  { id: 'registro', nome: 'Registro', href: '#/registro', icone: 'historico' },
] as const

function Painel({ email, aoSair }: { email: string; aoSair: () => void }) {
  const { partes, params } = useRota()
  const secao = partes[0] ?? 'inicio'
  const refNav = useRef<HTMLElement>(null)
  const refAbas = useRef<HTMLElement>(null)
  // tela atual (a ficha de cada conta conta como uma tela): primeira visita = abertura completa; volta = entrada leve
  const tela = secao === 'contas' && partes[1] ? `ficha:${partes[1]}` : secao
  const entrada = entrarNaTela(tela) ? 'completa' : 'leve'
  // o que espera resposta no suporte: número no menu, conferido a cada minuto e quando o suporte responde
  const { dados: contagem, recarregar: recontar } = useDados('suporte-contagem', () => api<Contagem>('suporte_contagem'))
  useEffect(() => {
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') recontar() }, 60_000)
    window.addEventListener('suporte-mudou', recontar)
    return () => { window.clearInterval(t); window.removeEventListener('suporte-mudou', recontar) }
  }, [recontar])
  const esperando = contagem?.aguardando ?? 0
  const lenteNav = useLente(refNav, 'a.ativo', secao)
  const lenteAbas = useLente(refAbas, 'a.ativo', secao)
  return (
    <div className="app">
      <aside className="lateral">
        <a href="#/" className="lateral-marca" aria-label="Início do painel"><Marca /></a>
        <nav ref={refNav} aria-label="Seções">
          {lenteNav && <span className="lente" aria-hidden="true" style={estiloLente(lenteNav)} />}
          {SECOES.map((s) => (
            <a key={s.id} href={s.href} className={secao === s.id ? 'ativo' : ''} aria-current={secao === s.id ? 'page' : undefined}>
              <Icone nome={s.icone} />{s.nome}
              {s.id === 'suporte' && esperando > 0 && <b className="nav-contador" title={`${esperando} esperando resposta`}>{esperando}</b>}
            </a>
          ))}
        </nav>
        <div className="lateral-rodape">
          <Conta email={email} aoSair={aoSair} lado="cima" />
        </div>
      </aside>
      <div className="area-principal">
        <header className="barra-movel">
          <a href="#/" aria-label="Início do painel"><Marca /></a>
          <Conta email={email} aoSair={aoSair} lado="baixo" compacta />
        </header>
        <main className="conteudo" data-entrada={entrada}>
          {secao === 'contas' && partes[1] ? <Ficha key={partes[1]} id={partes[1]} />
            : secao === 'contas' ? <Contas key={params.toString()} filtroInicial={params.get('filtro')} buscaInicial={params.get('busca')} />
            : secao === 'suporte' ? <Suporte idAberto={partes[1]} buscaInicial={params.get('busca')} key={params.get('busca') ?? ''} />
            : secao === 'novidades' ? <Novidades />
            : secao === 'erros' ? <Erros />
            : secao === 'registro' ? <Registro />
            : <Inicio />}
        </main>
      </div>
      <nav ref={refAbas} className="abas-movel" aria-label="Seções">
        {lenteAbas && <span className="lente" aria-hidden="true" style={estiloLente(lenteAbas)} />}
        {SECOES.map((s) => (
          <a key={s.id} href={s.href} className={secao === s.id ? 'ativo' : ''} aria-current={secao === s.id ? 'page' : undefined}>
            <Icone nome={s.icone} tamanho={22} /><span>{s.nome}</span>
            {s.id === 'suporte' && esperando > 0 && <b className="nav-contador">{esperando}</b>}
          </a>
        ))}
      </nav>
    </div>
  )
}
