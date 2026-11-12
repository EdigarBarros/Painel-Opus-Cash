-- Painel 01: o que o painel de suporte precisa no banco do OpusCash (o mesmo projeto Supabase do site).
-- Supabase > SQL Editor > New query > colar > Run. Pode ser rodada de novo sem problema. Não apaga nada do OpusCash.
-- Precisa das migrações 12 (assinaturas), 16 (erros_app) e 29 (status 'pix' e pagamentos_pix) do OpusCash.
--
-- REGRA DE OURO: nada aqui é visível pelo navegador. As tabelas têm a segurança por linha ligada, sem nenhuma política, e as
-- permissões de anon e authenticated são retiradas. Quem lê e grava é só a função "admin" (supabase/functions/admin), que usa a
-- chave de serviço e antes confere se quem pediu é administrador e entrou com o código do celular.
--
-- O painel NÃO lê as finanças de ninguém (lançamentos, dívidas, metas, invest...). Só a conta, o perfil, a assinatura e os erros.

do $$
begin
  if to_regclass('public.assinaturas') is null or to_regclass('public.pagamentos_pix') is null or to_regclass('public.erros_app') is null then
    raise exception 'Rode antes as migrações 12, 16 e 29 do OpusCash.';
  end if;
end $$;

-- 1) Administradores. Para incluir alguém: insert into public.adm_admins (user_id, email)
--    select id, email from auth.users where lower(email) = 'pessoa@exemplo.com' on conflict do nothing;
create table if not exists public.adm_admins (
  user_id    uuid primary key references auth.users on delete cascade,
  email      text not null,
  criado_em  timestamptz not null default now()
);

-- 2) Registro de tudo o que o suporte faz (e de cada ficha aberta). Sem chave estrangeira de propósito: o registro continua
--    mesmo depois de a conta ser excluída. Ninguém apaga linhas daqui pelo painel.
create table if not exists public.adm_registro (
  id           bigint generated always as identity primary key,
  admin_id     uuid not null,
  admin_email  text not null,
  acao         text not null,
  alvo_id      uuid,
  alvo_email   text,
  motivo       text check (motivo is null or char_length(motivo) <= 500),
  antes        jsonb,
  depois       jsonb,
  criado_em    timestamptz not null default now()
);
create index if not exists adm_registro_alvo on public.adm_registro (alvo_id, criado_em desc);
create index if not exists adm_registro_data on public.adm_registro (criado_em desc);

-- 3) Pagamentos recebidos por fora do Stripe (Pix direto na conta, dinheiro...). Fica guardado mesmo se a conta for excluída.
create table if not exists public.adm_pagamentos (
  id          bigint generated always as identity primary key,
  user_id     uuid,
  email       text not null,
  valor       integer not null check (valor > 0), -- centavos
  moeda       text not null default 'brl',
  forma       text not null default 'pix' check (forma in ('pix', 'dinheiro', 'transferencia', 'outro')),
  pago_em     date not null default current_date,
  observacao  text check (observacao is null or char_length(observacao) <= 500),
  admin_id    uuid not null,
  criado_em   timestamptz not null default now()
);
create index if not exists adm_pagamentos_user on public.adm_pagamentos (user_id);

-- 4) Anotações do suporte sobre uma conta ("falou comigo no WhatsApp dia 10..."). Somem junto com a conta.
create table if not exists public.adm_anotacoes (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users on delete cascade,
  texto      text not null check (char_length(texto) between 1 and 2000),
  admin_id   uuid not null,
  criado_em  timestamptz not null default now()
);
create index if not exists adm_anotacoes_user on public.adm_anotacoes (user_id, criado_em desc);

-- 5) Erros: o painel marca um grupo de erros (mesma mensagem) como resolvido.
create table if not exists public.adm_erros_resolvidos (
  mensagem       text primary key,
  resolvido_em   timestamptz not null default now(),
  admin_id       uuid not null
);

