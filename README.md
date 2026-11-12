# Painel OpusCash

Painel de suporte dos administradores do OpusCash: achar uma conta, liberar acesso (Pix pago por fora, 15 ou 30 dias,
até uma data ou vitalício), estender o teste grátis, ajudar com login e senha, ver os erros que as pessoas encontram e
conferir tudo o que o suporte fez.

Usa o **mesmo projeto Supabase do OpusCash** (`jyadqrepdueiiyskexmq`). Não tem banco próprio.

## Como a segurança funciona

1. **O site do painel não tem poder nenhum.** Ele só tem a chave pública (a mesma do site do OpusCash). Tudo passa pela
   função `admin` do Supabase (`supabase/functions/admin`), que usa a chave de serviço no servidor.
2. A função confere, a cada pedido: login válido, conta em `adm_admins` e **login confirmado com o código do celular**
   (MFA do Supabase, nível `aal2`). Sem o código, só responde "quem sou eu" para o painel pedir o código.
3. **Tudo fica registrado** em `adm_registro`: quem, o quê, em qual conta, quando e o motivo (obrigatório nas ações que
   mudam algo). Abrir uma ficha também fica registrado.
4. **O painel não lê as finanças de ninguém.** Só conta, perfil, assinatura, pagamentos e erros.
5. O suporte **nunca vê nem define senha**: manda o e-mail de senha nova ou gera o link para a pessoa criar a dela.
6. Parado 30 minutos, o painel sai sozinho. O site não aparece no Google (`noindex`, `robots.txt`).

## O que cada tela faz

- **Início:** saudação, busca rápida de conta e atualização sozinha a cada 5 minutos. Quatro números com variação contra
  o período anterior e minigráfico (contas, pagando agora, recebido em 30 dias, erros na semana); gráfico de movimento
  (cadastros, dinheiro recebido ou erros, em 30 ou 90 dias); rosca de como as contas estão divididas; quem pede atenção
  (cartão recusado, prazo ou teste vencendo em 7 dias); últimos cadastros; uso (entraram na semana e no mês, e-mail não
  confirmado, bloqueadas) e as últimas ações do suporte.
- **Visual:** o mesmo do OpusCash (cores, fontes Inter/Sora/Montserrat servidas pelo próprio painel, ícones, número que
  conta). Barra lateral no computador e abas embaixo no celular. A conta fica no pé da lateral, com a aparência
  (escuro, claro ou automático, guardada só neste navegador) e o botão de sair.
- **Contas:** busca por e-mail ou nome, filtros (em teste, vence em 7 dias, cartão, liberados, sem acesso, com problema).
- **Ficha da conta:**
  - *Acesso:* liberar 15/30/N dias ou até uma data (status `pix`, o mesmo do Pix de 30 dias do site: soma ao que sobrou),
    vitalício (`cortesia`), estender o teste, tirar o acesso. Pode registrar o pagamento recebido (valor, forma, data).
    Conta que paga no cartão: o acesso vem do Stripe e se mexe pelo quadro do Stripe (abaixo).
  - *Login e senha:* e-mail de senha nova, link de senha nova (para mandar pelo WhatsApp), reenviar ou confirmar o
    e-mail, trocar o e-mail, desconectar de todos os aparelhos, bloquear e desbloquear.
  - *Stripe (cartão e Pix do site), lido na hora do Stripe:* situação da assinatura, cartão (bandeira e final), próxima
    cobrança, fatura em aberto com as tentativas e todas as cobranças. Ações: cancelar no fim do período ou agora (com a
    opção de já liberar dias, para quem passou a pagar por Pix), desfazer cancelamento, tentar cobrar de novo, copiar o
    link da fatura em aberto, gerar link para trocar o cartão, dar dias grátis no cartão e reembolsar uma cobrança.
    Depois de cada ação a ficha já mostra o estado novo (o stripe-webhook do OpusCash confirma logo em seguida).
  - Pagamentos, anotações do suporte, erros da conta, histórico do suporte e excluir a conta (cancela o cartão no Stripe).
- **Erros:** os erros de `erros_app` agrupados pela mensagem, com vezes, pessoas, versões e onde; marcar como resolvido
  (avisa se voltou a acontecer).
- **Registro:** tudo o que o suporte fez.

## Colocar no ar

1. **Banco:** rode `supabase/migracoes/01-painel.sql` no SQL Editor (precisa das migrações 12, 16 e 29 do OpusCash).
   Ela já põe `edigarbarros14@gmail.com` como administrador.
   Depois rode `supabase/migracoes/02-inicio.sql` (números novos da tela Início).
2. **Função:** publique `supabase/functions/admin` **com** verificação de JWT. Usa o segredo `STRIPE_SECRET_KEY` que o
   OpusCash já tem (ler e mexer na assinatura, reembolsar, cancelar ao excluir). Opcional: `PAINEL_ORIGENS` com endereços extras do
   painel, separados por vírgula (localhost, `admin.opuscash.com.br` e `painel-opus-cash*.vercel.app` já valem).
3. **Site:** projeto na Vercel ligado a este repositório (Vite, `npm run build`, pasta `dist`). Não precisa de variável
   de ambiente. Domínio: `admin.opuscash.com.br`.
4. Entre com a sua conta do OpusCash. Na primeira vez o painel mostra um QR: leia com um app de código (Google
   Authenticator, Microsoft Authenticator, Authy, 1Password) e digite o código.

### Incluir outro administrador

```sql
insert into public.adm_admins (user_id, email)
select id, email from auth.users where lower(email) = 'pessoa@exemplo.com'
on conflict do nothing;
```

A pessoa entra com a conta dela do OpusCash e cadastra o próprio celular no primeiro acesso.

### Perdeu o celular do código

No Supabase → Authentication → Users → a conta → apague o fator de MFA. No próximo acesso o painel pede um QR novo.

## Desenvolver

```bash
npm install
npm run dev
```

Antes de publicar: `npx tsc -b`, `npm run lint` e `npm run build`.
