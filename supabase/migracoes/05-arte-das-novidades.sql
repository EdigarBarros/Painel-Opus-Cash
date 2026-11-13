-- Painel 05: a lista de novidades passa a trazer a arte (editor de arte). Rodável de novo. Precisa da migração 32 do OpusCash.

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'novidades' and column_name = 'arte') then
    raise exception 'Rode antes a migração 32 do OpusCash (arte das novidades).';
  end if;
end $$;

drop function if exists public.adm_novidades();
create function public.adm_novidades()
returns table (id bigint, titulo jsonb, itens jsonb, icone text, cor text, tela text, onde text, publicada_em timestamptz,
               criada_em timestamptz, atualizada_em timestamptz, vistas bigint, publico bigint, arte jsonb)
language sql stable security definer set search_path = public, auth as $$
  select n.id, n.titulo, n.itens, n.icone, n.cor, n.tela, n.onde, n.publicada_em, n.criada_em, n.atualizada_em,
    case when n.publicada_em is null then 0 else (
      select count(*) from public.perfis p
      where exists (select 1 from unnest(p.dispensadas) d where d ~ '^novidade:[0-9]{1,18}$' and substr(d, 10)::bigint >= n.id)
    ) end,
    case when n.publicada_em is null then 0 else (select count(*) from auth.users u where u.created_at < n.publicada_em) end,
    n.arte
  from public.novidades n
  order by coalesce(n.publicada_em, n.criada_em) desc
  limit 100;
$$;

revoke all on function public.adm_novidades() from public, anon, authenticated;
grant execute on function public.adm_novidades() to service_role;

notify pgrst, 'reload schema';
