-- Painel 04: tela Novidades (o pop-up "Tem novidade!" do OpusCash). Rodável de novo. Precisa da migração 31 do OpusCash.
-- O painel cria, edita, publica e apaga pela função "admin" (chave de serviço). O site e o app só leem as publicadas.

do $$
begin
  if to_regclass('public.novidades') is null then
    raise exception 'Rode antes a migração 31 do OpusCash (novidades).';
  end if;
end $$;

-- Lista de novidades com quantas pessoas já viram ("novidade:<id>" ou uma mais nova em perfis.dispensadas) e quantas
-- deveriam ver (contas criadas antes de ela ser publicada).
create or replace function public.adm_novidades()
returns table (id bigint, titulo jsonb, itens jsonb, icone text, cor text, tela text, onde text, publicada_em timestamptz,
               criada_em timestamptz, atualizada_em timestamptz, vistas bigint, publico bigint)
language sql stable security definer set search_path = public, auth as $$
  select n.id, n.titulo, n.itens, n.icone, n.cor, n.tela, n.onde, n.publicada_em, n.criada_em, n.atualizada_em,
    case when n.publicada_em is null then 0 else (
      select count(*) from public.perfis p
      where exists (select 1 from unnest(p.dispensadas) d where d ~ '^novidade:[0-9]{1,18}$' and substr(d, 10)::bigint >= n.id)
    ) end,
    case when n.publicada_em is null then 0 else (select count(*) from auth.users u where u.created_at < n.publicada_em) end
  from public.novidades n
  order by coalesce(n.publicada_em, n.criada_em) desc
  limit 100;
$$;

revoke all on function public.adm_novidades() from public, anon, authenticated;
grant execute on function public.adm_novidades() to service_role;

notify pgrst, 'reload schema';
