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
6. O login fica até você clicar em Sair (só neste aparelho). O site não aparece no Google (`noindex`, `robots.txt`).

## O que cada tela faz

- **Início:** saudação, busca rápida de conta e atualização sozinha a cada 5 minutos. Quatro números com variação contra
  o período anterior e minigráfico (contas, pagando agora, recebido em 30 dias, erros na semana); gráfico de movimento
  (cadastros, dinheiro recebido ou erros, em 30 ou 90 dias); rosca de como as contas estão divididas; quem pede atenção
  (cartão recusado, prazo ou teste vencendo em 7 dias); últimos cadastros; uso (entraram na semana e no mês, e-mail não
  confirmado, bloqueadas) e as últimas ações do suporte.
- **Animações:** as mesmas do OpusCash: o tema novo se espalha como tinta a partir do clique, a pílula desliza até o
  item escolhido (menu, abas, filtros, segmentados), os blocos sobem um depois do outro ao trocar de aba, os botões são
  puxados de leve pelo cursor e respondem com mola, as janelas entram desembaçando e os avisos sobem com mola.
- **Visual:** o mesmo do OpusCash (cores, fontes Inter/Sora/Montserrat servidas pelo próprio painel, ícones, número que
  conta). Barra lateral no computador e abas embaixo no celular. A conta fica no pé da lateral, com a aparência
  (escuro, claro ou automático, guardada só neste navegador) e o botão de sair.
- **Uso do app** (migração 30 do OpusCash + `03-uso.sql`): quem está com o OpusCash aberto agora (atualiza sozinho a cada 20 s)
  e em qual tela; na ficha, a aba **Uso do app** mostra a presença ao vivo, quando foi vista por último, idioma, site ou app,
  versão, se respondeu as perguntas iniciais e o Consultor, se pulou o tutorial (em qual passo) ou viu inteiro, o jeito de ver
  (simples, equilibrado, detalhado), as abas ligadas, a foto de perfil, **quantas** coisas cadastrou em cada parte do app
  (só a contagem, nunca o conteúdo), tempo por dia e tempo, visitas e toques em cada tela. No Início, "Usando agora" e
  "Como o app é usado" (telas mais usadas, tutorial, jeitos de ver, idiomas e aparelhos de todo mundo). A foto de perfil
  aparece também na lista de contas e no topo da ficha.
- **Novidades** (migração 31 do OpusCash + `04-novidades.sql`): o pop-up "Tem novidade!" que aparece **uma vez** no OpusCash
  (site e app) para quem já tinha conta. Escolha o ícone grande, a cor, um título curto, até 4 itens (ícone + poucas
  palavras), para onde o botão leva e onde aparece (site, app ou os dois), com a prévia ao lado igual ao que a pessoa vê.
  Salve como rascunho ou publique. Só a mais recente publicada aparece; a lista mostra quantas pessoas já viram. Publicar não
  pede versão nova do site nem do app (no app Android, vale a partir da 2.5.0).
  - **Arte livre** (migração 32 do OpusCash + `05-arte-das-novidades.sql`): um editor para montar o pop-up no estilo dos anúncios
    do OpusCash. Modelos prontos (Lançamento, Novidade, Suporte), formato em pé ou deitado, 6 fundos e os elementos da marca
    para pôr na arte: título, frase, marca, símbolo, cartão, gráfico, barras, rosca, moedas, selo, botão, ícone, forma e brilho.
    Arraste para mover, puxe os cantos para mudar o tamanho, guias de alinhamento entre os elementos, camadas, cor, inclinação,
    transparência, duplicar e desfazer (Ctrl+Z). "Ver como a pessoa vê" mostra o pop-up final. As peças ficam em
    `pecas/ArteNovidade.tsx` e `pecas/arte.css`, cópias das do OpusCash (`src/components/`): mudou lá, copie para cá.
- **Reembolsos:** o Início lista os reembolsos feitos no Stripe (pelo painel ou direto no Stripe, cartão e Pix), com a conta
  de cada um; na aba Cartão e Stripe da ficha, cada cobrança mostra os reembolsos dela (valor, data e motivo).
- **Suporte:** os pedidos de ajuda que as pessoas abrem no OpusCash (botão de conversa em qualquer tela do app; migração 33 do OpusCash + `06-suporte.sql`).
  Números da fila (esperando o suporte, esperando a pessoa, resolvidos na semana, tempo típico da primeira resposta), filtro por situação e por
  assunto (pagamento, algo não funciona, conta, dúvida, sugestão, outro), busca por e-mail, nome ou assunto. A conversa mostra a pessoa (com a
  situação do acesso e o link para a ficha), de onde ela pediu (tela, aparelho, versão, idioma), se ela já viu a resposta, respostas prontas,
  "Responder", "Responder e resolver", "Resolver sem responder" e "Reabrir" (com motivo). Atualiza sozinha (fila a cada 30 s, conversa a cada
  15 s) e o menu mostra quantos esperam resposta. A ficha da pessoa lista os pedidos dela. Abrir, responder e mudar a situação ficam no registro.
- **Contas:** busca por e-mail ou nome (atalho `/`), filtros com contagem (em teste, vence em 7 dias, cartão, liberados,
  vitalícios, sem acesso, com problema), ordem (mais novas, último acesso, vence primeiro, nome) e vista em lista ou
  cartões. Cada conta mostra a situação, quantos dias faltam e se entrou hoje (bolinha verde) ou na semana (amarela).
- **Ficha da conta:** cabeçalho com a pessoa (cadastro, último acesso, aparelhos, moeda, copiar e-mail) e abas: visão
  geral (acesso com o anel de dias que faltam, login e senha), cartão e Stripe (o cartão salvo desenhado), pagamentos,
  anotações e histórico, erros. O que dá para fazer:
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
- **Erros:** os erros de `erros_app` agrupados pela mensagem. Números do período (abertos, voltaram, vezes,
  resolvidos), gráfico de erros por dia, filtro (abertos, resolvidos, todos) e busca. Cada erro abre uma gaveta com a
  primeira e a última vez, as últimas ocorrências (com a conta e o detalhe técnico, que dá para copiar) e o botão de
  marcar como resolvido (avisa se voltou a acontecer).
- **Registro:** tudo o que o suporte fez, em linha do tempo agrupada por dia, com ícone e cor por tipo de ação.
  Números da semana (ações, equipe, contas atendidas), gráfico de ações por dia, filtro por tipo e busca por conta,
  quem fez ou motivo.

## Colocar no ar

1. **Banco:** rode `supabase/migracoes/01-painel.sql` no SQL Editor (precisa das migrações 12, 16 e 29 do OpusCash).
   Ela já põe `edigarbarros14@gmail.com` como administrador.
   Depois rode `supabase/migracoes/02-inicio.sql` (números novos da tela Início) e, com a migração 30 do OpusCash já rodada,
   `supabase/migracoes/03-uso.sql` (uso do app, foto e quem está online). Rodou a 01 de novo? Rode a 03 depois dela.
   Para o suporte: a migração 33 do OpusCash e depois `supabase/migracoes/06-suporte.sql`.
   Com a migração 31 do OpusCash rodada, `supabase/migracoes/04-novidades.sql` (tela Novidades).
   Com a 32 do OpusCash rodada, `supabase/migracoes/05-arte-das-novidades.sql` (arte livre das novidades).
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
