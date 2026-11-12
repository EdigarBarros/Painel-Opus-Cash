import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'

/*
 * Gráficos do Início, em SVG puro (sem biblioteca): área com linha suave, barras empilhadas, rosca e minigráfico.
 * O desenho acompanha a largura real do cartão (o texto não estica), entra com a mesma "cortina" dos gráficos do
 * OpusCash e responde a mouse, toque e teclado (setas), com o valor numa etiqueta flutuante.
 */

function useLargura<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [largura, setLargura] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setLargura(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, largura] as const
}

/** Topo do eixo arredondado para cima (1, 2, 2,5, 5 ou 10 × potência de 10). */
function topoBonito(max: number) {
  if (max <= 0) return 4
  const p = Math.pow(10, Math.floor(Math.log10(max)))
  const passo = [1, 2, 2.5, 5, 10].find((m) => m * p >= max) ?? 10
  const topo = passo * p
  return topo < 4 && Number.isInteger(max) ? 4 : topo
}

/** Curva monótona (Fritsch–Carlson): suave, sem passar abaixo de zero nem inventar picos entre os pontos. */
function curva(pts: [number, number][]) {
  const n = pts.length
  if (n === 0) return ''
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`
  const dx: number[] = [], m: number[] = [], t: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0]
    m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]
  }
  t[0] = m[0]
  t[n - 1] = m[n - 2]
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i] }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    d += ` C${pts[i][0] + h},${pts[i][1] + t[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - t[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`
  }
  return d
}

const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

export interface Serie { nome: string; cor: string; valores: number[] }

const MARGEM = { topo: 14, dir: 8, base: 26, esq: 44 }

/** Moldura comum: eixos, linhas de grade, leitura do ponto em foco (mouse, toque ou setas) e a etiqueta flutuante. */
function Moldura({ rotulos, series, altura, formato, rotuloDoPonto, tituloDoPonto = rotuloDoPonto, desenhar, empilhar, descricao }: {
  rotulos: string[]; series: Serie[]; altura: number; formato: (n: number) => string
  rotuloDoPonto: (i: number) => string; tituloDoPonto?: (i: number) => string; empilhar?: boolean; descricao: string
  desenhar: (g: { x: (i: number) => number; y: (v: number) => number; passo: number; foco: number | null; base: number }) => ReactNode
}) {
  const [ref, largura] = useLargura<HTMLDivElement>()
  const [foco, setFoco] = useState<number | null>(null)
  const n = rotulos.length
  const totais = rotulos.map((_, i) => (empilhar ? series.reduce((s, x) => s + (x.valores[i] ?? 0), 0) : Math.max(...series.map((x) => x.valores[i] ?? 0))))
  const topo = topoBonito(Math.max(0, ...totais))
  const area = { l: MARGEM.esq, r: Math.max(MARGEM.esq + 10, largura - MARGEM.dir), t: MARGEM.topo, b: altura - MARGEM.base }
  const passo = n > 1 ? (area.r - area.l) / (empilhar ? n : n - 1) : 0
  const x = (i: number) => (empilhar ? area.l + passo * (i + 0.5) : n > 1 ? area.l + passo * i : (area.l + area.r) / 2)
  const y = (v: number) => area.b - (v / topo) * (area.b - area.t)
  const marcas = [0, topo / 2, topo]
  const qualRotulo = new Set([0, Math.floor((n - 1) / 2), n - 1])

  const indiceDo = (e: PointerEvent<HTMLDivElement>) => {
    const caixa = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - caixa.left
    const i = empilhar ? Math.floor((px - area.l) / passo) : Math.round((px - area.l) / (passo || 1))
    return Math.max(0, Math.min(n - 1, i))
  }
  const teclas = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const d = e.key === 'ArrowRight' ? 1 : -1
      setFoco((f) => Math.max(0, Math.min(n - 1, (f ?? (d > 0 ? -1 : n)) + d)))
    } else if (e.key === 'Escape') setFoco(null)
  }

  const etiquetaX = foco !== null ? x(foco) : 0
  const lado = etiquetaX > largura * 0.62 ? 'esquerda' : 'direita'
  return (
    <div ref={ref} className="grafico" style={{ height: altura }} tabIndex={0} role="img" aria-label={descricao}
      onPointerMove={(e) => setFoco(indiceDo(e))} onPointerDown={(e) => setFoco(indiceDo(e))} onPointerLeave={() => setFoco(null)}
      onKeyDown={teclas} onBlur={() => setFoco(null)}>
      {largura > 0 && (
        <svg width={largura} height={altura} aria-hidden="true">
          {marcas.map((v) => (
            <g key={v}>
              <line className="grade" x1={area.l} x2={area.r} y1={y(v)} y2={y(v)} />
              <text className="eixo" x={area.l - 10} y={y(v)} dy="0.32em" textAnchor="end">{formato(v)}</text>
            </g>
          ))}
          {rotulos.map((_, i) => qualRotulo.has(i) && (
            <text key={i} className="eixo" x={x(i)} y={altura - 6} textAnchor={i === 0 && !empilhar ? 'start' : i === n - 1 && !empilhar ? 'end' : 'middle'}>
              {rotuloDoPonto(i)}
            </text>
          ))}
          {desenhar({ x, y, passo, foco, base: area.b })}
          {foco !== null && !empilhar && <line className="mira" x1={x(foco)} x2={x(foco)} y1={area.t} y2={area.b} />}
        </svg>
      )}
      {foco !== null && (
        <div className={`etiqueta-grafico ${lado}`} style={{ left: etiquetaX, top: MARGEM.topo }}>
          <span className="etiqueta-grafico-dia">{maiuscula(tituloDoPonto(foco))}</span>
          {series.map((s) => (
            <span key={s.nome} className="etiqueta-grafico-linha">
              <i style={{ background: s.cor }} />{s.nome}<b>{formato(s.valores[foco] ?? 0)}</b>
            </span>
          ))}
          {empilhar && series.length > 1 && (
            <span className="etiqueta-grafico-linha total">Total<b>{formato(totais[foco])}</b></span>
          )}
        </div>
      )}
    </div>
  )
}

/** Linha suave com área em degradê. */
export function GraficoArea({ rotulos, serie, altura = 240, formato, rotuloDoPonto, tituloDoPonto, descricao }: {
  rotulos: string[]; serie: Serie; altura?: number; formato: (n: number) => string
  rotuloDoPonto: (i: number) => string; tituloDoPonto?: (i: number) => string; descricao: string
}) {
  const id = useId().replace(/:/g, '')
  return (
    <Moldura rotulos={rotulos} series={[serie]} altura={altura} formato={formato} rotuloDoPonto={rotuloDoPonto} tituloDoPonto={tituloDoPonto} descricao={descricao}
      desenhar={({ x, y, foco, base }) => {
        const pts = serie.valores.map((v, i) => [x(i), y(v)] as [number, number])
        const linha = curva(pts)
        const fundo = pts.length ? `${linha} L${pts[pts.length - 1][0]},${base} L${pts[0][0]},${base} Z` : ''
        return (
          <g className="revela" key={`${serie.nome}-${rotulos.length}`}>
            <defs>
              <linearGradient id={`deg-${id}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={serie.cor} stopOpacity=".32" />
                <stop offset="1" stopColor={serie.cor} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={fundo} fill={`url(#deg-${id})`} />
            <path d={linha} fill="none" stroke={serie.cor} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            {foco !== null && pts[foco] && (
              <circle cx={pts[foco][0]} cy={pts[foco][1]} r={5} fill="var(--superficie)" stroke={serie.cor} strokeWidth={2.5} />
            )}
          </g>
        )
      }} />
  )
}

