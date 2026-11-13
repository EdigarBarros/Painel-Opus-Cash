import { useRef, type ReactNode } from 'react'
import { estiloLente, useLente } from '../lib/useLente'

/** Controle segmentado com a pílula que desliza até a opção escolhida (como no OpusCash). */
export function Segmentado<T extends string | number>({ opcoes, valor, aoMudar, rotulo, largo, className = '' }: {
  opcoes: [T, ReactNode][]; valor: T; aoMudar: (v: T, e: React.MouseEvent) => void; rotulo: string; largo?: boolean; className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const lente = useLente(ref, 'button.ativo', valor)
  return (
    <div ref={ref} className={`segmentado ${largo ? 'largo' : ''} ${className}`} role="group" aria-label={rotulo}>
      {lente && <span className="segmentado-pilula" aria-hidden="true" style={estiloLente(lente)} />}
      {opcoes.map(([v, nome]) => (
        <button key={String(v)} type="button" className={valor === v ? 'ativo' : ''} aria-pressed={valor === v} onClick={(e) => aoMudar(v, e)}>{nome}</button>
      ))}
    </div>
  )
}
