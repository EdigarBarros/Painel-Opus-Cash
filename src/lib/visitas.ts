/*
 * Quais telas já foram vistas nesta visita ao painel. Na primeira vez, a tela entra com a abertura completa do OpusCash
 * (blocos subindo um a um, números contando, gráficos se desenhando). Ao voltar a uma tela já vista, ela entra de uma vez,
 * numa transição só, com os números já no valor: repetir a abertura toda parecia a tela carregando de novo.
 */
const vistas = new Set<string>()
let atual: { tela: string; primeira: boolean } | null = null

/**
 * Chamada pelo App a cada desenho com a tela atual. Decide uma vez por visita (chamar de novo para a mesma tela devolve a
 * mesma resposta) e diz se é a primeira vez que a tela aparece.
 */
export function entrarNaTela(tela: string) {
  if (atual?.tela !== tela) {
    atual = { tela, primeira: !vistas.has(tela) }
    vistas.add(tela)
  }
  return atual.primeira
}

/** true se a tela atual está sendo vista pela primeira vez. */
export const primeiraVisita = () => atual?.primeira ?? true

export function esquecerVisitas() { vistas.clear(); atual = null }
