import { useLayoutEffect, useState, type RefObject } from 'react'

export interface Lente { x: number; y: number; w: number; h: number }

/**
 * Mede o item ativo dentro de um grupo (menu, abas, segmentado) para uma "lente" deslizar até ele com mola, em vez de o
 * destaque pular de um item para o outro. A mesma de src/lib/useLente.ts do OpusCash.
 */
export function useLente(ref: RefObject<HTMLElement | null>, seletor: string, chave: unknown): Lente | null {
  const [lente, setLente] = useState<Lente | null>(null)
  useLayoutEffect(() => {
    const caixa = ref.current
    if (!caixa) return
    const medir = () => {
      const el = caixa.querySelector<HTMLElement>(seletor)
      setLente(el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : null)
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(caixa)
    return () => ro.disconnect()
  }, [ref, seletor, chave])
  return lente
}

export const estiloLente = (l: Lente) => ({ transform: `translate(${l.x}px, ${l.y}px)`, width: l.w, height: l.h })
