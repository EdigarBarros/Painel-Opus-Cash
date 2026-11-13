-- Painel OpusCash: números novos da tela Início (rodável de novo).
-- Mantém tudo o que o adm_resumo já devolvia e acrescenta:
--   * comparação com a semana / os 30 dias anteriores (cadastros, dinheiro recebido, erros);
--   * cadastros e dinheiro recebido por dia nos últimos 90 dias;
--   * como as contas estão divididas (cada conta em uma situação só);
--   * quem pede atenção (teste ou prazo vencendo em 7 dias, cartão recusado) e os últimos cadastros.
-- Nada de finanças das pessoas: só conta, perfil (nome), assinatura e pagamentos.

create or replace function public.adm_resumo()
returns jsonb
language sql stable security definer set search_path = public, auth as $$
  with situacao as (
    select u.id, u.email, u.created_at, p.nome, a.status, a.teste_fim, a.periodo_fim,
      case
        when a.status in ('trialing', 'active') then 'cartao'
        when a.status = 'past_due' then 'cartao_recusado'
        when a.status = 'cortesia' then 'vitalicio'
        when a.status = 'pix' and a.periodo_fim > now() then 'prazo'
        when a.status = 'teste' and a.teste_fim > now() then 'teste'
        else 'sem_acesso'
      end as grupo
    from auth.users u
    left join public.assinaturas a on a.user_id = u.id
    left join public.perfis p on p.user_id = u.id
  ),
  dias as (
    select d::date as dia from generate_series(date_trunc('day', now()) - interval '89 days', date_trunc('day', now()), interval '1 day') d
  )
  select jsonb_build_object(
    'contas', (select count(*) from auth.users),
    'novas_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'novas_7d_antes', (select count(*) from auth.users where created_at > now() - interval '14 days' and created_at <= now() - interval '7 days'),
    'novas_30d', (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'ativas_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'ativas_30d', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
    'nao_confirmados', (select count(*) from auth.users where email_confirmed_at is null),
    'bloqueados', (select count(*) from auth.users where banned_until > now()),
    'em_teste', (select count(*) from public.assinaturas where status = 'teste' and teste_fim > now()),
    'teste_vence_7d', (select count(*) from public.assinaturas where status = 'teste' and teste_fim between now() and now() + interval '7 days'),
    'cartao', (select count(*) from public.assinaturas where status in ('trialing', 'active')),
    'cartao_pendente', (select count(*) from public.assinaturas where status in ('past_due', 'unpaid', 'incomplete')),
    'cancela_no_fim', (select count(*) from public.assinaturas where status in ('trialing', 'active') and cancela_no_fim),
    'pix', (select count(*) from public.assinaturas where status = 'pix' and periodo_fim > now()),
    'pix_vence_7d', (select count(*) from public.assinaturas where status = 'pix' and periodo_fim between now() and now() + interval '7 days'),
    'cortesia', (select count(*) from public.assinaturas where status = 'cortesia'),
    'sem_acesso', (select count(*) from auth.users u left join public.assinaturas a on a.user_id = u.id
                   where not coalesce(a.status in ('trialing', 'active', 'past_due', 'cortesia')
                     or (a.status = 'teste' and a.teste_fim > now()) or (a.status = 'pix' and a.periodo_fim > now()), false)),
    'pix_stripe_30d', (select coalesce(sum(valor), 0) from public.pagamentos_pix where creditado and pago_em > now() - interval '30 days'),
    'pix_stripe_30d_antes', (select coalesce(sum(valor), 0) from public.pagamentos_pix
                             where creditado and pago_em > now() - interval '60 days' and pago_em <= now() - interval '30 days'),
    'pix_sem_credito', (select count(*) from public.pagamentos_pix where not creditado),
    'por_fora_30d', (select coalesce(sum(valor), 0) from public.adm_pagamentos where pago_em > current_date - 30),
    'por_fora_30d_antes', (select coalesce(sum(valor), 0) from public.adm_pagamentos where pago_em > current_date - 60 and pago_em <= current_date - 30),
    'erros_7d', (select count(*) from public.erros_app where criado_em > now() - interval '7 days'),
    'erros_7d_antes', (select count(*) from public.erros_app where criado_em > now() - interval '14 days' and criado_em <= now() - interval '7 days'),
    'erros_pessoas_7d', (select count(distinct user_id) from public.erros_app where criado_em > now() - interval '7 days'),
    'cadastros_por_dia', (select coalesce(jsonb_agg(jsonb_build_object('dia', d::date, 'n',
        (select count(*) from auth.users u where u.created_at >= d and u.created_at < d + interval '1 day')) order by d), '[]')
      from generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') d),
    'por_dia_90d', (select coalesce(jsonb_agg(jsonb_build_object(
        'dia', dias.dia,
        'cadastros', (select count(*) from auth.users u where u.created_at >= dias.dia and u.created_at < dias.dia + 1),
        'pix', (select coalesce(sum(valor), 0) from public.pagamentos_pix x
                where x.creditado and x.pago_em >= dias.dia and x.pago_em < dias.dia + 1),
        'por_fora', (select coalesce(sum(valor), 0) from public.adm_pagamentos f where f.pago_em = dias.dia),
        'erros', (select count(*) from public.erros_app e where e.criado_em >= dias.dia and e.criado_em < dias.dia + 1)
      ) order by dias.dia), '[]') from dias),
    'divisao', (select coalesce(jsonb_object_agg(grupo, n), '{}') from (select grupo, count(*) n from situacao group by grupo) g),
    'atencao', (select coalesce(jsonb_agg(to_jsonb(t) order by t.ordem, t.quando), '[]') from (
        select id, email, nome, status, 'cartao_recusado' as motivo, null::timestamptz as quando, 0 as ordem
          from situacao where status in ('past_due', 'unpaid', 'incomplete')
        union all
        select id, email, nome, status, 'prazo_vence', periodo_fim, 1
          from situacao where status = 'pix' and periodo_fim between now() and now() + interval '7 days'
        union all
        select id, email, nome, status, 'teste_vence', teste_fim, 2
          from situacao where status = 'teste' and teste_fim between now() and now() + interval '7 days'
        order by 7, 6
        limit 12
      ) t),
    'ultimos_cadastros', (select coalesce(jsonb_agg(to_jsonb(t) order by t.criado_em desc), '[]') from (
        select id, email, nome, created_at as criado_em, status, teste_fim, periodo_fim
          from situacao order by created_at desc limit 6
      ) t)
  );
$$;

revoke all on function public.adm_resumo() from public, anon, authenticated;
grant execute on function public.adm_resumo() to service_role;

notify pgrst, 'reload schema';
