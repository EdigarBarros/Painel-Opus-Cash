import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ICONES } from '../lib/iconesDoApp'
import {
  CORES, DesenhoElemento, estiloDaCaixa, FUNDOS, TAMANHO, TelaArte, type Arte, type Elemento, type Formato, type Fundo, type Texto, type Tipo,
} from '../pecas/ArteNovidade'
import { Icone } from '../pecas/Icone'
import { Segmentado } from '../pecas/Segmentado'

/*
 * Editor da arte da novidade: arrastar, redimensionar, camadas, guias de alinhamento e modelos prontos.
 * Atalhos: Delete apaga, setas movem (Shift = 10), Ctrl+D duplica, Ctrl+Z desfaz, Ctrl+Shift+Z refaz, Esc tira a seleção.
 */

const NOME_DO_TIPO: Record<Tipo, string> = {
  texto: 'Texto', marca: 'Marca', simbolo: 'Símbolo', cartao: 'Cartão', grafico: 'Gráfico', barras: 'Barras', rosca: 'Rosca',
  moedas: 'Moedas', selo: 'Selo', botao: 'Botão', icone: 'Ícone', forma: 'Forma', brilho: 'Brilho',
}
const ICONE_DO_TIPO: Record<Tipo, string> = {
  texto: 'lapis', marca: 'infinito', simbolo: 'infinito', cartao: 'cartao', grafico: 'investir', barras: 'ano', rosca: 'meta',
  moedas: 'dinheiro', selo: 'estrela', botao: 'check', icone: 'ideia', forma: 'grade', brilho: 'sol',
}
/** Estes esticam livres; os outros mantêm a proporção ao puxar o canto. */
const LIVRES: Tipo[] = ['forma', 'brilho', 'botao', 'selo', 'grafico', 'barras']
const NOMES_DAS_CORES: Record<string, string> = {
  branco: 'Branco', suave: 'Cinza', escuro: 'Escuro', verde: 'Verde', azul: 'Azul', violeta: 'Violeta', amarelo: 'Amarelo', rosa: 'Rosa', ciano: 'Ciano',
}
const NOME_DO_FUNDO: Record<Fundo, string> = { noite: 'Noite', aurora: 'Aurora', marca: 'OpusCash', violeta: 'Violeta', verde: 'Verde', claro: 'Claro' }

let contador = 0
const novoId = () => `e${Date.now().toString(36)}${(contador++).toString(36)}`
const t = (pt: string): Texto => ({ pt })

/** Um elemento novo, já com um tamanho bom, no meio da tela. */
function criar(tipo: Tipo, f: Formato, extra: Partial<Elemento> = {}): Elemento {
  const T = TAMANHO[f]
  const base: Record<Tipo, Partial<Elemento>> = {
    texto: { w: 300, h: 40, texto: t('Escreva aqui'), tam: 30, peso: 800, cor: 'branco', fonte: 'titulo', alinhar: 'esq' },
    marca: { w: 200, h: 32 },
    simbolo: { w: 90, h: 44 },
    cartao: { w: 150, h: 94, cor: 'violeta', giro: -8 },
    grafico: { w: 220, h: 150, cor: 'ciano' },
    barras: { w: 150, h: 96 },
    rosca: { w: 84, h: 84, valor: 75, cor: 'ciano' },
    moedas: { w: 60, h: 52 },
    selo: { w: 110, h: 34, texto: t('+18%'), icone: 'investir', cor: 'verde' },
    botao: { w: 140, h: 40, texto: t('7 dias grátis'), cor: 'verde' },
    icone: { w: 84, h: 84, icone: 'estrela', cor: 'azul' },
    forma: { w: 160, h: 110, cor: 'azul', raio: 18 },
    brilho: { w: 220, h: 220, cor: 'azul' },
  }
  const b = { ...base[tipo], ...extra }
  return { id: novoId(), tipo, x: Math.round((T.w - (b.w ?? 100)) / 2), y: Math.round((T.h - (b.h ?? 100)) / 2), w: 100, h: 100, ...b } as Elemento
}

