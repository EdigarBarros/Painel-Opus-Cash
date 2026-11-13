import { semMovimento } from './tema'

/**
 * Efeito magnético (o mesmo de src/lib/ima.ts do OpusCash): botões e controles pequenos são puxados de leve na direção do
 * cursor. Grava o deslocamento em --tx/--ty (no máximo uma vez por quadro); o CSS anima com mola.
 */
const ALVOS = '.botao, .filtro, .icone-btn, .acao-azulejo, .conta-botao, .aba-ficha, .copiar'
const FORCA = 0.18
const MAXIMO = 5

export function iniciarIma() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
  if (semMovimento()) return
  let quadro = 0
  let ultimo: PointerEvent | null = null
  let atual: HTMLElement | null = null

  const soltar = (el: HTMLElement | null) => {
    if (!el) return
    el.style.removeProperty('--tx')
    el.style.removeProperty('--ty')
  }

  window.addEventListener('pointermove', (e) => {
    ultimo = e
    if (quadro) return
    quadro = requestAnimationFrame(() => {
      quadro = 0
      const ev = ultimo
      if (!ev) return
      const el = (ev.target as Element | null)?.closest<HTMLElement>(ALVOS) ?? null
      if (el !== atual) { soltar(atual); atual = el }
      if (!el) return
      const r = el.getBoundingClientRect()
      const limite = (v: number) => Math.max(-MAXIMO, Math.min(MAXIMO, v))
      el.style.setProperty('--tx', `${limite((ev.clientX - (r.left + r.width / 2)) * FORCA)}px`)
      el.style.setProperty('--ty', `${limite((ev.clientY - (r.top + r.height / 2)) * FORCA)}px`)
    })
  }, { passive: true })
  document.addEventListener('pointerleave', () => { soltar(atual); atual = null })
}