do $$
declare t text;
begin
  foreach t in array array['adm_admins', 'adm_registro', 'adm_pagamentos', 'adm_anotacoes', 'adm_erros_resolvidos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- 6) Busca de contas (por e-mail ou nome; vazio = as mais recentes). Só dados de conta, nunca de finanças.
drop function if exists public.adm_buscar(text, integer);
create or replace function public.adm_buscar(p_termo text, p_limite integer default 50)
returns table (id uuid, email text, nome text, criado_em timestamptz, ultimo_acesso timestamptz, confirmado boolean,
               bloqueado boolean, status text, teste_fim timestamptz, periodo_fim timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.email::text, p.nome, u.created_at, u.last_sign_in_at, u.email_confirmed_at is not null,
         coalesce(u.banned_until > now(), false), coalesce(a.status, 'sem_assinatura'), a.teste_fim, a.periodo_fim
  from auth.users u
  left join public.perfis p on p.user_id = u.id
  left join public.assinaturas a on a.user_id = u.id
  where coalesce(trim(p_termo), '') = ''
     or u.email ilike '%' || trim(p_termo) || '%'
     or p.nome ilike '%' || trim(p_termo) || '%'
     or u.id::text = trim(p_termo)
  order by u.created_at desc
  limit least(greatest(coalesce(p_limite, 50), 1), 200);
$$;

-- 7) Ficha de uma conta, num json só.
create or replace function public.adm_ficha(p_user uuid)
returns jsonb
language sql stable security definer set search_path = public, auth as $$
  select jsonb_build_object(
    'conta', (select jsonb_build_object(
        'id', u.id, 'email', u.email, 'criado_em', u.created_at, 'ultimo_acesso', u.last_sign_in_at,
        'confirmado_em', u.email_confirmed_at, 'bloqueado_ate', u.banned_until, 'email_novo', u.email_change,
        'sessoes', (select count(*) from auth.sessions s where s.user_id = u.id),
        'admin', exists (select 1 from public.adm_admins x where x.user_id = u.id))
      from auth.users u where u.id = p_user),
    'perfil', (select jsonb_build_object('nome', p.nome, 'moeda', p.moeda, 'onboarding_em', p.onboarding_em, 'atualizado_em', p.updated_at)
      from public.perfis p where p.user_id = p_user),
    'assinatura', (select to_jsonb(a) from public.assinaturas a where a.user_id = p_user),
    'pix_stripe', coalesce((select jsonb_agg(to_jsonb(x) order by x.pago_em desc) from public.pagamentos_pix x where x.user_id = p_user), '[]'),
    'pagamentos', coalesce((select jsonb_agg(to_jsonb(x) order by x.pago_em desc, x.id desc) from public.adm_pagamentos x where x.user_id = p_user), '[]'),
    'anotacoes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'texto', n.texto, 'criado_em', n.criado_em,
        'admin_email', (select a.email from public.adm_admins a where a.user_id = n.admin_id)) order by n.criado_em desc)
      from public.adm_anotacoes n where n.user_id = p_user), '[]'),
    'registro', coalesce((select jsonb_agg(to_jsonb(r) order by r.criado_em desc) from (
        select id, admin_email, acao, motivo, antes, depois, criado_em from public.adm_registro
        where alvo_id = p_user and acao <> 'ver_ficha' order by criado_em desc limit 50) r), '[]'),
    'erros', coalesce((select jsonb_agg(to_jsonb(e) order by e.criado_em desc) from (
        select id, mensagem, onde, versao, criado_em from public.erros_app where user_id = p_user order by criado_em desc limit 20) e), '[]')
  );
$$;

-- 8) Muda o acesso de uma conta e registra, numa transação só. Ações:
--    'dias'       soma N dias de acesso (status 'pix', o mesmo do Pix de 30 dias do site: o site, o app e o webhook já entendem).
--                 Soma ao que sobrou do acesso atual (Pix valendo) ou do teste grátis, como o Pix do site faz.
--    'ate'        acesso até uma data (status 'pix').
--    'vitalicio'  cortesia (para sempre; o Stripe nunca mexe).
--    'teste'      soma N dias ao teste grátis (ou começa um teste de N dias).
--    'revogar'    tira o acesso dado pelo painel (Pix, cortesia ou teste): a conta volta à tela de assinatura.
--    Recusa mexer em quem tem assinatura no cartão valendo ou com cobrança pendente: o Stripe continuaria cobrando e o aviso
--    seguinte dele desfaria a mudança. Nesse caso, cancele a assinatura no Stripe primeiro.
--    Pagamento (opcional, p_pagamento = {"valor": 999, "forma": "pix", "pago_em": "2026-11-12", "observacao": "..."}) fica em adm_pagamentos.
create or replace function public.adm_mudar_acesso(p_admin uuid, p_alvo uuid, p_acao text, p_dias integer, p_ate timestamptz,
                                                   p_motivo text, p_pagamento jsonb default null)
returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare
  v_admin_email text;
  v_alvo_email text;
  v_antes public.assinaturas%rowtype;
  v_existe boolean;
  v_base timestamptz;
  v_fim timestamptz;
  v_depois jsonb;