/* ---------- modelos prontos ---------- */
function modelo(nome: 'lancamento' | 'novidade' | 'suporte'): Arte {
  const e = (tipo: Tipo, f: Formato, o: Partial<Elemento>) => ({ ...criar(tipo, f), ...o })
  if (nome === 'lancamento') {
    const f: Formato = 'deitado'
    return {
      formato: f, fundo: 'noite', elementos: [
        e('brilho', f, { x: 380, y: -10, w: 280, h: 280, cor: 'azul' }),
        e('marca', f, { x: 30, y: 26, w: 210, h: 34 }),
        e('texto', f, { x: 30, y: 82, w: 300, texto: t('Seu dinheiro,'), tam: 34 }),
        e('texto', f, { x: 30, y: 120, w: 300, texto: t('infinitas'), tam: 34, destaque: true }),
        e('texto', f, { x: 30, y: 158, w: 300, texto: t('possibilidades'), tam: 34 }),
        e('texto', f, { x: 30, y: 210, w: 290, texto: t('Cartões, contas, metas e dívidas num painel só.'), tam: 13, peso: 400, cor: 'suave', fonte: 'texto' }),
        e('botao', f, { x: 30, y: 254, w: 124, h: 36, texto: t('7 dias grátis') }),
        e('texto', f, { x: 168, y: 263, w: 160, texto: t('opuscash.com.br'), tam: 13, peso: 400, cor: 'suave', fonte: 'texto' }),
        e('grafico', f, { x: 372, y: 58, w: 236, h: 166 }),
        e('cartao', f, { x: 340, y: 104, w: 128, h: 80, giro: -10 }),
        e('selo', f, { x: 512, y: 26, w: 100, h: 32 }),
        e('barras', f, { x: 470, y: 214, w: 140, h: 88 }),
        e('rosca', f, { x: 384, y: 220, w: 74, h: 74 }),
        e('moedas', f, { x: 566, y: 176, w: 54, h: 46 }),
      ],
    }
  }
  const f: Formato = 'em_pe'
  if (nome === 'suporte') {
    return {
      formato: f, fundo: 'aurora', elementos: [
        e('marca', f, { x: 28, y: 26, w: 170, h: 28 }),
        e('selo', f, { x: 268, y: 24, w: 104, h: 30, texto: t('Novidade'), icone: 'estrela', cor: 'amarelo' }),
        e('icone', f, { x: 150, y: 90, w: 100, h: 100, icone: 'pessoa', cor: 'violeta' }),
        e('icone', f, { x: 84, y: 150, w: 52, h: 52, icone: 'email', cor: 'azul', giro: -8 }),
        e('icone', f, { x: 266, y: 146, w: 52, h: 52, icone: 'relogio', cor: 'verde', giro: 8 }),
        e('texto', f, { x: 30, y: 236, w: 340, texto: t('Agora tem'), tam: 34, alinhar: 'centro' }),
        e('texto', f, { x: 30, y: 276, w: 340, texto: t('suporte no app'), tam: 34, alinhar: 'centro', destaque: true }),
        e('texto', f, { x: 40, y: 330, w: 320, texto: t('Fale com a gente sem sair do OpusCash. Resposta rápida.'), tam: 15, peso: 400, cor: 'suave', fonte: 'texto', alinhar: 'centro' }),
        e('botao', f, { x: 120, y: 410, w: 160, h: 42, texto: t('Fale com a gente') }),
      ],
    }
  }
  return {
    formato: f, fundo: 'noite', elementos: [
      e('brilho', f, { x: 90, y: 40, w: 220, h: 220, cor: 'azul' }),
      e('marca', f, { x: 28, y: 26, w: 170, h: 28 }),
      e('selo', f, { x: 268, y: 24, w: 104, h: 30, texto: t('Novidade'), icone: 'estrela', cor: 'verde' }),
      e('icone', f, { x: 145, y: 96, w: 110, h: 110, icone: 'estrela', cor: 'azul' }),
      e('texto', f, { x: 30, y: 246, w: 340, texto: t('Título da novidade'), tam: 32, alinhar: 'centro' }),
      e('texto', f, { x: 40, y: 300, w: 320, texto: t('Uma frase curta explicando o que mudou.'), tam: 15, peso: 400, cor: 'suave', fonte: 'texto', alinhar: 'centro' }),
      e('botao', f, { x: 130, y: 404, w: 140, h: 42, texto: t('Ver agora') }),
    ],
  }
}
export const arteInicial = (): Arte => modelo('novidade')

