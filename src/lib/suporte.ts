/** Assuntos dos pedidos de suporte (os mesmos do OpusCash, lib/suporte.ts de lá) e os números da fila. */
export type Categoria = 'pagamento' | 'bug' | 'conta' | 'duvida' | 'sugestao' | 'outro'

export const CATEGORIAS: Record<Categoria, { nome: string; icone: string; cor: string }> = {
  pagamento: { nome: 'Pagamento e assinatura', icone: 'cartao', cor: 'var(--entrada)' },
  bug: { nome: 'Algo não funciona', icone: 'inseto', cor: 'var(--saida)' },
  conta: { nome: 'Conta e login', icone: 'pessoa', cor: 'var(--caixa)' },
  duvida: { nome: 'Dúvida de como usar', icone: 'ideia', cor: 'var(--divida)' },
  sugestao: { nome: 'Sugestão', icone: 'estrela', cor: 'var(--violeta)' },
  outro: { nome: 'Outro assunto', icone: 'conversa', cor: 'var(--texto-2)' },
}

export interface Contagem {
  aguardando: number; nao_lidos: number; respondido: number; resolvido: number; todos: number; resolvidos_7d: number
  categorias: Partial<Record<Categoria, number>>; primeira_resposta_min: number | null
}
