-- Painel 03: como cada pessoa usa o OpusCash (rodável de novo). Precisa da migração 30 do OpusCash (uso_presenca, uso_telas,
-- uso_marcos). Rode DEPOIS da 01 e da 02 (esta troca o adm_buscar da 01 por um que também traz a foto e se está online).
--
-- O que o painel passa a ver: se a pessoa está com o app aberto agora e em qual tela, quando foi vista, idioma, site ou app,
-- tempo e toques em cada tela, tutorial (pulou em qual passo ou viu inteiro), perguntas iniciais, jeito de ver, abas ligadas,
-- foto de perfil e QUANTAS coisas ela já cadastrou em cada parte do app.
-- Continua sem ler finanças: só contagens (quantos lançamentos, quantas metas...), nunca valores, descrições ou nomes.

do $$
begin
  if to_regclass('public.uso_presenca') is null then
    raise exception 'Rode antes a migração 30 do OpusCash (uso do app).';
  end if;
end $$;

-- Online = app aberto e visível, com sinal de vida nos últimos 150 segundos (o app manda um por minuto).
create or replace function public.adm_online_ate() returns timestamptz language sql stable as $$ select now() - interval '150 seconds' $$;

-- 1) Busca de contas, agora com foto, se está usando agora e quando foi vista no app.
drop function if exists public.adm_buscar(text, integer);
create or replace function public.adm_buscar(p_termo text, p_limite integer default 50)
returns table (id uuid, email text, nome text, criado_em timestamptz, ultimo_acesso timestamptz, confirmado boolean,
               bloqueado boolean, status text, teste_fim timestamptz, periodo_fim timestamptz,
               foto text, online boolean, visto_em timestamptz, tela text)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.email::text, p.nome, u.created_at, greatest(u.last_sign_in_at, x.visto_em), u.email_confirmed_at is not null,
         coalesce(u.banned_until > now(), false), coalesce(a.status, 'sem_assinatura'), a.teste_fim, a.periodo_fim,
         p.foto, coalesce(x.aberto and x.visto_em > public.adm_online_ate(), false), x.visto_em, x.tela
  from auth.users u
  left join public.perfis p on p.user_id = u.id
  left join public.assinaturas a on a.user_id = u.id
  left join public.uso_presenca x on x.user_id = u.id
  where coalesce(trim(p_termo), '') = ''
     or u.email ilike '%' || trim(p_termo) || '%'
     or p.nome ilike '%' || trim(p_termo) || '%'
     or u.id::text = trim(p_termo)
  order by u.created_at desc
  limit least(greatest(coalesce(p_limite, 50), 1), 200);
$$;

-- 2) Quanto a pessoa já cadastrou em cada parte do app (só a contagem e a data do último, nunca o conteúdo).
create or replace function public.adm_contagens(p_user uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  t text;
  r jsonb := '{}'::jsonb;
  n bigint;
  ultimo timestamptz;
  tabelas text[] := array['lancamentos', 'categorias', 'contas_fixas', 'cartoes', 'faturas_pagas', 'dividas', 'divida_partes',
    'divida_promessas', 'metas', 'meta_movimentos', 'bancos', 'meses', 'invest_ativos', 'invest_operacoes', 'invest_importacoes'];
  tem_data boolean;
begin
  foreach t in array tabelas loop
    continue when to_regclass('public.' || t) is null;
    select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'created_at')
      into tem_data;
    if tem_data then
      execute format('select count(*), max(created_at) from public.%I where user_id = $1', t) into n, ultimo using p_user;
    else
      execute format('select count(*) from public.%I where user_id = $1', t) into n using p_user;
      ultimo := null;
    end if;
    r := r || jsonb_build_object(t, jsonb_build_object('n', n, 'ultimo', ultimo));
  end loop;
  return r;
end;
$$;

