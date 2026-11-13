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

/**
 * Contorno de uma mancha de tinta (a mesma de src/lib/tema.ts do OpusCash): um círculo de borda ondulada que muda de
 * forma enquanto cresce. Sempre com o mesmo número de pontos, para o navegador animar de um quadro para o outro.
 */
function mancha(cx: number, cy: number, r: number, fase: number, pontos = 72) {
  const ps: string[] = []
  for (let i = 0; i < pontos; i++) {
    const a = (i / pontos) * Math.PI * 2
    const k = 1 + 0.15 * Math.sin(3 * a + fase) + 0.08 * Math.sin(5 * a - fase * 1.7) + 0.05 * Math.sin(2 * a + fase * 0.6)
    ps.push(`${(cx + Math.cos(a) * r * k).toFixed(1)}px ${(cy + Math.sin(a) * r * k).toFixed(1)}px`)
  }
  return `polygon(${ps.join(', ')})`
}

/** Quadros da mancha saindo de `origem` até cobrir a tela inteira. */
function quadrosDaMancha(origem: { x: number; y: number }) {
  const longe = Math.hypot(Math.max(origem.x, innerWidth - origem.x), Math.max(origem.y, innerHeight - origem.y))
  const final = (longe / 0.72) * 1.04
  const n = 18
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n
    const cresce = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    return mancha(origem.x, origem.y, Math.max(1, final * cresce), t * 3.2)
  })
}
const DURACAO_TINTA = 950
const resolver = (p: Preferencia) => (p === 'sistema' ? sistema() : p)

/**
 * Troca o tema. Com `origem` (o ponto do clique), o tema novo se espalha como uma mancha de tinta a partir dali, como no
 * OpusCash. Com View Transitions, a tela nova aparece por dentro da mancha; sem, uma camada da cor nova se espalha e some.
 */
export function definirTema(p: Preferencia, origem?: { x: number; y: number }) {
  try {
    if (p === 'sistema') localStorage.removeItem(CHAVE)
    else localStorage.setItem(CHAVE, p)
  } catch { /* sem armazenamento: vale só até fechar */ }
  const mudar = () => { preferencia = p; aplicar(); ouvintes.forEach((f) => f()) }
  if (!origem || semMovimento() || resolver(p) === document.documentElement.dataset.tema) return mudar()
  const raiz = document.documentElement
  const quadros = quadrosDaMancha(origem)
  const doc = document as Document & { startViewTransition?: (f: () => void) => { ready: Promise<void>; finished: Promise<void> } }
  if (doc.startViewTransition) {
    raiz.classList.add('trocando-tema')
    const t = doc.startViewTransition(mudar)
    t.ready.then(() => {
      raiz.animate({ clipPath: quadros }, { duration: DURACAO_TINTA, easing: 'linear', pseudoElement: '::view-transition-new(root)' })
    }).catch(() => {})
    t.finished.finally(() => raiz.classList.remove('trocando-tema'))
    return
  }
  const tinta = document.createElement('div')
  tinta.className = 'tinta'
  tinta.style.background = resolver(p) === 'escuro' ? '#070b14' : '#f3f5fa'
  document.body.appendChild(tinta)
  tinta.animate({ clipPath: quadros }, { duration: DURACAO_TINTA, easing: 'linear', fill: 'forwards' }).finished.then(() => {
    mudar()
    return tinta.animate({ opacity: [1, 0] }, { duration: 280, fill: 'forwards' }).finished
  }).finally(() => tinta.remove())
}

/** Tema em uso agora ('claro' ou 'escuro') e a preferência escolhida. */
export function useTema() {
  const atual = useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } },
    () => `${preferencia}:${document.documentElement.dataset.tema ?? 'escuro'}`)
  const [pref, tema] = atual.split(':') as [Preferencia, 'claro' | 'escuro']
  return { preferencia: pref, tema }
}

// ---------- animações ----------
// Como no OpusCash: o painel tem a própria escolha de animações. O "reduzir movimento" do sistema (que no Windows vem
// junto com "Efeitos de animação" desligado) não tira as animações sozinho; quem prefere menos movimento escolhe no menu da conta.
export type Movimento = 'completo' | 'reduzido'
const CHAVE_MOVIMENTO = 'painel-movimento'
let movimento: Movimento = (() => {
  try { return localStorage.getItem(CHAVE_MOVIMENTO) === 'reduzido' ? 'reduzido' : 'completo' } catch { return 'completo' }
})()
const ouvintesMovimento = new Set<() => void>()
const aplicarMovimento = () => {
  document.documentElement.dataset.movimento = movimento
  ouvintesMovimento.forEach((f) => f())
}
aplicarMovimento()

/** true quando a pessoa escolheu animações reduzidas no menu da conta. */
export const semMovimento = () => movimento === 'reduzido'
export function useMovimento() {
  return useSyncExternalStore((f) => { ouvintesMovimento.add(f); return () => { ouvintesMovimento.delete(f) } }, () => movimento)
}
export function definirMovimento(m: Movimento) {
  movimento = m
  try { localStorage.setItem(CHAVE_MOVIMENTO, m) } catch { /* vale só nesta visita */ }
  aplicarMovimento()
}
