import { Icone } from './Icone'
import './novidade.css'

/*
 * O cartão do pop-up "Tem novidade!". Só desenha: quem decide quando mostrar é o Novidades.tsx (site e app).
 * O MESMO arquivo (e o novidade.css) é copiado no painel de suporte (painel-opus-cash, src/pecas/) para a prévia
 * ficar idêntica ao que a pessoa vê. Mudou aqui? Copie para lá também.
 */

export type CorNovidade = 'marca' | 'verde' | 'azul' | 'violeta' | 'amarelo' | 'rosa'
export const CORES_NOVIDADE: CorNovidade[] = ['marca', 'verde', 'azul', 'violeta', 'amarelo', 'rosa']

export function CartaoNovidade({ titulo, itens, icone, cor, rotulos, temBotaoVer, aoVer, aoFechar, previa }: {
  titulo: string
  itens: { icone: string; texto: string }[]
  icone: string
  cor: CorNovidade
  /** textos fixos já no idioma da pessoa */
  rotulos: { selo: string; ver: string; ok: string; depois: string; fechar: string }
  temBotaoVer: boolean
  aoVer: () => void
  aoFechar: () => void
  /** no painel de suporte: desenhado dentro da página, sem escurecer a tela */
  previa?: boolean
}) {
  const cartao = (
    <div className={`novidade cor-${cor} ${previa ? 'novidade-em-previa' : ''}`} role="dialog" aria-modal={!previa} aria-label={titulo}>
      <div className="novidade-palco" aria-hidden="true">
        <i className="novidade-onda" /><i className="novidade-onda" /><i className="novidade-onda" />
        <i className="novidade-brilho b1" /><i className="novidade-brilho b2" /><i className="novidade-brilho b3" /><i className="novidade-brilho b4" />
        <span className="novidade-icone"><Icone nome={icone} tamanho={44} /></span>
      </div>
      <span className="novidade-selo"><Icone nome="estrela" tamanho={13} />{rotulos.selo}</span>
      <button type="button" className="novidade-x" onClick={aoFechar} aria-label={rotulos.fechar}><Icone nome="fechar" tamanho={16} /></button>
      <h2 className="novidade-titulo">{titulo}</h2>
      {itens.length > 0 && (
        <ul className={`novidade-itens n${itens.length}`}>
          {itens.map((it, i) => (
            <li key={i} style={{ '--i': i } as React.CSSProperties}>
              <span className="novidade-item-icone"><Icone nome={it.icone} tamanho={22} /></span>
              <span className="novidade-item-texto">{it.texto}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="novidade-botoes">
        {temBotaoVer && <button type="button" className="novidade-depois" onClick={aoFechar}>{rotulos.depois}</button>}
        <button type="button" className="novidade-ok" onClick={temBotaoVer ? aoVer : aoFechar} autoFocus={!previa}>
          {temBotaoVer ? rotulos.ver : rotulos.ok}{temBotaoVer && <Icone nome="seta" tamanho={17} />}
        </button>
      </div>
    </div>
  )
  if (previa) return cartao
  return <div className="novidade-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>{cartao}</div>
}
