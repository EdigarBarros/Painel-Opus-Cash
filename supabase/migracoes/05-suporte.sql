-- Painel 05: atendimento dos pedidos de ajuda (rodável de novo).
-- Precisa da migração 32 do OpusCash (tabelas suporte_tickets e suporte_mensagens).
-- Só a função "admin" (chave de serviço) usa estas funções; cada ação fica em adm_registro pela própria função.

-- Lista de pedidos para a tela Suporte.
--   p_filtro: 'aguardando' (esperando o suporte), 'respondido' (esperando a pessoa), 'resolvido' ou 'todos'.
--   p_categoria: uma categoria ou null. p_termo: e-mail, nome ou assunto. p_user: só os pedidos de uma conta (ficha).
create or replace function public.adm_suporte_lista(p_filtro text default 'aguardando', p_categoria text default null,
                                                   p_termo text default null, p_user uuid default null, p_limite integer default 200)
returns jsonb
language sql stable security definer set search_path = public, auth as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.ordem, x.ultima_mensagem_em desc), '[]') from (
    select t.id, t.user_id, u.email::text as email, p.nome, t.categoria, t.assunto, t.status, t.tela, t.aparelho, t.versao,
           t.criado_em, t.ultima_mensagem_em, t.ultima_mensagem_de, t.resolvido_em,
           (t.ultima_mensagem_de = 'pessoa' and (t.lido_pelo_suporte_em is null or t.lido_pelo_suporte_em < t.ultima_mensagem_em)) as nao_lido,
           (select count(*) from public.suporte_mensagens m where m.ticket_id = t.id) as mensagens,
           (select left(m.texto, 160) from public.suporte_mensagens m where m.ticket_id = t.id order by m.id desc limit 1) as previa,
           case t.status when 'aberto' then 0 when 'respondido' then 1 else 2 end as ordem
    from public.suporte_tickets t
    left join auth.users u on u.id = t.user_id
    left join public.perfis p on p.user_id = t.user_id
    where (p_user is null or t.user_id = p_user)
      and (coalesce(p_filtro, 'todos') = 'todos'
           or (p_filtro = 'aguardando' and t.status = 'aberto')
           or (p_filtro = 'respondido' and t.status = 'respondido')
           or (p_filtro = 'resolvido' and t.status = 'resolvido'))
      and (p_categoria is null or t.categoria = p_categoria)
      and (coalesce(btrim(p_termo), '') = '' or u.email ilike '%' || btrim(p_termo) || '%' or p.nome ilike '%' || btrim(p_termo) || '%'
           or t.assunto ilike '%' || btrim(p_termo) || '%')
    order by ordem, t.ultima_mensagem_em desc
    limit least(greatest(coalesce(p_limite, 200), 1), 500)
  ) x;
$$;

-- Números para o menu (o que espera resposta) e para os filtros da tela Suporte.
create or replace function public.adm_suporte_contagem()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'aguardando', (select count(*) from public.suporte_tickets where status = 'aberto'),
    'nao_lidos', (select count(*) from public.suporte_tickets where status = 'aberto' and ultima_mensagem_de = 'pessoa'
                    and (lido_pelo_suporte_em is null or lido_pelo_suporte_em < ultima_mensagem_em)),
    'respondido', (select count(*) from public.suporte_tickets where status = 'respondido'),
    'resolvido', (select count(*) from public.suporte_tickets where status = 'resolvido'),
    'todos', (select count(*) from public.suporte_tickets),
    'resolvidos_7d', (select count(*) from public.suporte_tickets where resolvido_em > now() - interval '7 days'),
    'categorias', (select coalesce(jsonb_object_agg(categoria, n), '{}') from (
        select categoria, count(*) n from public.suporte_tickets where status <> 'resolvido' group by categoria) c),
    -- quanto o suporte leva para dar a primeira resposta (últimos 30 dias), em minutos
    'primeira_resposta_min', (select round(percentile_cont(0.5) within group (order by extract(epoch from (r.primeira - t.criado_em)) / 60)::numeric)
        from public.suporte_tickets t
        cross join lateral (select min(m.criado_em) primeira from public.suporte_mensagens m where m.ticket_id = t.id and m.autor = 'suporte') r
        where t.criado_em > now() - interval '30 days' and r.primeira is not null)
  );