/* ---------- guias de alinhamento ---------- */
type Guia = { eixo: 'x' | 'y'; pos: number }
function encaixar(mov: Elemento, outros: Elemento[], W: number, H: number, limite: number) {
  const xs = [0, W / 2, W, ...outros.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])]
  const ys = [0, H / 2, H, ...outros.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])]
  const meusX = [mov.x, mov.x + mov.w / 2, mov.x + mov.w]
  const meusY = [mov.y, mov.y + mov.h / 2, mov.y + mov.h]
  let dx = 0, dy = 0, melhorX = limite + 1, melhorY = limite + 1
  const guias: Guia[] = []
  let gx: number | null = null, gy: number | null = null
  for (const a of xs) for (const m of meusX) { const d = a - m; if (Math.abs(d) < melhorX) { melhorX = Math.abs(d); dx = d; gx = a } }
  for (const a of ys) for (const m of meusY) { const d = a - m; if (Math.abs(d) < melhorY) { melhorY = Math.abs(d); dy = d; gy = a } }
  if (melhorX > limite) dx = 0; else if (gx !== null) guias.push({ eixo: 'x', pos: gx })
  if (melhorY > limite) dy = 0; else if (gy !== null) guias.push({ eixo: 'y', pos: gy })
  return { dx, dy, guias }
}

/* ---------- painéis de opções ---------- */

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return <label className="ea-linha"><span>{rotulo}</span>{children}</label>
}

function Cores({ valor, aoMudar }: { valor?: string; aoMudar: (c: string) => void }) {
  return (
    <div className="ea-cores" role="group" aria-label="Cor">
      {Object.keys(CORES).map((c) => (
        <button key={c} type="button" className={valor === c ? 'ativo' : ''} style={{ background: CORES[c] }} title={NOMES_DAS_CORES[c]}
          aria-label={NOMES_DAS_CORES[c]} aria-pressed={valor === c} onClick={() => aoMudar(c)} />
      ))}
    </div>
  )
}

function CampoTexto({ valor, aoMudar, traducoes, multilinha, refCampo }: {
  valor?: Texto; aoMudar: (t: Texto) => void; traducoes: boolean; multilinha?: boolean; refCampo?: React.Ref<HTMLTextAreaElement>
}) {
  const v = valor ?? { pt: '' }
  return (
    <>
      {multilinha
        ? <textarea ref={refCampo} rows={2} value={v.pt} maxLength={160} onChange={(e) => aoMudar({ ...v, pt: e.target.value })} aria-label="Texto" />
        : <input value={v.pt} maxLength={40} onChange={(e) => aoMudar({ ...v, pt: e.target.value })} aria-label="Texto" />}
      {traducoes && (
        <div className="ea-traducoes">
          <input placeholder="Em inglês" value={v.en ?? ''} maxLength={160} onChange={(e) => aoMudar({ ...v, en: e.target.value })} aria-label="Em inglês" />
          <input placeholder="Em espanhol" value={v.es ?? ''} maxLength={160} onChange={(e) => aoMudar({ ...v, es: e.target.value })} aria-label="Em espanhol" />
        </div>
      )}
    </>
  )
}

