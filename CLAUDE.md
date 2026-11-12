# Painel OpusCash: como trabalhar neste repositório

- É o painel de suporte do OpusCash (repositório `cigarros-finance`). Usa o mesmo Supabase. Leia o `README.md`.
- **Nada de poder no navegador.** Toda leitura ou mudança passa pela função `supabase/functions/admin`, que confere
  administrador + código do celular (`aal2`) e grava em `adm_registro`. Ação nova = um `case` lá + registro + motivo
  obrigatório quando muda algo.
- **Não leia finanças das pessoas** (lançamentos, dívidas, metas, invest...). Só conta, perfil, assinatura, pagamentos e erros.
- Acesso por prazo usa o status `pix` (com `periodo_fim`) e vitalício usa `cortesia`: o site, o app Android e o webhook do
  Stripe do OpusCash já entendem os dois. Não invente status novo sem mudar o OpusCash junto (e o app Android).
- Mudanças no banco: arquivo novo em `supabase/migracoes/` (rodável de novo), aplicado no Supabase. Funções `adm_*` só
  para `service_role`; tabelas `adm_*` com RLS ligado, sem política, e sem permissão para `anon`/`authenticated`.
- Antes de publicar: `npx tsc -b`, `npm run lint`, `npm run build`. A função: `deno check supabase/functions/admin/index.ts`.
- Textos em português simples, botões com verbo (o mesmo guia do OpusCash).