$$;

-- Um pedido com a conversa inteira. Abrir pelo painel marca as mensagens da pessoa como lidas pelo suporte.
create or replace function public.adm_suporte_ticket(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare
  v jsonb;
begin
  update public.suporte_tickets set lido_pelo_suporte_em = now() where id = p_id;
  select jsonb_build_object(
    'ticket', to_jsonb(t) - 'lido_pela_pessoa_em',
    'pessoa_viu_em', t.lido_pela_pessoa_em,
    'conta', (select jsonb_build_object('id', u.id, 'email', u.email, 'nome', p.nome, 'criado_em', u.created_at,
                 'status', a.status, 'teste_fim', a.teste_fim, 'periodo_fim', a.periodo_fim)
              from auth.users u left join public.perfis p on p.user_id = u.id left join public.assinaturas a on a.user_id = u.id
              where u.id = t.user_id),
    'mensagens', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'autor', m.autor, 'texto', m.texto, 'criado_em', m.criado_em,
                     'admin_email', (select x.email from public.adm_admins x where x.user_id = m.admin_id)) order by m.id), '[]')
                  from public.suporte_mensagens m where m.ticket_id = t.id),
    'outros', (select count(*) from public.suporte_tickets o where o.user_id = t.user_id and o.id <> t.id)
  ) into v
  from public.suporte_tickets t where t.id = p_id;
  return v;
end $$;

-- O suporte responde. Com p_resolver, já encerra o pedido junto com a resposta.
create or replace function public.adm_suporte_responder(p_admin uuid, p_ticket uuid, p_texto text, p_resolver boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_texto text := btrim(coalesce(p_texto, ''));
  v_user uuid;
begin
  if char_length(v_texto) < 1 then raise exception 'Escreva a resposta.'; end if;
  if char_length(v_texto) > 4000 then raise exception 'A resposta passa de 4000 letras. Divida em duas.'; end if;
  select user_id into v_user from public.suporte_tickets where id = p_ticket;
  if v_user is null then raise exception 'Pedido não encontrado.'; end if;
  insert into public.suporte_mensagens (ticket_id, autor, texto, admin_id) values (p_ticket, 'suporte', v_texto, p_admin);
  update public.suporte_tickets
     set status = case when p_resolver then 'resolvido' else 'respondido' end,
         resolvido_em = case when p_resolver then now() end,
         ultima_mensagem_em = now(), ultima_mensagem_de = 'suporte', lido_pelo_suporte_em = now(), atualizado_em = now()
   where id = p_ticket;
  return jsonb_build_object('user_id', v_user);
end $$;

-- O suporte muda a situação sem responder: encerrar ('resolvido') ou reabrir ('aberto').
create or replace function public.adm_suporte_status(p_ticket uuid, p_status text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_antes text;
  v_user uuid;
begin
  if p_status not in ('aberto', 'resolvido') then raise exception 'Situação inválida.'; end if;
  select status, user_id into v_antes, v_user from public.suporte_tickets where id = p_ticket;
  if v_user is null then raise exception 'Pedido não encontrado.'; end if;
  update public.suporte_tickets
     set status = p_status, resolvido_em = case when p_status = 'resolvido' then now() end, atualizado_em = now()
   where id = p_ticket;
  return jsonb_build_object('user_id', v_user, 'antes', v_antes);
end $$;

do $$
declare f text;
begin
  foreach f in array array['adm_suporte_lista(text, text, text, uuid, integer)', 'adm_suporte_contagem()', 'adm_suporte_ticket(uuid)',
                           'adm_suporte_responder(uuid, uuid, text, boolean)', 'adm_suporte_status(uuid, text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
