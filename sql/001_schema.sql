-- ============================================================================
-- AGENTE DEMO — schema completo (atendimento + recompra + painel)
-- Projeto Supabase: mhonpvgdklrapcdfovmv
--
-- Rode este arquivo INTEIRO, de uma vez, no SQL Editor do Supabase.
-- É idempotente: rodar de novo não quebra nada e não duplica os templates.
--
-- Modelo: multi-tenant. Um restaurante = uma linha em `restaurantes`.
-- Tudo o que muda entre um lead e outro mora no banco, nunca no código.
-- ============================================================================

-- ─── 1. RESTAURANTES (o tenant) ─────────────────────────────────────────────
-- É a única tabela que você toca ao trocar do lead X para o lead Y.
-- Os templates de nicho (arquivo 002) são clonados por clonar_restaurante():
-- o setup de um lead novo é uma chamada de função, não um formulário do zero.

create table if not exists public.restaurantes (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique,
  nome                  text not null,
  nicho                 text not null default 'restaurante',

  -- Identidade do agente. Entra direto no system prompt: é isso que faz o
  -- dono ver a marca DELE atendendo, e não um chatbot genérico.
  persona_nome          text not null default 'Ana',
  persona_emoji         text not null default '🍽️',
  descricao_negocio     text,
  tom_de_voz            text,

  -- Identidade visual do painel
  cor_primaria          text not null default '#e11d48',
  logo_url              text,

  -- Operação
  endereco              text,
  horario_texto         text not null default 'todos os dias, das 11h as 23h',
  sempre_aberto         boolean not null default true,
  aceita_delivery       boolean not null default true,
  aceita_retirada       boolean not null default true,
  taxa_entrega          numeric(10,2) not null default 0,
  pedido_minimo         numeric(10,2) not null default 0,

  -- Pagamento
  chave_pix             text,
  pix_titular           text,
  pix_banco             text,

  -- Oferta de recompra padrão deste tenant
  desconto_padrao       integer not null default 15,
  validade_cupom_dias   integer not null default 7,

  -- Controle da demo
  template              boolean not null default false,
  ativo                 boolean not null default false,
  proximo_numero_pedido integer not null default 1,

  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

create index if not exists idx_restaurantes_template on public.restaurantes (template);

-- Só um tenant ativo por vez (o fallback quando não há sessão de demo).
create unique index if not exists idx_restaurantes_ativo
  on public.restaurantes (ativo) where ativo = true;

-- ─── 2. PRODUTOS ────────────────────────────────────────────────────────────
create table if not exists public.produtos (
  id                 uuid primary key default gen_random_uuid(),
  restaurante_id     uuid not null references public.restaurantes(id) on delete cascade,
  nome               text not null,
  descricao          text,
  categoria          text not null default 'Outros',
  preco              numeric(10,2) not null,
  preco_promocional  numeric(10,2),
  disponivel         boolean not null default true,
  destaque           boolean not null default false,
  imagem_url         text,
  video_url          text,
  ordem              integer not null default 0,
  criado_em          timestamptz not null default now(),
  unique (restaurante_id, nome)
);

create index if not exists idx_produtos_restaurante on public.produtos (restaurante_id, categoria, ordem);

-- ─── 3. CLIENTES ────────────────────────────────────────────────────────────
-- O telefone é único POR restaurante: o mesmo dono pode ser cliente de duas
-- demos diferentes sem os dados se misturarem.
create table if not exists public.clientes (
  id               uuid primary key default gen_random_uuid(),
  restaurante_id   uuid not null references public.restaurantes(id) on delete cascade,
  telefone         text not null,
  nome             text not null default 'Cliente',
  endereco         text,
  total_pedidos    integer not null default 0,
  total_gasto      numeric(10,2) not null default 0,
  primeiro_pedido  timestamptz,
  ultimo_pedido    timestamptz,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  unique (restaurante_id, telefone)
);

create index if not exists idx_clientes_telefone on public.clientes (telefone);

-- ─── 4. CUPONS ──────────────────────────────────────────────────────────────
-- A ponte entre os dois agentes: a recompra grava aqui, o atendimento lê daqui
-- e aplica o desconto sozinho. O cliente nunca precisa digitar código.
create table if not exists public.cupons (
  id                  uuid primary key default gen_random_uuid(),
  restaurante_id      uuid not null references public.restaurantes(id) on delete cascade,
  cliente_id          uuid not null references public.clientes(id) on delete cascade,
  codigo              text not null,
  tipo                text not null default 'desconto_percentual'
                        check (tipo in ('desconto_percentual','brinde')),
  desconto_percentual integer not null default 0,
  descricao           text,
  itens_permitidos    text[],
  valido_ate          date not null,
  usado               boolean not null default false,
  pedido_id           uuid,
  criado_em           timestamptz not null default now(),
  unique (restaurante_id, codigo)
);

-- O atendimento pergunta "esse cliente tem cupom válido agora?" a cada mensagem.
create index if not exists idx_cupons_ativos
  on public.cupons (cliente_id, valido_ate desc) where usado = false;

-- ─── 5. PEDIDOS ─────────────────────────────────────────────────────────────
create table if not exists public.pedidos (
  id               uuid primary key default gen_random_uuid(),
  restaurante_id   uuid not null references public.restaurantes(id) on delete cascade,
  cliente_id       uuid not null references public.clientes(id) on delete cascade,
  numero_pedido    integer not null,
  status           text not null default 'pendente'
                     check (status in ('pendente','preparando','pronto','saiu_entrega','entregue','cancelado')),
  tipo_entrega     text not null default 'delivery' check (tipo_entrega in ('delivery','retirada')),
  endereco_entrega text,
  forma_pagamento  text check (forma_pagamento in ('pix','dinheiro','cartao')),
  troco_para       numeric(10,2),
  subtotal         numeric(10,2) not null default 0,
  taxa_entrega     numeric(10,2) not null default 0,
  desconto         numeric(10,2) not null default 0,
  total            numeric(10,2) not null default 0,
  cupom_id         uuid references public.cupons(id) on delete set null,
  observacao       text,
  canal            text not null default 'whatsapp',
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  unique (restaurante_id, numero_pedido)
);

create index if not exists idx_pedidos_painel on public.pedidos (restaurante_id, status, criado_em desc);

create table if not exists public.itens_pedido (
  id              uuid primary key default gen_random_uuid(),
  pedido_id       uuid not null references public.pedidos(id) on delete cascade,
  produto_id      uuid references public.produtos(id) on delete set null,
  nome_produto    text not null,
  quantidade      integer not null default 1,
  preco_unitario  numeric(10,2) not null,
  total           numeric(10,2) not null,
  observacao      text,
  cortesia        boolean not null default false,
  criado_em       timestamptz not null default now()
);

create index if not exists idx_itens_pedido on public.itens_pedido (pedido_id);

-- ─── 6. RASCUNHO DO PEDIDO ──────────────────────────────────────────────────
-- Estado da conversa entre uma mensagem e outra. Chave composta: o mesmo
-- telefone pode ter um rascunho em cada demo sem um sobrescrever o outro.
create table if not exists public.pedido_rascunho (
  restaurante_id   uuid not null references public.restaurantes(id) on delete cascade,
  telefone         text not null,
  nome_cliente     text,
  itens            jsonb not null default '[]'::jsonb,
  itens_brinde     jsonb not null default '[]'::jsonb,
  tipo_entrega     text,
  endereco         text,
  forma_pagamento  text,
  troco_para       numeric(10,2),
  observacao       text,
  etapa_atual      text not null default 'inicio',
  total_confirmado numeric(10,2),
  ultima_msg_em    timestamptz,
  ultima_msg_role  text,
  atualizado_em    timestamptz not null default now(),
  primary key (restaurante_id, telefone)
);

-- ─── 7. HISTÓRICO DE MENSAGENS ──────────────────────────────────────────────
create table if not exists public.mensagens (
  id             bigint generated always as identity primary key,
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  telefone       text not null,
  role           text not null check (role in ('user','assistant','system')),
  conteudo       text not null,
  criado_em      timestamptz not null default now()
);

create index if not exists idx_mensagens_conversa
  on public.mensagens (restaurante_id, telefone, criado_em desc);

-- ─── 8. OFERTAS ENVIADAS (log do disparo) ───────────────────────────────────
create table if not exists public.ofertas_enviadas (
  id                   uuid primary key default gen_random_uuid(),
  restaurante_id       uuid not null references public.restaurantes(id) on delete cascade,
  cliente_id           uuid not null references public.clientes(id) on delete cascade,
  cupom_id             uuid references public.cupons(id) on delete set null,
  cupom_codigo         text,
  tipo_oferta          text not null default 'reconexao',
  desconto_percentual  integer not null default 0,
  mensagem_audio       text,
  mensagem_cta         text,
  mensagem_video       text,
  converteu            boolean not null default false,
  pedido_convertido_id uuid references public.pedidos(id) on delete set null,
  enviado_em           timestamptz not null default now()
);

create index if not exists idx_ofertas_restaurante on public.ofertas_enviadas (restaurante_id, enviado_em desc);

-- ─── 9. SESSÕES DE DEMO ─────────────────────────────────────────────────────
-- Com UM número de WhatsApp servindo todas as demos, é isto que diz de qual
-- restaurante o agente é quando o dono responde. Você dispara para o número
-- dele com o tenant X; a resposta dele volta para o tenant X, mesmo que você
-- já tenha feito outra demo depois.
create table if not exists public.demo_sessoes (
  telefone       text primary key,
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  criado_em      timestamptz not null default now(),
  expira_em      timestamptz not null default (now() + interval '24 hours')
);

-- ─── 10. LOGS DO AGENTE ─────────────────────────────────────────────────────
create table if not exists public.agent_logs (
  id             bigint generated always as identity primary key,
  restaurante_id uuid,
  telefone       text,
  nivel          text not null default 'info' check (nivel in ('info','warn','error')),
  etapa          text not null,
  mensagem       text,
  dados          jsonb,
  erro_stack     text,
  criado_em      timestamptz not null default now()
);

create index if not exists idx_agent_logs_recentes on public.agent_logs (criado_em desc);
create index if not exists idx_agent_logs_erros on public.agent_logs (criado_em desc) where nivel = 'error';

-- ============================================================================
-- FUNÇÕES E TRIGGERS
-- ============================================================================

-- ─── atualizado_em automático ───────────────────────────────────────────────
create or replace function public.tocar_atualizado_em()
returns trigger language plpgsql as $fn$
begin
  new.atualizado_em = now();
  return new;
end $fn$;

drop trigger if exists trg_restaurantes_atualizado on public.restaurantes;
create trigger trg_restaurantes_atualizado before update on public.restaurantes
  for each row execute function public.tocar_atualizado_em();

drop trigger if exists trg_clientes_atualizado on public.clientes;
create trigger trg_clientes_atualizado before update on public.clientes
  for each row execute function public.tocar_atualizado_em();

drop trigger if exists trg_pedidos_atualizado on public.pedidos;
create trigger trg_pedidos_atualizado before update on public.pedidos
  for each row execute function public.tocar_atualizado_em();

drop trigger if exists trg_rascunho_atualizado on public.pedido_rascunho;
create trigger trg_rascunho_atualizado before update on public.pedido_rascunho
  for each row execute function public.tocar_atualizado_em();

-- ─── Numeração de pedido por tenant ─────────────────────────────────────────
-- Um contador por restaurante, incrementado atomicamente. O primeiro pedido de
-- cada lead é o #1 — um "#4711" na tela entregaria na hora que o sistema é
-- compartilhado com outros clientes.
create or replace function public.set_numero_pedido()
returns trigger language plpgsql as $fn$
declare
  proximo integer;
begin
  if new.numero_pedido is not null and new.numero_pedido > 0 then
    return new;
  end if;

  update public.restaurantes
     set proximo_numero_pedido = proximo_numero_pedido + 1
   where id = new.restaurante_id
  returning proximo_numero_pedido - 1 into proximo;

  new.numero_pedido = coalesce(proximo, 1);
  return new;
end $fn$;

drop trigger if exists trg_pedidos_numero on public.pedidos;
create trigger trg_pedidos_numero before insert on public.pedidos
  for each row execute function public.set_numero_pedido();

-- ─── Clonar um template de nicho para um lead novo ──────────────────────────
-- É isto que torna o setup de 90 segundos possível: copia o modelo do nicho
-- com todos os produtos, e você ajusta só o nome e dois ou três itens.
--   select clonar_restaurante('template-pizzaria', 'Pizzaria do Leo', 'pizzaria-do-leo');
create or replace function public.clonar_restaurante(
  p_template_slug text,
  p_nome          text,
  p_slug          text
) returns uuid language plpgsql as $fn$
declare
  v_origem uuid;
  v_novo   uuid;
begin
  select id into v_origem from public.restaurantes where slug = p_template_slug;
  if v_origem is null then
    raise exception 'Template % nao encontrado', p_template_slug;
  end if;

  insert into public.restaurantes (
    slug, nome, nicho, persona_nome, persona_emoji, descricao_negocio, tom_de_voz,
    cor_primaria, logo_url, endereco, horario_texto, sempre_aberto,
    aceita_delivery, aceita_retirada, taxa_entrega, pedido_minimo,
    chave_pix, pix_titular, pix_banco, desconto_padrao, validade_cupom_dias,
    template, ativo
  )
  select
    p_slug, p_nome, nicho, persona_nome, persona_emoji,
    descricao_negocio, tom_de_voz,
    cor_primaria, logo_url, endereco, horario_texto, sempre_aberto,
    aceita_delivery, aceita_retirada, taxa_entrega, pedido_minimo,
    chave_pix, pix_titular, pix_banco, desconto_padrao, validade_cupom_dias,
    false, false
  from public.restaurantes where id = v_origem
  returning id into v_novo;

  insert into public.produtos (restaurante_id, nome, descricao, categoria, preco,
                               preco_promocional, disponivel, destaque, imagem_url, video_url, ordem)
  select v_novo, nome, descricao, categoria, preco,
         preco_promocional, disponivel, destaque, imagem_url, video_url, ordem
  from public.produtos where restaurante_id = v_origem;

  return v_novo;
end $fn$;

-- ─── Ativar um tenant (fallback quando não há sessão de demo) ───────────────
create or replace function public.ativar_restaurante(p_id uuid)
returns void language plpgsql as $fn$
begin
  update public.restaurantes set ativo = false where ativo = true and id <> p_id;
  update public.restaurantes set ativo = true  where id = p_id;
end $fn$;

-- ─── Resetar a demo de um tenant ────────────────────────────────────────────
-- Apaga pedidos, cupons, conversas e clientes daquele restaurante, mantendo a
-- configuração e os produtos. Roda antes de cada disparo: sem isso, um carrinho
-- esquecido de uma demo anterior volta no meio da conversa nova.
create or replace function public.resetar_demo(p_restaurante_id uuid)
returns void language plpgsql as $fn$
begin
  delete from public.demo_sessoes     where restaurante_id = p_restaurante_id;
  delete from public.mensagens        where restaurante_id = p_restaurante_id;
  delete from public.pedido_rascunho  where restaurante_id = p_restaurante_id;
  delete from public.ofertas_enviadas where restaurante_id = p_restaurante_id;
  delete from public.pedidos          where restaurante_id = p_restaurante_id;
  delete from public.cupons           where restaurante_id = p_restaurante_id;
  delete from public.clientes         where restaurante_id = p_restaurante_id;
  update public.restaurantes set proximo_numero_pedido = 1 where id = p_restaurante_id;
end $fn$;

-- ============================================================================
-- RLS
-- ============================================================================
-- O painel roda no navegador com a chave publicável, então ele só LÊ (mais a
-- troca de status do pedido, que é o botão da cozinha). Toda escrita de verdade
-- passa pelo servidor com a service_role key, que ignora RLS.
-- Os dados aqui são fictícios de demonstração — nada de cliente real.

alter table public.restaurantes     enable row level security;
alter table public.produtos         enable row level security;
alter table public.clientes         enable row level security;
alter table public.cupons           enable row level security;
alter table public.pedidos          enable row level security;
alter table public.itens_pedido     enable row level security;
alter table public.pedido_rascunho  enable row level security;
alter table public.mensagens        enable row level security;
alter table public.ofertas_enviadas enable row level security;
alter table public.demo_sessoes     enable row level security;
alter table public.agent_logs       enable row level security;

do $rls$
declare t text;
begin
  -- Leitura pública nas tabelas que o painel mostra (e de que o Realtime precisa).
  foreach t in array array['restaurantes','produtos','clientes','cupons','pedidos','itens_pedido','ofertas_enviadas']
  loop
    execute format('drop policy if exists leitura_publica on public.%I', t);
    execute format('create policy leitura_publica on public.%I for select to anon, authenticated using (true)', t);
  end loop;

  -- Rascunho, conversas, sessões e logs são internos do agente: nem leitura.
  foreach t in array array['pedido_rascunho','mensagens','demo_sessoes','agent_logs']
  loop
    execute format('drop policy if exists leitura_publica on public.%I', t);
  end loop;
end $rls$;

-- Única escrita permitida pelo navegador: mover o pedido de status no painel.
drop policy if exists painel_muda_status on public.pedidos;
create policy painel_muda_status on public.pedidos
  for update to anon, authenticated using (true) with check (true);

-- Realtime: é o que faz o pedido aparecer sozinho no painel, com som.
do $rt$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pedidos'
  ) then
    alter publication supabase_realtime add table public.pedidos;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'itens_pedido'
  ) then
    alter publication supabase_realtime add table public.itens_pedido;
  end if;
end $rt$;

-- ─── Storage: fotos e vídeos dos produtos ───────────────────────────────────
insert into storage.buckets (id, name, public)
values ('demo-midia', 'demo-midia', true)
on conflict (id) do nothing;

do $st$
begin
  drop policy if exists demo_midia_leitura on storage.objects;
  create policy demo_midia_leitura on storage.objects
    for select to anon, authenticated using (bucket_id = 'demo-midia');
exception when insufficient_privilege then
  raise notice 'Sem permissao para policy no storage — o bucket demo-midia ja e publico, siga em frente.';
end $st$;