-- 3) Tudo sobre o uso de uma conta, para a aba "Uso" da ficha.
create or replace function public.adm_uso(p_user uuid)
returns jsonb
language sql stable security definer set search_path = public, auth as $$
  select jsonb_build_object(
    'presenca', (select jsonb_build_object('visto_em', x.visto_em, 'aberto', x.aberto, 'tela', x.tela, 'idioma', x.idioma,
        'aparelho', x.aparelho, 'versao', x.versao, 'entrou_em', x.entrou_em,
        'online', x.aberto and x.visto_em > public.adm_online_ate())
      from public.uso_presenca x where x.user_id = p_user),
    'perfil', (select jsonb_build_object('detalhe', p.detalhe, 'modulos', p.modulos, 'moedas', p.moedas, 'moeda', p.moeda,
        'onboarding_em', p.onboarding_em, 'tutorial_dispensado', 'tour' = any(p.dispensadas),
        'tem_foto', p.foto is not null and p.foto <> '',
        'objetivo', nullif(p.consultor->>'objetivo', ''),
        'saldo_inicial', p.saldo_inicial is not null, 'criado_em', p.created_at, 'atualizado_em', p.updated_at)
      from public.perfis p where p.user_id = p_user),
    'marcos', coalesce((select jsonb_agg(jsonb_build_object('tipo', m.tipo, 'detalhe', m.detalhe, 'criado_em', m.criado_em) order by m.criado_em desc)
      from (select * from public.uso_marcos where user_id = p_user order by criado_em desc limit 30) m), '[]'),
    -- últimos 30 dias, por tela
    'telas', coalesce((select jsonb_agg(jsonb_build_object('tela', t.tela, 'segundos', t.s, 'interacoes', t.i, 'visitas', t.v, 'dias', t.d) order by t.s desc)
      from (select tela, sum(segundos) s, sum(interacoes) i, sum(visitas) v, count(distinct dia) d from public.uso_telas
            where user_id = p_user and dia > current_date - 30 group by tela) t), '[]'),
    -- últimos 30 dias, por dia
    'dias', coalesce((select jsonb_agg(jsonb_build_object('dia', d.dia, 'segundos', coalesce(u.s, 0), 'interacoes', coalesce(u.i, 0)) order by d.dia)
      from (select (current_date - g)::date dia from generate_series(0, 29) g) d
      left join (select dia, sum(segundos) s, sum(interacoes) i from public.uso_telas where user_id = p_user group by dia) u on u.dia = d.dia), '[]'),
    'total', (select jsonb_build_object('segundos', coalesce(sum(segundos), 0), 'interacoes', coalesce(sum(interacoes), 0),
        'dias', count(distinct dia), 'desde', min(dia)) from public.uso_telas where user_id = p_user),
    'contagens', public.adm_contagens(p_user)
  );
$$;

-- 4) Quem está usando agora (para o Início).
create or replace function public.adm_online()
returns table (id uuid, email text, nome text, foto text, tela text, visto_em timestamptz, entrou_em timestamptz, aparelho text, idioma text)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.email::text, p.nome, p.foto, x.tela, x.visto_em, x.entrou_em, x.aparelho, x.idioma
  from public.uso_presenca x
  join auth.users u on u.id = x.user_id
  left join public.perfis p on p.user_id = u.id
  where x.aberto and x.visto_em > public.adm_online_ate()
  order by x.entrou_em
  limit 100;
$$;

-- 5) Uso do app por todo mundo (últimos 30 dias): telas mais usadas, tutorial, jeito de ver, idiomas e aparelhos.
create or replace function public.adm_uso_geral()
returns jsonb
language sql stable security definer set search_path = public, auth as $$
  select jsonb_build_object(
    'online', (select count(*) from public.uso_presenca where aberto and visto_em > public.adm_online_ate()),
    'vistos_24h', (select count(*) from public.uso_presenca where visto_em > now() - interval '24 hours'),
    'telas', coalesce((select jsonb_agg(jsonb_build_object('tela', t.tela, 'segundos', t.s, 'interacoes', t.i, 'pessoas', t.p) order by t.s desc)
      from (select tela, sum(segundos) s, sum(interacoes) i, count(distinct user_id) p from public.uso_telas
            where dia > current_date - 30 group by tela order by sum(segundos) desc limit 15) t), '[]'),
    'tutorial', jsonb_build_object(
      'terminou', (select count(distinct user_id) from public.uso_marcos where tipo = 'tutorial_terminou'),
      'pulou', (select count(distinct user_id) from public.uso_marcos m where tipo = 'tutorial_pulou'
                and not exists (select 1 from public.uso_marcos k where k.user_id = m.user_id and k.tipo = 'tutorial_terminou')),
      'passo_medio_ao_pular', (select round(avg((detalhe->>'passo')::numeric), 1) from public.uso_marcos where tipo = 'tutorial_pulou')),
    'modos', coalesce((select jsonb_object_agg(detalhe, n) from (select detalhe, count(*) n from public.perfis group by detalhe) m), '{}'),
    'idiomas', coalesce((select jsonb_object_agg(coalesce(idioma, '?'), n) from (select idioma, count(*) n from public.uso_presenca group by idioma) i), '{}'),
    'aparelhos', coalesce((select jsonb_object_agg(coalesce(aparelho, '?'), n) from (select aparelho, count(*) n from public.uso_presenca group by aparelho) a), '{}'),
    'sem_perguntas', (select count(*) from auth.users u left join public.perfis p on p.user_id = u.id where p.onboarding_em is null),
    'com_foto', (select count(*) from public.perfis where foto is not null and foto <> '')
  );
$$;

-- 6) Foto de perfil de uma conta (a ficha mostra no cabeçalho).
create or replace function public.adm_foto(p_user uuid)
returns text
language sql stable security definer set search_path = public as $$
  select nullif(foto, '') from public.perfis where user_id = p_user;
$$;

do $$
declare f text;
begin
  foreach f in array array['adm_online_ate()', 'adm_buscar(text, integer)', 'adm_contagens(uuid)', 'adm_uso(uuid)', 'adm_online()',
    'adm_uso_geral()', 'adm_foto(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
