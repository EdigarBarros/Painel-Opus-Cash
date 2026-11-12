import { createClient } from '@supabase/supabase-js'

// Endereço e chave PÚBLICA do Supabase do OpusCash (os mesmos que o site publica no navegador). A chave pública não dá poder
// nenhum aqui: tudo o que o painel faz passa pela função "admin", que confere se é administrador e se entrou com o código.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://jyadqrepdueiiyskexmq.supabase.co'
const chave = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || 'sb_publishable_QwryTMftFcPhWX-Ft742Dw_j5hvsHp5'

export const supabase = createClient(url, chave, {
  // login próprio do painel (não se mistura com o do site). Fica parado 30 minutos, sai sozinho (App.tsx).
  auth: { storageKey: 'painel-opuscash', persistSession: true, autoRefreshToken: true },
})
