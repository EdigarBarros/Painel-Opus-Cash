import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { mensagemDe } from './api'

/*
 * Memória das telas: o que já veio do servidor fica guardado enquanto o painel está aberto. Ao voltar a uma aba, a tela
 * aparece na hora com o que já tinha e a atualização chega por baixo, sem a tela "nascer de novo" (sem esqueleto, sem
 * as animações de entrada repetirem). Some ao recarregar a página ou sair do painel.
 */
const memoria = new Map<string, { dados: unknown; em: number }>()

export function esquecerTudo() { memoria.clear() }

export function useDados<T>(chave: string, buscar: () => Promise<T>, { manterAnterior = false } = {}) {
  const [res, setRes] = useState<{ chave: string; dados?: T; em?: number; erro?: string }>({ chave })
  const [pedido, setPedido] = useState(0)
  const [buscando, setBuscando] = useState(false)
  const buscarAtual = useRef(buscar)
  useLayoutEffect(() => { buscarAtual.current = buscar })

  useEffect(() => {
    let cancelado = false
    const t = window.setTimeout(() => { if (!cancelado) setBuscando(true) }, 0)
    buscarAtual.current()
      .then((dados) => {
        const em = Date.now()
        memoria.set(chave, { dados, em })
        if (!cancelado) setRes({ chave, dados, em })
      })
      .catch((e) => {
        if (!cancelado) setRes((r) => ({ ...(r.chave === chave ? r : { chave }), erro: mensagemDe(e) }))
      })
      .finally(() => { if (!cancelado) setBuscando(false) })
    return () => { cancelado = true; window.clearTimeout(t) }
  }, [chave, pedido])

  const guardado = memoria.get(chave) as { dados: T; em: number } | undefined
  const doServidor = res.dados !== undefined ? { chave: res.chave, dados: res.dados, em: res.em! } : undefined
  // a busca mudou e a resposta nova ainda não chegou: com manterAnterior, segue mostrando a anterior (a lista não pisca)
  const atual = res.chave === chave && doServidor ? doServidor
    : guardado ? { chave, ...guardado }
    : manterAnterior ? doServidor : undefined
  return {
    dados: atual?.dados,
    /** a chave dos dados mostrados (difere da pedida enquanto a resposta nova não chega, com manterAnterior) */
    chaveDosDados: atual?.chave ?? null,
    /** quando os dados mostrados chegaram do servidor */
    em: atual?.em ?? null,
    erro: res.chave === chave ? res.erro ?? null : null,
    buscando,
    recarregar: useCallback(() => setPedido((n) => n + 1), []),
  }
}

/** true depois de `ms`: o esqueleto de carregamento só aparece se o servidor demorar (rápido = a tela entra uma vez só). */
export function useDemorou(ms = 300) {
  const [demorou, setDemorou] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setDemorou(true), ms)
    return () => window.clearTimeout(t)
  }, [ms])
  return demorou
}
