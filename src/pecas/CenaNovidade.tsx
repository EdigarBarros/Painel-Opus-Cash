import { useState } from 'react'
import './cena-novidade.css'

/*
 * CENAS das novidades: animações prontas, feitas aqui no código (não no editor do painel), que o pop-up "Tem novidade!"
 * mostra quando novidades.arte.animacao tem o nome de uma delas. Só CSS 3D (perspective, rotateX/Y, translateZ) e
 * keyframes em transform/opacity/clip-path: nada de biblioteca 3D nem imagem. Com Animações: Reduzidas, a regra geral do
 * app desliga as animações e fica o quadro final (que é o estilo de base de cada peça).
 *
 * O MESMO arquivo (e o cena-novidade.css) é copiado no painel de suporte (painel-opus-cash, src/pecas/) para a prévia ficar
 * idêntica. Mudou aqui? Copie para lá também. Os textos chegam prontos em `rotulos` (o painel passa em português).
 */

export const CENAS = ['carteira-cartoes'] as const
export type NomeDaCena = (typeof CENAS)[number]
export const ehCena = (v: unknown): v is NomeDaCena => (CENAS as readonly string[]).includes(v as string)
/** Cenas que mostram algo que só existe na tela do computador: no celular o pop-up não aparece. */
export const SO_COMPUTADOR: NomeDaCena[] = ['carteira-cartoes']

export interface RotulosDaCena {
  antes: string; depois: string; tudoJunto: string
  fatura: string; compras: string; pagas: string; limite: string
  verDeNovo: string
}

/** Cartão pequeno desenhado (mesmo jeito do plástico do app, em miniatura). */
function Mini({ cor, nome, classe }: { cor: string; nome: string; classe: string }) {
  return (
    <span className={`cn-cartao ${classe}`} style={{ '--c': cor } as React.CSSProperties}>
      <i className="cn-cartao-selo" /><b>{nome}</b>
      <i className="cn-cartao-chip" />
      <i className="cn-cartao-linha" />
    </span>
  )
}

/** A tela antiga, tudo empilhado numa coluna. */
function Antes({ r }: { r: RotulosDaCena }) {
  return (
    <div className="cn-plano cn-antes">
      <span className="cn-etiqueta">{r.antes}</span>
      <div className="cn-antes-janela">
        <div className="cn-antes-rolo">
          <i className="cn-bloco topo" />
          <div className="cn-antes-cartoes"><i style={{ '--c': '#8a2be2' } as React.CSSProperties} /><i style={{ '--c': '#ec7000' } as React.CSSProperties} /><i style={{ '--c': '#21c25e' } as React.CSSProperties} /></div>
          {Array.from({ length: 9 }, (_, i) => <i key={i} className={`cn-bloco ${i % 3 === 0 ? 'alto' : ''}`} />)}
        </div>
      </div>
      <span className="cn-antes-nota">{r.tudoJunto}</span>
    </div>
  )
}

/** A tela nova: a carteira, o cartão saindo e as abas. */
function Depois({ r }: { r: RotulosDaCena }) {
  return (
    <div className="cn-plano cn-depois">
      <span className="cn-etiqueta nova">{r.depois}</span>
      <div className="cn-carteira">
        <i className="cn-costura" />
        <Mini cor="#8a2be2" nome="Nubank" classe="c1" />
        <i className="cn-bolso b1" />
        <Mini cor="#ec7000" nome="Itaú" classe="c2" />
        <i className="cn-bolso b2" />
        <Mini cor="#21c25e" nome="PicPay" classe="c3" />
        <i className="cn-bolso b3" />
      </div>
      <Mini cor="#ec7000" nome="Itaú" classe="fora" />
      <i className="cn-sombra" />
      <div className="cn-abas">
        <i className="cn-risco" />
        <span className="a1">{r.fatura}</span><span className="a2">{r.compras}</span><span className="a3">{r.pagas}</span><span className="a4">{r.limite}</span>
      </div>
      <div className="cn-painel">
        <div className="cn-p p1"><b>R$ 990,00</b><i className="cn-linha-tempo" /><i className="cn-barra" style={{ width: '70%' }} /></div>
        <div className="cn-p p2">{[64, 48, 72, 40].map((w, i) => <i key={i} className="cn-item" style={{ '--w': `${w}%` } as React.CSSProperties} />)}</div>
        <div className="cn-p p3"><b>R$ 1.610,00</b><i className="cn-regua"><i /></i><i className="cn-fontes" /></div>
      </div>
    </div>
  )
}

/**
 * A cena "carteira-cartoes": a tela antiga (tudo junto) gira e vai para o lado, a nova entra; os cartões descem para os
 * bolsos, um sai da carteira e as abas aparecem, uma de cada vez. Toca uma vez (uns 9 s) e para no antes e depois.
 */
export function CenaNovidade({ nome, rotulos }: { nome: NomeDaCena; rotulos: RotulosDaCena }) {
  const [vez, setVez] = useState(0)
  if (nome !== 'carteira-cartoes') return null
  return (
    <div className="cn">
      <div key={vez} className="cn-palco" aria-hidden="true">
        <i className="cn-chao" />
        <Antes r={rotulos} />
        <Depois r={rotulos} />
      </div>
      <button type="button" className="cn-de-novo" onClick={() => setVez(vez + 1)}>↻ {rotulos.verDeNovo}</button>
    </div>
  )
}
