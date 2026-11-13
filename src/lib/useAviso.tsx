import { useEffect, useState } from 'react'
import { Icone } from '../pecas/Icone'

/** Aviso rápido embaixo da tela ("Acesso liberado"), que sobe com mola e some sozinho. */
export function useAviso() {
  const [aviso, setAviso] = useState<{ texto: string; n: number } | null>(null)
  useEffect(() => {
    if (!aviso) return
    const t = window.setTimeout(() => setAviso(null), 4000)
    return () => window.clearTimeout(t)
  }, [aviso])
  const elemento = aviso
    ? <div key={aviso.n} className="toast" role="status"><span className="toast-icone"><Icone nome="check" tamanho={16} /></span>{aviso.texto}</div>
    : null
  return [elemento, (texto: string) => setAviso({ texto, n: Date.now() })] as const
}