begin
  select email into v_admin_email from public.adm_admins where user_id = p_admin;
  if v_admin_email is null then raise exception 'não é administrador'; end if;
  select email into v_alvo_email from auth.users where id = p_alvo;
  if v_alvo_email is null then raise exception 'conta não encontrada'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'escreva o motivo'; end if;

  select * into v_antes from public.assinaturas where user_id = p_alvo for update;
  v_existe := found;
  if v_existe and v_antes.status in ('trialing', 'active', 'past_due', 'unpaid', 'incomplete', 'paused') and p_acao <> 'revogar' then
    raise exception 'esta conta tem assinatura no cartão (%): cancele no Stripe antes', v_antes.status;
  end if;
  if v_existe and v_antes.status in ('trialing', 'active', 'past_due', 'unpaid', 'incomplete', 'paused') and p_acao = 'revogar' then
    raise exception 'o acesso desta conta vem do cartão (%): cancele no Stripe', v_antes.status;
  end if;

  if p_acao = 'dias' then
    if p_dias is null or p_dias < 1 or p_dias > 3650 then raise exception 'número de dias inválido'; end if;
    v_base := now();
    if v_existe and v_antes.status = 'pix' and v_antes.periodo_fim > v_base then v_base := v_antes.periodo_fim; end if;
    if v_existe and v_antes.status = 'teste' and v_antes.teste_fim > v_base then v_base := v_antes.teste_fim; end if;
    v_fim := v_base + make_interval(days => p_dias);
    insert into public.assinaturas (user_id, status, periodo_fim, cancela_no_fim, atualizado_em)
    values (p_alvo, 'pix', v_fim, false, now())
    on conflict (user_id) do update set status = 'pix', periodo_fim = v_fim, cancela_no_fim = false, atualizado_em = now();
  elsif p_acao = 'ate' then
    if p_ate is null or p_ate <= now() then raise exception 'escolha uma data no futuro'; end if;
    insert into public.assinaturas (user_id, status, periodo_fim, cancela_no_fim, atualizado_em)
    values (p_alvo, 'pix', p_ate, false, now())
    on conflict (user_id) do update set status = 'pix', periodo_fim = p_ate, cancela_no_fim = false, atualizado_em = now();
  elsif p_acao = 'vitalicio' then
    insert into public.assinaturas (user_id, status, atualizado_em) values (p_alvo, 'cortesia', now())
    on conflict (user_id) do update set status = 'cortesia', atualizado_em = now();
  elsif p_acao = 'teste' then
    if p_dias is null or p_dias < 1 or p_dias > 365 then raise exception 'número de dias inválido'; end if;
    if v_existe and v_antes.status in ('pix', 'cortesia') then raise exception 'esta conta já tem acesso liberado'; end if;
    v_base := now();
    if v_existe and v_antes.status = 'teste' and v_antes.teste_fim > v_base then v_base := v_antes.teste_fim; end if;
    v_fim := v_base + make_interval(days => p_dias);
    insert into public.assinaturas (user_id, status, teste_fim, atualizado_em) values (p_alvo, 'teste', v_fim, now())
    on conflict (user_id) do update set status = 'teste', teste_fim = v_fim, atualizado_em = now();
  elsif p_acao = 'revogar' then
    if not v_existe or v_antes.status not in ('pix', 'cortesia', 'teste') then raise exception 'não há acesso liberado para tirar'; end if;
    -- teste_fim fica guardado: quem já teve teste não ganha outro sozinho
    update public.assinaturas set status = 'sem_assinatura', periodo_fim = null,
      teste_fim = case when status = 'teste' then least(teste_fim, now()) else teste_fim end, atualizado_em = now()
    where user_id = p_alvo;
  else
    raise exception 'ação desconhecida';
  end if;

  if p_pagamento is not null and p_acao <> 'revogar' then
    if coalesce((p_pagamento->>'valor')::integer, 0) <= 0 then raise exception 'valor do pagamento inválido'; end if;
    insert into public.adm_pagamentos (user_id, email, valor, moeda, forma, pago_em, observacao, admin_id)
    values (p_alvo, v_alvo_email, (p_pagamento->>'valor')::integer, coalesce(p_pagamento->>'moeda', 'brl'),
            coalesce(p_pagamento->>'forma', 'pix'), coalesce((p_pagamento->>'pago_em')::date, current_date),
            nullif(trim(p_pagamento->>'observacao'), ''), p_admin);
  end if;

  select to_jsonb(a) into v_depois from public.assinaturas a where user_id = p_alvo;
  insert into public.adm_registro (admin_id, admin_email, acao, alvo_id, alvo_email, motivo, antes, depois)
  values (p_admin, v_admin_email, 'acesso_' || p_acao, p_alvo, v_alvo_email, trim(p_motivo),
          case when v_existe then to_jsonb(v_antes) end,
          v_depois || case when p_pagamento is not null and p_acao <> 'revogar' then jsonb_build_object('pagamento', p_pagamento) else '{}' end);
  return v_depois;