/** Barras empilhadas (uma cor por série), com cantos arredondados no alto. */
export function GraficoBarras({ rotulos, series, altura = 240, formato, rotuloDoPonto, tituloDoPonto, descricao }: {
  rotulos: string[]; series: Serie[]; altura?: number; formato: (n: number) => string
  rotuloDoPonto: (i: number) => string; tituloDoPonto?: (i: number) => string; descricao: string
}) {
  return (
    <Moldura rotulos={rotulos} series={series} altura={altura} formato={formato} rotuloDoPonto={rotuloDoPonto} tituloDoPonto={tituloDoPonto} empilhar descricao={descricao}
      desenhar={({ x, y, passo, foco, base }) => {
        const larg = Math.max(3, Math.min(26, passo * 0.62))
        return (
          <g key={rotulos.length}>
            {rotulos.map((_, i) => {
              let acumulado = 0
              const ultima = series.reduce((u, s, k) => ((s.valores[i] ?? 0) > 0 ? k : u), -1)
              return (
                <g key={i} className={`barra-grupo ${foco !== null && foco !== i ? 'apagada' : ''}`} style={{ animationDelay: `${Math.min(i * 18, 500)}ms` }}>
                  {foco === i && <rect className="faixa-foco" x={x(i) - passo / 2 + 1} width={passo - 2} y={MARGEM.topo} height={base - MARGEM.topo} rx={8} />}
                  {series.map((s, k) => {
                    const v = s.valores[i] ?? 0
                    if (v <= 0) return null
                    const y0 = y(acumulado), y1 = y(acumulado + v)
                    acumulado += v
                    const h = Math.max(2, y0 - y1)
                    const r = k === ultima ? Math.min(6, larg / 2, h) : 0
                    const xe = x(i) - larg / 2
                    const d = r
                      ? `M${xe},${y0} V${y0 - h + r} Q${xe},${y0 - h} ${xe + r},${y0 - h} H${xe + larg - r} Q${xe + larg},${y0 - h} ${xe + larg},${y0 - h + r} V${y0} Z`
                      : `M${xe},${y0} V${y0 - h} H${xe + larg} V${y0} Z`
                    return <path key={s.nome} d={d} fill={s.cor} />
                  })}
                </g>
              )
            })}
          </g>
        )
      }} />
  )
}

