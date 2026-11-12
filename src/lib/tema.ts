import { useSyncExternalStore } from 'react'

/** Tema do painel: escuro, claro ou o do aparelho. Guardado só neste navegador (public/tema.js aplica antes de abrir). */
export type Preferencia = 'escuro' | 'claro' | 'sistema'

const CHAVE = 'painel-tema'
const sistema = () => (window.matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'escuro')
const ouvintes = new Set<() => void>()

function lerPreferencia(): Preferencia {
  try {
    const v = localStorage.getItem(CHAVE)
    return v === 'claro' || v === 'escuro' ? v : 'sistema'
  } catch {
    return 'sistema'
  }
}

let preferencia = lerPreferencia()
const aplicar = () => { document.documentElement.dataset.tema = preferencia === 'sistema' ? sistema() : preferencia }
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if (preferencia === 'sistema') { aplicar(); ouvintes.forEach((f) => f()) }
})

export function definirTema(p: Preferencia) {
  preferencia = p
  try {
    if (p === 'sistema') localStorage.removeItem(CHAVE)
    else localStorage.setItem(CHAVE, p)
  } catch { /* sem armazenamento: vale só até fechar */ }
  aplicar()
  ouvintes.forEach((f) => f())
}

/** Tema em uso agora ('claro' ou 'escuro') e a preferência escolhida. */
export function useTema() {
  const atual = useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } },
    () => `${preferencia}:${document.documentElement.dataset.tema ?? 'escuro'}`)
  const [pref, tema] = atual.split(':') as [Preferencia, 'claro' | 'escuro']
  return { preferencia: pref, tema }
}

/** A pessoa pediu menos movimento no aparelho: números e gráficos aparecem prontos. */
export const semMovimento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