end;
$$;

-- 9) Desconecta a conta de todos os aparelhos (o login dura até o próximo pedido de renovação, no máximo uma hora).
create or replace function public.adm_encerrar_sessoes(p_user uuid)
returns integer
language plpgsql security definer set search_path = public, auth as $$
declare n integer;
begin
  delete from auth.sessions where user_id = p_user;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- 10) Erros do app agrupados por mensagem (últimos N dias).
create or replace function public.adm_erros(p_dias integer default 30)
returns table (mensagem text, vezes bigint, pessoas bigint, primeiro timestamptz, ultimo timestamptz, versoes text[], onde text[],
               resolvido_em timestamptz, voltou boolean)
language sql stable security definer set search_path = public as $$
  select e.mensagem, count(*), count(distinct e.user_id), min(e.criado_em), max(e.criado_em),
         (array_agg(distinct e.versao) filter (where e.versao is not null))[1:5],
         (array_agg(distinct e.onde) filter (where e.onde is not null))[1:5],
         r.resolvido_em, coalesce(max(e.criado_em) > r.resolvido_em, false)
  from public.erros_app e
  left join public.adm_erros_resolvidos r on r.mensagem = e.mensagem
  where e.criado_em > now() - make_interval(days => least(greatest(coalesce(p_dias, 30), 1), 365))
  group by e.mensagem, r.resolvido_em
  order by (r.resolvido_em is null or max(e.criado_em) > r.resolvido_em) desc, max(e.criado_em) desc;
$$;

-- 11) Números da tela inicial.
create or replace function public.adm_resumo()
returns jsonb
language sql stable security definer set search_path = public, auth as $$
  select jsonb_build_object(
    'contas', (select count(*) from auth.users),
    'novas_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'novas_30d', (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'ativas_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'em_teste', (select count(*) from public.assinaturas where status = 'teste' and teste_fim > now()),
    'teste_vence_7d', (select count(*) from public.assinaturas where status = 'teste' and teste_fim between now() and now() + interval '7 days'),
    'cartao', (select count(*) from public.assinaturas where status in ('trialing', 'active')),
    'cartao_pendente', (select count(*) from public.assinaturas where status in ('past_due', 'unpaid', 'incomplete')),
    'pix', (select count(*) from public.assinaturas where status = 'pix' and periodo_fim > now()),
    'pix_vence_7d', (select count(*) from public.assinaturas where status = 'pix' and periodo_fim between now() and now() + interval '7 days'),
    'cortesia', (select count(*) from public.assinaturas where status = 'cortesia'),
    'sem_acesso', (select count(*) from auth.users u left join public.assinaturas a on a.user_id = u.id
                   where not coalesce(a.status in ('trialing', 'active', 'past_due', 'cortesia')
                     or (a.status = 'teste' and a.teste_fim > now()) or (a.status = 'pix' and a.periodo_fim > now()), false)),
    'pix_stripe_30d', (select coalesce(sum(valor), 0) from public.pagamentos_pix where creditado and pago_em > now() - interval '30 days'),
    'pix_sem_credito', (select count(*) from public.pagamentos_pix where not creditado),
    'por_fora_30d', (select coalesce(sum(valor), 0) from public.adm_pagamentos where pago_em > current_date - 30),
    'erros_7d', (select count(*) from public.erros_app where criado_em > now() - interval '7 days'),
    'cadastros_por_dia', (select coalesce(jsonb_agg(jsonb_build_object('dia', d::date, 'n',
        (select count(*) from auth.users u where u.created_at >= d and u.created_at < d + interval '1 day')) order by d), '[]')
      from generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') d)
  );
$$;

do $$
declare f text;
begin
  foreach f in array array['adm_buscar(text, integer)', 'adm_ficha(uuid)',
    'adm_mudar_acesso(uuid, uuid, text, integer, timestamptz, text, jsonb)', 'adm_encerrar_sessoes(uuid)',
    'adm_erros(integer)', 'adm_resumo()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- 12) Primeiro administrador.
insert into public.adm_admins (user_id, email)
select id, email from auth.users where lower(email) = 'edigarbarros14@gmail.com'
on conflict (user_id) do nothing;

notify pgrst, 'reload schema';
