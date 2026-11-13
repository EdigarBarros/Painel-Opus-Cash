import { useEffect, useRef, useState } from 'react'
import { iniciais } from '../lib/formato'
import { definirTema, useTema, type Preferencia } from '../lib/tema'
import { Icone } from './Icone'
import { Segmentado } from './Segmentado'

const TEMAS: [Preferencia, string, string][] = [['escuro', 'Escuro', 'lua'], ['claro', 'Claro', 'sol'], ['sistema', 'Automático', 'ajustes']]

/**
 * A conta de quem está usando o painel: avatar, e-mail e um menu com o tema e o botão de sair.
 * No computador fica no pé da barra lateral (o menu abre para cima); no celular, no canto do topo.
 */
export function Conta({ email, aoSair, lado, compacta }: { email: string; aoSair: () => void; lado: 'cima' | 'baixo'; compacta?: boolean }) {
  const [aberto, setAberto] = useState(false)
  const [saindo, setSaindo] = useState(false)
  const { preferencia } = useTema()
  const caixa = useRef<HTMLDivElement>(null)
  const botao = useRef<HTMLButtonElement>(null)

  // trocou de aba: o menu fecha
  useEffect(() => {
    const f = () => setAberto(false)
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  useEffect(() => {
    if (!aberto) return
    const fora = (e: PointerEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false) }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAberto(false); botao.current?.focus() } }
    document.addEventListener('pointerdown', fora)
    document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', tecla) }
  }, [aberto])

  const sigla = iniciais(email)
  return (
    <div className={`conta ${compacta ? 'compacta' : ''}`} ref={caixa}>
      <button ref={botao} type="button" className="conta-botao" onClick={() => setAberto((a) => !a)} aria-expanded={aberto} aria-haspopup="menu"
        aria-label={`Sua conta: ${email}`}>
        <span className="avatar" aria-hidden="true">{sigla}</span>
        {!compacta && (
          <span className="conta-texto">
            <span className="conta-email">{email}</span>
            <span className="conta-papel"><Icone nome="escudo" tamanho={13} />Administrador</span>
          </span>
        )}
        {!compacta && <Icone nome={lado === 'cima' ? 'cima' : 'abaixo'} tamanho={16} />}
      </button>
      {aberto && (
        <div className={`conta-menu ${lado}`} role="menu" aria-label="Sua conta">
          <div className="conta-menu-topo">
            <span className="avatar grande" aria-hidden="true">{sigla}</span>
            <span className="conta-menu-quem">
              <b title={email}>{email}</b>
              <span className="conta-selo"><Icone nome="escudo" tamanho={13} />Entrou com o código</span>
            </span>
          </div>
          <div className="conta-menu-bloco">
            <span className="conta-menu-rotulo">Aparência</span>
            <Segmentado largo rotulo="Aparência" valor={preferencia}
              opcoes={TEMAS.map(([id, nome, icone]) => [id, <><Icone nome={icone} tamanho={15} />{nome}</>])}
              aoMudar={(id, e) => definirTema(id, { x: e.clientX, y: e.clientY })} />
          </div>
          <p className="conta-menu-nota"><Icone nome="relogio" tamanho={14} />Parado 30 minutos, o painel sai sozinho.</p>
          <button type="button" role="menuitem" className="conta-sair" disabled={saindo} onClick={() => { setSaindo(true); aoSair() }}>
            <Icone nome="sair" tamanho={18} />{saindo ? 'Saindo…' : 'Sair do painel'}
          </button>
        </div>
      )}
    </div>
  )
}