export interface Fatia { id: string; nome: string; valor: number; cor: string; href?: string }

/** Rosca com o total no meio; passar o mouse (ou focar) numa fatia ou na legenda mostra só ela. */
export function Rosca({ fatias, rotuloCentro = 'contas' }: { fatias: Fatia[]; rotuloCentro?: string }) {
  const [foco, setFoco] = useState<string | null>(null)
  const total = fatias.reduce((s, f) => s + f.valor, 0)
  const R = 70, ESP = 18, C = 2 * Math.PI * R
  const visiveis = fatias.filter((f) => f.valor > 0)
  const vao = visiveis.length > 1 ? 3 : 0
  const arcos = useMemo(() => visiveis.map((f, i) => {
    const ini = visiveis.slice(0, i).reduce((s, x) => s + (total ? (x.valor / total) * C : 0), 0)
    const comp = total ? (f.valor / total) * C : 0
    return { ...f, ini, comp: Math.max(0.5, comp - vao) }
  }), [visiveis, total, C, vao])
  const atual = fatias.find((f) => f.id === foco)
  const pct = (v: number) => (total ? `${Math.round((v / total) * 100)}%` : '0%')
  return (
    <div className="rosca">
      <div className="rosca-desenho">
        <svg viewBox="0 0 180 180" aria-hidden="true">
          <circle cx="90" cy="90" r={R} fill="none" stroke="var(--preench-3)" strokeWidth={ESP} />
          <g transform="rotate(-90 90 90)">
            {arcos.map((a, i) => (
              <circle key={a.id} className={`rosca-arco ${foco && foco !== a.id ? 'apagado' : ''}`} cx="90" cy="90" r={R} fill="none"
                stroke={a.cor} strokeWidth={foco === a.id ? ESP + 5 : ESP} strokeLinecap="butt"
                strokeDasharray={`${a.comp} ${C}`} strokeDashoffset={-a.ini}
                style={{ animationDelay: `${i * 90}ms` }}
                onPointerEnter={() => setFoco(a.id)} onPointerLeave={() => setFoco(null)} />
            ))}
          </g>
        </svg>
        <div className="rosca-centro" aria-live="polite">
          <strong>{atual ? atual.valor : total}</strong>
          <span>{atual ? `${atual.nome.toLowerCase()} · ${pct(atual.valor)}` : rotuloCentro}</span>
        </div>
      </div>
      <ul className="rosca-legenda">
        {fatias.map((f) => {
          const corpo = (
            <>
              <i style={{ background: f.cor }} />
              <span className="rosca-nome">{f.nome}</span>
              <b>{f.valor}</b>
              <small>{pct(f.valor)}</small>
            </>
          )
          const props = { onPointerEnter: () => setFoco(f.id), onPointerLeave: () => setFoco(null), onFocus: () => setFoco(f.id), onBlur: () => setFoco(null) }
          return (
            <li key={f.id} className={foco && foco !== f.id ? 'apagado' : ''}>
              {f.href ? <a href={f.href} {...props}>{corpo}</a> : <span tabIndex={0} {...props}>{corpo}</span>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Minigráfico de linha para os cartões de número (sem eixos). */
export function Mini({ valores, cor }: { valores: number[]; cor: string }) {
  const id = useId().replace(/:/g, '')
  const L = 120, A = 36
  const max = Math.max(1, ...valores)
  const pts = valores.map((v, i) => [valores.length > 1 ? (i / (valores.length - 1)) * L : L / 2, A - 3 - (v / max) * (A - 6)] as [number, number])
  const linha = curva(pts)
  return (
    <svg className="mini revela" viewBox={`0 0 ${L} ${A}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`mini-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={cor} stopOpacity=".3" />
          <stop offset="1" stopColor={cor} stopOpacity="0" />
        </linearGradient>
      </defs>
      {pts.length > 1 && <path d={`${linha} L${L},${A} L0,${A} Z`} fill={`url(#mini-${id})`} />}
      <path d={linha} fill="none" stroke={cor} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
    </svg>
  )
}