function GradeIcones({ valor, aoMudar }: { valor?: string; aoMudar: (n: string) => void }) {
  return (
    <div className="ea-icones">
      {ICONES.map((n) => (
        <button key={n} type="button" className={valor === n ? 'ativo' : ''} title={n} aria-label={n} onClick={() => aoMudar(n)}><Icone nome={n} tamanho={17} /></button>
      ))}
    </div>
  )
}

/* ---------- o editor ---------- */

export function EditorArte({ arte, aoMudar, traducoes }: { arte: Arte; aoMudar: (a: Arte) => void; traducoes: boolean }) {
  const T = TAMANHO[arte.formato]
  const [sel, setSel] = useState<string | null>(null)
  const [guias, setGuias] = useState<Guia[]>([])
  const desfazer = useRef<Arte[]>([])
  const refazer = useRef<Arte[]>([])
  const palco = useRef<HTMLDivElement>(null)
  const campoTexto = useRef<HTMLTextAreaElement>(null)
  const [larguraPalco, setLarguraPalco] = useState(600)
  const atual = useRef(arte)
  useLayoutEffect(() => { atual.current = arte })

  useLayoutEffect(() => {
    const el = palco.current
    if (!el) return
    const medir = () => setLarguraPalco(el.clientWidth)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const escala = Math.min((larguraPalco - 32) / T.w, 560 / T.h, 1.6)

  /** muda a arte guardando o passo para o Ctrl+Z */
  const mudar = useCallback((nova: Arte, guardar = true) => {
    if (guardar) { desfazer.current = [...desfazer.current.slice(-60), atual.current]; refazer.current = [] }
    atual.current = nova
    aoMudar(nova)
  }, [aoMudar])
  const mudarEl = (id: string, m: Partial<Elemento>, guardar = true) =>
    mudar({ ...atual.current, elementos: atual.current.elementos.map((e) => (e.id === id ? { ...e, ...m } : e)) }, guardar)

  const el = arte.elementos.find((e) => e.id === sel) ?? null

  const adicionar = (tipo: Tipo, extra?: Partial<Elemento>) => {
    const novo = criar(tipo, arte.formato, extra)
    mudar({ ...arte, elementos: tipo === 'brilho' || tipo === 'forma' ? [novo, ...arte.elementos] : [...arte.elementos, novo] })
    setSel(novo.id)
  }
  const apagar = (id: string) => { mudar({ ...arte, elementos: arte.elementos.filter((e) => e.id !== id) }); setSel(null) }
  const duplicar = (id: string) => {
    const i = arte.elementos.findIndex((e) => e.id === id)
    if (i < 0) return
    const c = { ...arte.elementos[i], id: novoId(), x: arte.elementos[i].x + 14, y: arte.elementos[i].y + 14 }
    const l = [...arte.elementos]; l.splice(i + 1, 0, c)
    mudar({ ...arte, elementos: l }); setSel(c.id)
  }
  const camada = (id: string, para: 'frente' | 'tras' | 'subir' | 'descer') => {
    const l = [...arte.elementos]
    const i = l.findIndex((e) => e.id === id)
    const [x] = l.splice(i, 1)
    const j = para === 'frente' ? l.length : para === 'tras' ? 0 : para === 'subir' ? Math.min(l.length, i + 1) : Math.max(0, i - 1)
    l.splice(j, 0, x)
    mudar({ ...arte, elementos: l })
  }
  const trocarFormato = (f: Formato) => {
    if (f === arte.formato) return
    const a = TAMANHO[arte.formato], b = TAMANHO[f]
    const k = Math.min(b.w / a.w, b.h / a.h)
    const ox = (b.w - a.w * k) / 2, oy = (b.h - a.h * k) / 2
    mudar({
      ...arte, formato: f, elementos: arte.elementos.map((e) => ({
        ...e, x: Math.round(e.x * k + ox), y: Math.round(e.y * k + oy), w: Math.round(e.w * k), h: Math.round(e.h * k),
        tam: e.tam && e.tipo === 'texto' ? Math.round(e.tam * k) : e.tam,
      })),
    })
  }
  const usarModelo = (m: 'lancamento' | 'novidade' | 'suporte') => {
    if (arte.elementos.length && !window.confirm('Trocar a arte atual pelo modelo? Dá para desfazer com Ctrl+Z.')) return
    mudar(modelo(m)); setSel(null)
  }

  // texto: a altura acompanha o conteúdo (a caixa cresce quando o texto quebra a linha)
  const caixas = useRef(new Map<string, HTMLDivElement>())
  useLayoutEffect(() => {
    let mudou = false
    const l = arte.elementos.map((e) => {
      if (e.tipo !== 'texto') return e
      const n = caixas.current.get(e.id)?.firstElementChild as HTMLElement | null
      const h = n ? Math.ceil(n.offsetHeight) : e.h
      if (n && Math.abs(h - e.h) > 1) { mudou = true; return { ...e, h } }
      return e
    })
    if (mudou) mudar({ ...arte, elementos: l }, false)
  })

  // arrastar e redimensionar
  const arrastar = (ev: React.PointerEvent, e: Elemento, alca?: 'no' | 'ne' | 'so' | 'se' | 'l' | 'b') => {
    ev.stopPropagation()
    ev.preventDefault()
    setSel(e.id)
    const inicio = { x: ev.clientX, y: ev.clientY }
    const orig = { ...e }
    const outros = atual.current.elementos.filter((o) => o.id !== e.id)
    let guardou = false
    const mover = (m: PointerEvent) => {
      const dx = (m.clientX - inicio.x) / escala, dy = (m.clientY - inicio.y) / escala
      if (!guardou && Math.abs(dx) + Math.abs(dy) < 1) return
      let n: Elemento
      if (!alca) {
        n = { ...orig, x: Math.round(orig.x + dx), y: Math.round(orig.y + dy) }
        if (!m.altKey) {
          const s = encaixar(n, outros, T.w, T.h, 6 / escala)
          n = { ...n, x: Math.round(n.x + s.dx), y: Math.round(n.y + s.dy) }
          setGuias(s.guias)
        }
      } else if (alca === 'l') {
        n = { ...orig, w: Math.max(12, Math.round(orig.w + dx)) }
      } else if (alca === 'b') {
        n = { ...orig, h: Math.max(12, Math.round(orig.h + dy)) }
      } else {
        const sx = alca === 'ne' || alca === 'se' ? 1 : -1, sy = alca === 'so' || alca === 'se' ? 1 : -1
        let w = Math.max(12, orig.w + sx * dx), h = Math.max(12, orig.h + sy * dy)
        const proporcional = !LIVRES.includes(orig.tipo) || m.shiftKey
        if (proporcional) { const k = Math.max(w / orig.w, h / orig.h); w = orig.w * k; h = orig.h * k }
        n = { ...orig, w: Math.round(w), h: Math.round(h), x: Math.round(sx < 0 ? orig.x + orig.w - w : orig.x), y: Math.round(sy < 0 ? orig.y + orig.h - h : orig.y) }
        if (orig.tipo === 'texto') n.tam = Math.max(6, Math.round(((orig.tam ?? 28) * w) / orig.w))
      }
      if (!guardou) { desfazer.current = [...desfazer.current.slice(-60), atual.current]; refazer.current = []; guardou = true }
      mudar({ ...atual.current, elementos: atual.current.elementos.map((x) => (x.id === e.id ? n : x)) }, false)
    }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      setGuias([])
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }

  // atalhos do teclado
  useEffect(() => {
    const tecla = (k: KeyboardEvent) => {
      const alvo = k.target as HTMLElement
      if (alvo.closest('input, textarea, select')) return
      const ctrl = k.ctrlKey || k.metaKey
      if (ctrl && k.key.toLowerCase() === 'z') {
        k.preventDefault()
        const pilha = k.shiftKey ? refazer : desfazer, outra = k.shiftKey ? desfazer : refazer
        const a = pilha.current.pop()
        if (a) { outra.current.push(atual.current); atual.current = a; aoMudar(a) }
        return
      }
      if (ctrl && k.key.toLowerCase() === 'y') {
        k.preventDefault()
        const a = refazer.current.pop()
        if (a) { desfazer.current.push(atual.current); atual.current = a; aoMudar(a) }
        return
      }
      if (!sel) return
      if (k.key === 'Delete' || k.key === 'Backspace') { k.preventDefault(); apagar(sel) }
      else if (ctrl && k.key.toLowerCase() === 'd') { k.preventDefault(); duplicar(sel) }
      else if (k.key === 'Escape') setSel(null)
      else if (k.key.startsWith('Arrow')) {
        k.preventDefault()
        const p = k.shiftKey ? 10 : 1
        const e = atual.current.elementos.find((x) => x.id === sel)
        if (!e) return
        mudarEl(sel, { x: e.x + (k.key === 'ArrowLeft' ? -p : k.key === 'ArrowRight' ? p : 0), y: e.y + (k.key === 'ArrowUp' ? -p : k.key === 'ArrowDown' ? p : 0) })
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })

  const renderizar = (e: Elemento, z: number) => (
    <div key={e.id} ref={(n) => { if (n) caixas.current.set(e.id, n); else caixas.current.delete(e.id) }}
      className={`arte-el el-${e.tipo} ea-el ${sel === e.id ? 'sel' : ''}`} style={estiloDaCaixa(e, z)}
      onPointerDown={(ev) => arrastar(ev, e)} onDoubleClick={() => campoTexto.current?.focus()}>
      <DesenhoElemento e={e} />
      {sel === e.id && (
        <>
          {(['no', 'ne', 'so', 'se'] as const).map((a) => (
            <i key={a} className={`ea-alca ${a}`} style={{ '--k': 1 / escala } as React.CSSProperties} onPointerDown={(ev) => arrastar(ev, e, a)} />
          ))}
          <i className="ea-alca l" style={{ '--k': 1 / escala } as React.CSSProperties} onPointerDown={(ev) => arrastar(ev, e, 'l')} />
          {e.tipo !== 'texto' && <i className="ea-alca b" style={{ '--k': 1 / escala } as React.CSSProperties} onPointerDown={(ev) => arrastar(ev, e, 'b')} />}
        </>
      )}
    </div>
  )

  const ADICIONAR: [Tipo, string, Partial<Elemento>?][] = [
    ['texto', 'Título'], ['texto', 'Frase', { texto: t('Uma frase curta'), tam: 15, peso: 400, cor: 'suave', fonte: 'texto', w: 260 }],
    ['marca', 'Marca'], ['simbolo', 'Símbolo'], ['cartao', 'Cartão'], ['grafico', 'Gráfico'], ['barras', 'Barras'], ['rosca', 'Rosca'],
    ['moedas', 'Moedas'], ['selo', 'Selo'], ['botao', 'Botão'], ['icone', 'Ícone'], ['forma', 'Forma'], ['brilho', 'Brilho'],
  ]

  return (
    <div className="editor-arte">
      <aside className="ea-lado">
        <p className="ea-titulo">Começar de um modelo</p>
        <div className="ea-modelos">
          <button type="button" onClick={() => usarModelo('lancamento')}><b>Lançamento</b><small>deitado, como o anúncio</small></button>
          <button type="button" onClick={() => usarModelo('novidade')}><b>Novidade</b><small>em pé, ícone grande</small></button>
          <button type="button" onClick={() => usarModelo('suporte')}><b>Suporte</b><small>em pé, três ícones</small></button>
        </div>
        <p className="ea-titulo">Formato</p>
        <Segmentado rotulo="Formato" valor={arte.formato} aoMudar={trocarFormato} opcoes={[['em_pe', 'Em pé'], ['deitado', 'Deitado']]} />
        <p className="ea-titulo">Fundo</p>
        <div className="ea-fundos">
          {FUNDOS.map((f) => (
            <button key={f} type="button" className={`arte fundo-${f} ${arte.fundo === f ? 'ativo' : ''}`} title={NOME_DO_FUNDO[f]}
              aria-label={`Fundo ${NOME_DO_FUNDO[f]}`} aria-pressed={arte.fundo === f} onClick={() => mudar({ ...arte, fundo: f })}><i className="arte-fundo-a" /></button>
          ))}
        </div>
        <p className="ea-titulo">Pôr na arte</p>
        <div className="ea-adicionar">
          {ADICIONAR.map(([tipo, nome, extra], i) => (
            <button key={i} type="button" onClick={() => adicionar(tipo, extra)}><Icone nome={ICONE_DO_TIPO[tipo]} tamanho={18} />{nome}</button>
          ))}
        </div>
      </aside>

      <div className="ea-centro">
        <div ref={palco} className="ea-palco">
          <div className="ea-tela" style={{ width: T.w * escala, height: T.h * escala }}>
            <div style={{ width: T.w, height: T.h, transform: `scale(${escala})`, transformOrigin: '0 0' }}>
              <TelaArte arte={arte} renderizar={renderizar} aoTocarFundo={() => setSel(null)}
                extra={<>
                  <span className="ea-fechar-fantasma" title="Aqui fica o botão de fechar" aria-hidden="true">×</span>
                  {guias.map((g, i) => <i key={i} className={`ea-guia ${g.eixo}`} style={g.eixo === 'x' ? { left: g.pos } : { top: g.pos }} />)}
                </>} />
            </div>
          </div>
        </div>
        <p className="ea-dica">Arraste para mover · puxe os cantos para mudar o tamanho (Shift mantém a proporção) · Alt solta das guias · Delete apaga · Ctrl+Z desfaz · o canto com × é onde fica o botão de fechar</p>
      </div>

      <aside className="ea-lado">
        {el ? (
          <div className="ea-props">
            <div className="ea-props-topo">
              <b><Icone nome={ICONE_DO_TIPO[el.tipo]} tamanho={16} />{NOME_DO_TIPO[el.tipo]}</b>
              <div className="ea-acoes">
                <button type="button" title="Duplicar (Ctrl+D)" aria-label="Duplicar" onClick={() => duplicar(el.id)}><Icone nome="copiar" tamanho={16} /></button>
                <button type="button" title="Apagar (Delete)" aria-label="Apagar" className="perigo" onClick={() => apagar(el.id)}><Icone nome="lixeira" tamanho={16} /></button>
              </div>
            </div>

            {(el.tipo === 'texto' || el.tipo === 'selo' || el.tipo === 'botao') && (
              <Linha rotulo="Texto">
                <CampoTexto valor={el.texto} traducoes={traducoes} multilinha={el.tipo === 'texto'} refCampo={campoTexto} aoMudar={(texto) => mudarEl(el.id, { texto })} />
              </Linha>
            )}
            {el.tipo === 'texto' && (
              <>
                <Linha rotulo={`Tamanho da letra: ${el.tam ?? 28}`}>
                  <input type="range" min={8} max={96} value={el.tam ?? 28} onChange={(e) => mudarEl(el.id, { tam: Number(e.target.value) })} />
                </Linha>
                <div className="ea-dupla">
                  <Segmentado rotulo="Peso" valor={el.peso ?? 800} aoMudar={(peso) => mudarEl(el.id, { peso })} opcoes={[[400, 'Fino'], [600, 'Médio'], [800, 'Forte']]} />
                  <Segmentado rotulo="Alinhar" valor={el.alinhar ?? 'esq'} aoMudar={(alinhar) => mudarEl(el.id, { alinhar })}
                    opcoes={[['esq', 'Esquerda'], ['centro', 'Centro'], ['dir', 'Direita']]} />
                </div>
                <Segmentado rotulo="Letra" valor={el.fonte ?? 'titulo'} aoMudar={(fonte) => mudarEl(el.id, { fonte })} opcoes={[['titulo', 'Título'], ['texto', 'Texto'], ['marca', 'Marca']]} />
                <label className="ea-marcar"><input type="checkbox" checked={Boolean(el.destaque)} onChange={(e) => mudarEl(el.id, { destaque: e.target.checked })} />Degradê da marca</label>
              </>
            )}
            {['texto', 'cartao', 'grafico', 'rosca', 'selo', 'botao', 'icone', 'forma', 'brilho'].includes(el.tipo) && !(el.tipo === 'texto' && el.destaque) && (
              <Linha rotulo="Cor"><Cores valor={el.cor} aoMudar={(c) => mudarEl(el.id, { cor: c })} /></Linha>
            )}
            {el.tipo === 'rosca' && (
              <Linha rotulo={`Porcentagem: ${el.valor ?? 75}%`}>
                <input type="range" min={0} max={100} value={el.valor ?? 75} onChange={(e) => mudarEl(el.id, { valor: Number(e.target.value) })} />
              </Linha>
            )}
            {(el.tipo === 'icone' || el.tipo === 'selo') && (
              <Linha rotulo="Ícone"><GradeIcones valor={el.icone} aoMudar={(icone) => mudarEl(el.id, { icone })} /></Linha>
            )}
            {el.tipo === 'forma' && (
              <>
                <Linha rotulo={`Cantos: ${el.raio ?? 18}`}>
                  <input type="range" min={0} max={200} value={el.raio ?? 18} onChange={(e) => mudarEl(el.id, { raio: Number(e.target.value) })} />
                </Linha>
                <label className="ea-marcar"><input type="checkbox" checked={Boolean(el.contorno)} onChange={(e) => mudarEl(el.id, { contorno: e.target.checked })} />Só o contorno</label>
              </>
            )}
            <Linha rotulo={`Inclinação: ${el.giro ?? 0}°`}>
              <input type="range" min={-30} max={30} value={el.giro ?? 0} onChange={(e) => mudarEl(el.id, { giro: Number(e.target.value) })} />
            </Linha>
            <Linha rotulo={`Transparência: ${Math.round((1 - (el.opac ?? 1)) * 100)}%`}>
              <input type="range" min={5} max={100} value={Math.round((el.opac ?? 1) * 100)} onChange={(e) => mudarEl(el.id, { opac: Number(e.target.value) / 100 })} />
            </Linha>
            <div className="ea-camadas-botoes">
              <button type="button" onClick={() => camada(el.id, 'frente')}><Icone nome="sobe" tamanho={15} />Para a frente</button>
              <button type="button" onClick={() => camada(el.id, 'tras')}><Icone nome="desce" tamanho={15} />Para trás</button>
            </div>
          </div>
        ) : (
          <p className="ea-vazio"><Icone nome="ideia" tamanho={18} />Toque num elemento da arte para mudar texto, cor e tamanho.</p>
        )}

        <p className="ea-titulo">Camadas <small>(de cima para baixo)</small></p>
        <ol className="ea-camadas">
          {[...arte.elementos].reverse().map((e) => (
            <li key={e.id} className={sel === e.id ? 'ativo' : ''}>
              <button type="button" className="ea-camada-nome" onClick={() => setSel(e.id)}>
                <Icone nome={ICONE_DO_TIPO[e.tipo]} tamanho={15} />
                <span>{e.texto?.pt?.trim() || NOME_DO_TIPO[e.tipo]}</span>
              </button>
              <button type="button" aria-label="Subir" title="Subir" onClick={() => camada(e.id, 'subir')}><Icone nome="cima" tamanho={14} /></button>
              <button type="button" aria-label="Descer" title="Descer" onClick={() => camada(e.id, 'descer')}><Icone nome="abaixo" tamanho={14} /></button>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  )
}
