import { useEffect, useState } from 'react'

/** Aviso rápido no canto da tela ("Acesso liberado"). */
export function useAviso() {
  const [aviso, setAviso] = useState<string | null>(null)
  useEffect(() => {
    if (!aviso) return
    const t = window.setTimeout(() => setAviso(null), 4000)
    return () => window.clearTimeout(t)
  }, [aviso])
  const elemento = aviso ? <div className="toast" role="status">{aviso}</div> : null
  return [elemento, setAviso] as const
}
