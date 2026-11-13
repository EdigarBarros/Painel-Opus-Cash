import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { inteiro } from '../lib/formato'
import { semMovimento } from '../lib/tema'

const suave = (t: number) => 1 - Math.pow(1 - t, 4)

/**
 * Número que conta até o valor (o mesmo de src/components/Numero.tsx do OpusCash): na primeira vez parte do zero,
 * depois anda do valor anterior até o novo. A contagem mexe só no texto, quadro a quadro, sem redesenhar o componente.
 */
export function Numero({ valor, formato = inteiro, duracao = 1100 }: { valor: number; formato?: (n: number) => string; duracao?: number }) {
  const [parado] = useState(semMovimento)
  const texto = useRef<HTMLSpanElement>(null)
  const atual = useRef(parado ? valor : 0)
  const formatoAtual = useRef(formato)
  useLayoutEffect(() => { formatoAtual.current = formato })
  useEffect(() => {
    if (parado) return
    const de = atual.current
    if (de === valor) return
    const inicio = performance.now()
    let quadro = requestAnimationFrame(function passo(agora) {
      const t = Math.min(1, (agora - inicio) / duracao)
      const v = t < 1 ? de + (valor - de) * suave(t) : valor
      atual.current = v
      const no = texto.current?.firstChild
      if (no) no.nodeValue = formatoAtual.current(v)
      if (t < 1) quadro = requestAnimationFrame(passo)
    })
    return () => cancelAnimationFrame(quadro)
  }, [valor, duracao, parado])
  return <span ref={texto} translate="no">{formato(parado ? valor : atual.current)}</span>
}
