import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Icone } from './Icone'
import './arte.css'

/*
 * A ARTE da novidade: uma tela montada no painel de suporte (tela Novidades → editor), com elementos do OpusCash
 * (marca, cartão, gráficos, moedas, selos, textos...) posicionados livremente. Este arquivo só DESENHA a arte a partir do
 * JSON guardado em novidades.arte. O MESMO arquivo (e o arte.css) é copiado no painel (src/pecas/) para o editor e a prévia
 * ficarem idênticos ao que a pessoa vê. Mudou aqui? Copie para lá também.
 */

export type Texto = { pt: string; en?: string; es?: string }
export type Formato = 'em_pe' | 'deitado'
export const TAMANHO: Record<Formato, { w: number; h: number }> = { em_pe: { w: 400, h: 500 }, deitado: { w: 640, h: 320 } }

export const FUNDOS = ['noite', 'aurora', 'marca', 'violeta', 'verde', 'claro'] as const
export type Fundo = (typeof FUNDOS)[number]

/** Cores que os elementos podem usar (fixas: a arte é igual no tema claro e no escuro). */
export const CORES: Record<string, string> = {
  branco: '#ffffff', suave: '#a9b4cc', escuro: '#0b1020', verde: '#1fd1a0', azul: '#3b82f6', violeta: '#8b5cf6',
  amarelo: '#fbbf24', rosa: '#f43f5e', ciano: '#22d3ee',
}
export const cor = (c?: string) => CORES[c ?? ''] ?? (c && /^#[0-9a-f]{6}$/i.test(c) ? c : '#ffffff')

export const TIPOS = ['texto', 'marca', 'simbolo', 'cartao', 'grafico', 'barras', 'rosca', 'moedas', 'selo', 'botao', 'icone', 'forma', 'brilho'] as const
export type Tipo = (typeof TIPOS)[number]

export interface Elemento {
  id: string
  tipo: Tipo
  x: number; y: number; w: number; h: number
  /** inclinação em graus (-30 a 30) */
  giro?: number
  /** 0 a 1 */
  opac?: number
  texto?: Texto
  /** texto: tamanho da letra; rosca: porcentagem */
  tam?: number
  peso?: 400 | 600 | 800
  alinhar?: 'esq' | 'centro' | 'dir'
  /** texto com o degradê da marca */
  destaque?: boolean
  fonte?: 'titulo' | 'texto' | 'marca'
  cor?: string
  icone?: string
  valor?: number
  raio?: number
  contorno?: boolean
}
export interface Arte { formato: Formato; fundo: Fundo; elementos: Elemento[] }

type Idioma = 'pt' | 'en' | 'es'
const noIdioma = (t: Texto | undefined, i: Idioma) => (t ? (i !== 'pt' && t[i]?.trim()) || t.pt : '')

/* ---------- ilustrações (SVG que estica com a caixa) ---------- */

function Cartao({ c }: { c: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 160 100" preserveAspectRatio="none" className="arte-svg">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={c} /><stop offset="1" stopColor={c} stopOpacity=".55" /></linearGradient>
        <linearGradient id={`b${id}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity=".28" /><stop offset=".6" stopColor="#fff" stopOpacity="0" /></linearGradient>
      </defs>
      <rect x="1" y="1" width="158" height="98" rx="12" fill={`url(#g${id})`} />
      <rect x="1" y="1" width="158" height="98" rx="12" fill={`url(#b${id})`} />
      <rect x="16" y="34" width="24" height="18" rx="4" fill="#f5d27a" />
      <rect x="16" y="66" width="62" height="6" rx="3" fill="#fff" opacity=".55" />
      <circle cx="122" cy="76" r="11" fill="#fff" opacity=".35" /><circle cx="136" cy="76" r="11" fill="#fff" opacity=".25" />
    </svg>
  )
}

function Grafico({ c }: { c: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <div className="arte-painel">
      <span className="arte-painel-linha" style={{ width: '42%' }} />
      <span className="arte-painel-linha forte" style={{ width: '62%' }} />
      <svg viewBox="0 0 200 110" preserveAspectRatio="none" className="arte-svg arte-grafico">
        <defs><linearGradient id={`a${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c} stopOpacity=".35" /><stop offset="1" stopColor={c} stopOpacity="0" /></linearGradient></defs>
        {[28, 56, 84].map((y) => <line key={y} x1="0" x2="200" y1={y} y2={y} stroke="#fff" strokeOpacity=".07" />)}
        <path d="M0 96 C30 92 45 70 70 72 S110 66 130 46 S170 26 200 8 L200 110 L0 110Z" fill={`url(#a${id})`} />
        <path d="M0 96 C30 92 45 70 70 72 S110 66 130 46 S170 26 200 8" fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  )
}

function Barras() {
  const v = [[62, 40], [80, 52], [70, 45], [88, 60], [74, 50]]
  return (
    <div className="arte-painel">
      <span className="arte-painel-linha" style={{ width: '46%' }} />
      <svg viewBox="0 0 120 70" preserveAspectRatio="none" className="arte-svg arte-grafico">
        {v.map(([a, b], i) => (
          <g key={i}>
            <rect x={6 + i * 23} y={70 - a * .7} width="7" height={a * .7} rx="2" fill="#1fd1a0" />
            <rect x={14 + i * 23} y={70 - b * .7} width="7" height={b * .7} rx="2" fill="#f43f5e" opacity=".85" />
          </g>
        ))}
      </svg>
    </div>
  )
}

function Rosca({ valor, c }: { valor: number; c: string }) {
  const R = 40, C = 2 * Math.PI * R, v = Math.max(0, Math.min(100, valor))
  return (
    <svg viewBox="0 0 100 100" className="arte-svg">
      <circle cx="50" cy="50" r="48" fill="#0b1020" fillOpacity=".55" stroke="#fff" strokeOpacity=".08" />
      <circle cx="50" cy="50" r={R} fill="none" stroke="#fff" strokeOpacity=".1" strokeWidth="9" />
      <circle cx="50" cy="50" r={R} fill="none" stroke={c} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(C * v) / 100} ${C}`} transform="rotate(-90 50 50)" />
      <text x="50" y="57" textAnchor="middle" fontSize="20" fontWeight="800" fill="#fff" fontFamily="var(--fonte-titulo)">{Math.round(v)}%</text>
    </svg>
  )
}

function Moedas() {
  return (
    <svg viewBox="0 0 70 60" className="arte-svg">
      {[40, 30, 20].map((y, i) => (
        <g key={i}>
          <ellipse cx="35" cy={y + 8} rx="30" ry="9" fill="#b7791f" />
          <rect x="5" y={y} width="60" height="8" fill="#d69e2e" />
          <ellipse cx="35" cy={y} rx="30" ry="9" fill="#f6c453" />
        </g>
      ))}
      <text x="35" y="24" textAnchor="middle" fontSize="11" fontWeight="800" fill="#7a4b0c" fontFamily="var(--fonte-titulo)">R$</text>
    </svg>
  )
}

/* ---------- um elemento ---------- */

export function DesenhoElemento({ e, idioma = 'pt' }: { e: Elemento; idioma?: Idioma }) {
  const c = cor(e.cor)
  switch (e.tipo) {
    case 'texto': {
      const estilo: CSSProperties = {
        fontSize: e.tam ?? 28, fontWeight: e.peso ?? 800, textAlign: e.alinhar === 'centro' ? 'center' : e.alinhar === 'dir' ? 'right' : 'left',
        color: c, fontFamily: e.fonte === 'texto' ? 'var(--fonte)' : e.fonte === 'marca' ? 'var(--fonte-marca)' : 'var(--fonte-titulo)',
      }
      return <div className={`arte-texto ${e.destaque ? 'destaque' : ''}`} style={estilo}>{noIdioma(e.texto, idioma)}</div>
    }
    case 'marca':
      return (
        <div className="arte-marca" style={{ fontSize: e.h * 0.62 }}>
          <img src="/simbolo.webp" alt="" draggable={false} />
          <span>OPUS<b>CASH</b></span>
        </div>
      )
    case 'simbolo': return <img className="arte-simbolo" src="/simbolo.webp" alt="" draggable={false} />
    case 'cartao': return <Cartao c={c} />
    case 'grafico': return <Grafico c={c} />
    case 'barras': return <Barras />
    case 'rosca': return <Rosca valor={e.valor ?? 75} c={c} />
    case 'moedas': return <Moedas />
    case 'selo':
      return (
        <div className="arte-selo" style={{ '--c': c, fontSize: e.h * 0.42 } as CSSProperties}>
          {e.icone && <Icone nome={e.icone} tamanho={Math.round(e.h * 0.5)} />}<span>{noIdioma(e.texto, idioma)}</span>
        </div>
      )
    case 'botao':
      return <div className="arte-botao" style={{ '--c': c, fontSize: e.h * 0.4 } as CSSProperties}>{noIdioma(e.texto, idioma)}</div>
    case 'icone':
      return (
        <div className="arte-icone" style={{ '--c': c } as CSSProperties}>
          <Icone nome={e.icone ?? 'estrela'} tamanho={Math.round(Math.min(e.w, e.h) * 0.5)} />
        </div>
      )
    case 'forma':
      return <div className={`arte-forma ${e.contorno ? 'contorno' : ''}`} style={{ '--c': c, borderRadius: e.raio ?? 18 } as CSSProperties} />
    case 'brilho':
      return <div className="arte-brilho" style={{ '--c': c } as CSSProperties} />
    default: return null
  }
}

export function estiloDaCaixa(e: Elemento, z: number): CSSProperties {
  return {
    left: e.x, top: e.y, width: e.w, height: e.h, zIndex: z, opacity: e.opac ?? 1,
    transform: e.giro ? `rotate(${e.giro}deg)` : undefined,
  }
}

/** A tela da arte no tamanho original (400×500 ou 640×320). `extra` vai por cima (o editor põe as alças ali). */
export function TelaArte({ arte, idioma = 'pt', extra, aoTocarFundo, renderizar }: {
  arte: Arte; idioma?: Idioma; extra?: ReactNode; aoTocarFundo?: (ev: React.PointerEvent) => void
  /** o editor troca o desenho de cada elemento (para pôr os eventos de arrastar) */
  renderizar?: (e: Elemento, z: number) => ReactNode
}) {
  const t = TAMANHO[arte.formato] ?? TAMANHO.em_pe
  return (
    <div className={`arte fundo-${arte.fundo}`} style={{ width: t.w, height: t.h }} onPointerDown={aoTocarFundo}>
      <i className="arte-fundo-a" /><i className="arte-fundo-b" />
      {arte.elementos.map((e, i) => renderizar ? renderizar(e, i + 1) : (
        <div key={e.id} className={`arte-el el-${e.tipo}`} style={estiloDaCaixa(e, i + 1)}><DesenhoElemento e={e} idioma={idioma} /></div>
      ))}
      {extra}
    </div>
  )
}

/** A arte encaixada na largura disponível (escala a tela inteira, mantendo a proporção). */
export function ArteAjustada({ arte, idioma, larguraMax }: { arte: Arte; idioma?: Idioma; larguraMax?: number }) {
  const caixa = useRef<HTMLDivElement>(null)
  const t = TAMANHO[arte.formato] ?? TAMANHO.em_pe
  const [escala, setEscala] = useState(1)
  useLayoutEffect(() => {
    const el = caixa.current
    if (!el) return
    const medir = () => setEscala(Math.min(el.clientWidth, larguraMax ?? Infinity) / t.w)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [t.w, larguraMax])
  return (
    <div ref={caixa} className="arte-ajustada" style={{ height: t.h * escala }}>
      <div style={{ width: t.w, height: t.h, transform: `scale(${escala})`, transformOrigin: '0 0' }}>
        <TelaArte arte={arte} idioma={idioma} />
      </div>
    </div>
  )
}
