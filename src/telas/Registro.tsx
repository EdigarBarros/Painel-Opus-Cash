import { useState } from 'react'
import { api } from '../lib/api'
import { useDados, useDemorou } from '../lib/dados'
import { fmtDataHora, NOME_DA_ACAO } from '../lib/formato'
import { Carregando, ErroNaTela } from '../ui'

interface Linha { id: number; admin_email: string; acao: string; alvo_id: string | null; alvo_email: string | null; motivo: string | null; criado_em: string }

/** Tudo o que o suporte fez, do mais novo para o mais velho. Ninguém apaga daqui. */
export function Registro() {
  const [comLeituras, setComLeituras] = useState(false)
  const { dados, erro: falhou, recarregar: carregar } = useDados(comLeituras ? 'registro:com-leituras' : 'registro:sem-leituras',
    () => api<Linha[]>('registro', { sem_leituras: !comLeituras }), { manterAnterior: true })
  const linhas = dados ?? null
  const erro = falhou && !dados ? falhou : null
  const demorou = useDemorou()

  return (
    <div className="pagina">
      <h1>Registro do suporte</h1>
      <p className="sub">Cada ação feita pelo painel fica aqui, com quem fez e o motivo. Não dá para apagar.</p>
      <label className="opcao">
        <input type="checkbox" checked={comLeituras} onChange={(e) => setComLeituras(e.target.checked)} /> Mostrar também as fichas abertas
      </label>
      {erro && <ErroNaTela erro={erro} aoTentar={carregar} />}
      {!erro && !linhas && demorou && <Carregando />}
      {linhas && linhas.length === 0 && <p className="vazio">Nada registrado ainda.</p>}
      {linhas && linhas.length > 0 && (
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead><tr><th>Quando</th><th>Quem</th><th>O quê</th><th>Conta</th><th>Motivo</th></tr></thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} className="sem-clique">
                  <td>{fmtDataHora(l.criado_em)}</td>
                  <td>{l.admin_email}</td>
                  <td>{NOME_DA_ACAO[l.acao] ?? l.acao}</td>
                  <td>{l.alvo_id && l.acao !== 'excluir' ? <a href={`#/contas/${l.alvo_id}`}>{l.alvo_email}</a> : l.alvo_email ?? '—'}</td>
                  <td>{l.motivo ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
