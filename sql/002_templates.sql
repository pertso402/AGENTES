-- ============================================================================
-- AGENTE DEMO — templates de nicho
-- Rode DEPOIS do 001_schema.sql. Também é idempotente.
--
-- Cada template é um restaurante-modelo com produtos e preços plausíveis.
-- Na frente do lead você não cria nada do zero: clona o nicho dele e troca o
-- nome (e dois ou três produtos, se der tempo).
--
--   select clonar_restaurante('template-hamburgueria', 'Burger do Zé', 'burger-do-ze');
--
-- Isso devolve o id do restaurante novo. Depois:
--   select ativar_restaurante('<id>');   -- vira o tenant padrão
--   select resetar_demo('<id>');         -- zera pedidos/conversas antes de repetir
-- ============================================================================

-- ─── PIZZARIA ───────────────────────────────────────────────────────────────
insert into public.restaurantes
  (slug, nome, nicho, persona_nome, persona_emoji, descricao_negocio, cor_primaria,
   horario_texto, taxa_entrega, chave_pix, pix_titular, pix_banco, desconto_padrao, template)
values
  ('template-pizzaria', 'Modelo — Pizzaria', 'pizzaria', 'Nino', '🍕',
   'pizzaria artesanal de massa de fermentação natural, forno a lenha, delivery e retirada',
   '#dc2626', 'todos os dias, das 18h as 23h30', 8.00,
   'pix@demonstracao.com.br', 'Nome do Titular', 'Nubank', 15, true)
on conflict (slug) do nothing;

insert into public.produtos (restaurante_id, nome, descricao, categoria, preco, destaque, ordem)
select r.id, p.nome, p.descricao, p.categoria, p.preco, p.destaque, p.ordem
from public.restaurantes r,
     (values
        ('Pizza Calabresa G',            'Calabresa fatiada, cebola roxa e orégano — 8 fatias', 'Pizzas',   54.90, true,  1),
        ('Pizza Mussarela G',            'Mussarela cremosa, molho de tomate italiano — 8 fatias', 'Pizzas', 49.90, false, 2),
        ('Pizza Portuguesa G',           'Presunto, ovo, cebola, azeitona e mussarela — 8 fatias', 'Pizzas', 57.90, false, 3),
        ('Pizza Frango com Catupiry G',  'Frango desfiado temperado e Catupiry original — 8 fatias', 'Pizzas', 59.90, false, 4),
        ('Pizza de Chocolate M',         'Chocolate ao leite derretido com morango — 6 fatias', 'Doces',    39.90, false, 5),
        ('Coca-Cola 2L',                 null, 'Bebidas', 14.90, false, 6),
        ('Guaraná Antarctica 2L',        null, 'Bebidas', 12.90, false, 7)
     ) as p(nome, descricao, categoria, preco, destaque, ordem)
where r.slug = 'template-pizzaria'
on conflict (restaurante_id, nome) do nothing;

-- ─── HAMBURGUERIA ───────────────────────────────────────────────────────────
insert into public.restaurantes
  (slug, nome, nicho, persona_nome, persona_emoji, descricao_negocio, cor_primaria,
   horario_texto, taxa_entrega, chave_pix, pix_titular, pix_banco, desconto_padrao, template)
values
  ('template-hamburgueria', 'Modelo — Hamburgueria', 'hamburgueria', 'Duda', '🍔',
   'hamburgueria artesanal de blend bovino, pão brioche e batata rústica, delivery e retirada',
   '#ea580c', 'de terça a domingo, das 18h as 23h', 8.00,
   'pix@demonstracao.com.br', 'Nome do Titular', 'Nubank', 15, true)
on conflict (slug) do nothing;

insert into public.produtos (restaurante_id, nome, descricao, categoria, preco, destaque, ordem, video_url)
select r.id, p.nome, p.descricao, p.categoria, p.preco, p.destaque, p.ordem, p.video_url
from public.restaurantes r,
     (values
        ('X-Bacon Artesanal',          'Blend 180g, cheddar inglês, bacon crocante e maionese da casa', 'Burgers', 32.90, true,  1,
         'https://mhonpvgdklrapcdfovmv.supabase.co/storage/v1/object/public/video%20burguer/food%20porn.mp4'),
        ('X-Salada Artesanal',         'Blend 180g, queijo prato, alface, tomate e cebola roxa', 'Burgers', 28.90, false, 2, null),
        ('Smash Duplo',                'Dois smashs 90g, queijo cheddar duplo e picles', 'Burgers', 34.90, false, 3, null),
        ('Batata Frita com Cheddar e Bacon', 'Porção 400g', 'Porções', 24.90, false, 4, null),
        ('Combo Burger + Batata + Refri',   'X-Salada, fritas 200g e refrigerante lata', 'Combos', 44.90, false, 5, null),
        ('Coca-Cola Lata 350ml',       null, 'Bebidas', 7.00, false, 6, null),
        ('Milkshake Ovomaltine 500ml', null, 'Sobremesas', 22.90, false, 7, null)
     ) as p(nome, descricao, categoria, preco, destaque, ordem, video_url)
where r.slug = 'template-hamburgueria'
on conflict (restaurante_id, nome) do nothing;

-- ─── MARMITARIA ─────────────────────────────────────────────────────────────
insert into public.restaurantes
  (slug, nome, nicho, persona_nome, persona_emoji, descricao_negocio, cor_primaria,
   horario_texto, taxa_entrega, chave_pix, pix_titular, pix_banco, desconto_padrao, template)
values
  ('template-marmitaria', 'Modelo — Marmitaria', 'marmitaria', 'Chica', '🍱',
   'marmitaria de comida caseira feita na hora, com buffet variado todo dia',
   '#16a34a', 'de segunda a sábado, das 10h30 as 14h', 8.00,
   'pix@demonstracao.com.br', 'Nome do Titular', 'Nubank', 15, true)
on conflict (slug) do nothing;

insert into public.produtos (restaurante_id, nome, descricao, categoria, preco, destaque, ordem)
select r.id, p.nome, p.descricao, p.categoria, p.preco, p.destaque, p.ordem
from public.restaurantes r,
     (values
        ('Marmitex Grande',   'Duas carnes e seis acompanhamentos — vai cheia', 'Marmitas', 26.90, true,  1),
        ('Marmitex Média',    'Duas carnes e cinco acompanhamentos', 'Marmitas', 22.90, false, 2),
        ('Marmitex Pequena',  'Uma carne e quatro acompanhamentos', 'Marmitas', 18.90, false, 3),
        ('Feijoada Individual', 'Servida às quartas e sábados, com arroz, couve e farofa', 'Marmitas', 29.90, false, 4),
        ('Refrigerante Lata 350ml', null, 'Bebidas', 6.50, false, 5),
        ('Suco Natural 500ml',      'Laranja, maracujá ou limão', 'Bebidas', 9.90, false, 6),
        ('Pudim de Leite',    'Fatia individual', 'Sobremesas', 8.90, false, 7)
     ) as p(nome, descricao, categoria, preco, destaque, ordem)
where r.slug = 'template-marmitaria'
on conflict (restaurante_id, nome) do nothing;

-- ─── AÇAÍ / SORVETERIA ──────────────────────────────────────────────────────
insert into public.restaurantes
  (slug, nome, nicho, persona_nome, persona_emoji, descricao_negocio, cor_primaria,
   horario_texto, taxa_entrega, chave_pix, pix_titular, pix_banco, desconto_padrao, template)
values
  ('template-acai', 'Modelo — Açaiteria', 'acai', 'Vitinho', '🍧',
   'açaiteria com polpa cremosa batida na hora e acompanhamentos à escolha',
   '#7c3aed', 'todos os dias, das 14h as 22h30', 7.00,
   'pix@demonstracao.com.br', 'Nome do Titular', 'Nubank', 15, true)
on conflict (slug) do nothing;

insert into public.produtos (restaurante_id, nome, descricao, categoria, preco, destaque, ordem)
select r.id, p.nome, p.descricao, p.categoria, p.preco, p.destaque, p.ordem
from public.restaurantes r,
     (values
        ('Açaí 500ml',        'Com três acompanhamentos à escolha', 'Açaí', 24.90, true,  1),
        ('Açaí 300ml',        'Com dois acompanhamentos à escolha', 'Açaí', 18.90, false, 2),
        ('Açaí 700ml',        'Com quatro acompanhamentos à escolha', 'Açaí', 32.90, false, 3),
        ('Barca de Açaí 1L',  'Serve duas pessoas, com cinco acompanhamentos', 'Açaí', 49.90, false, 4),
        ('Creme de Cupuaçu 500ml', 'Com três acompanhamentos à escolha', 'Cremes', 26.90, false, 5),
        ('Adicional Nutella', null, 'Adicionais', 6.00, false, 6),
        ('Água Mineral 500ml', null, 'Bebidas', 5.00, false, 7)
     ) as p(nome, descricao, categoria, preco, destaque, ordem)
where r.slug = 'template-acai'
on conflict (restaurante_id, nome) do nothing;

-- ─── SUSHI / JAPONESA ───────────────────────────────────────────────────────
insert into public.restaurantes
  (slug, nome, nicho, persona_nome, persona_emoji, descricao_negocio, cor_primaria,
   horario_texto, taxa_entrega, chave_pix, pix_titular, pix_banco, desconto_padrao, template)
values
  ('template-sushi', 'Modelo — Japonesa', 'sushi', 'Yuki', '🍣',
   'restaurante japonês com peixe fresco do dia, combinados e temakis feitos na hora',
   '#0f172a', 'de terça a domingo, das 18h as 23h', 9.00,
   'pix@demonstracao.com.br', 'Nome do Titular', 'Nubank', 15, true)
on conflict (slug) do nothing;

insert into public.produtos (restaurante_id, nome, descricao, categoria, preco, destaque, ordem)
select r.id, p.nome, p.descricao, p.categoria, p.preco, p.destaque, p.ordem
from public.restaurantes r,
     (values
        ('Combinado 30 peças', 'Sashimi, niguiri, uramaki e hot roll', 'Combinados', 89.90, true,  1),
        ('Combinado 20 peças', 'Sashimi, niguiri e uramaki', 'Combinados', 64.90, false, 2),
        ('Temaki de Salmão',   'Cone de alga com arroz, salmão fresco e cream cheese', 'Temakis', 32.90, false, 3),
        ('Hot Roll 8 peças',   'Empanado na hora, com molho tarê', 'Entradas', 29.90, false, 4),
        ('Yakisoba de Frango', 'Porção individual com legumes salteados', 'Pratos Quentes', 42.90, false, 5),
        ('Sunomono',           'Pepino agridoce com gergelim', 'Entradas', 18.90, false, 6),
        ('Coca-Cola Lata 350ml', null, 'Bebidas', 7.00, false, 7)
     ) as p(nome, descricao, categoria, preco, destaque, ordem)
where r.slug = 'template-sushi'
on conflict (restaurante_id, nome) do nothing;

-- ─── DOCERIA / PADARIA ──────────────────────────────────────────────────────
insert into public.restaurantes
  (slug, nome, nicho, persona_nome, persona_emoji, descricao_negocio, cor_primaria,
   horario_texto, taxa_entrega, chave_pix, pix_titular, pix_banco, desconto_padrao, template)
values
  ('template-doceria', 'Modelo — Doceria e Padaria', 'doceria', 'Bel', '🧁',
   'doceria e padaria artesanal com bolos, doces finos e pães feitos no dia',
   '#db2777', 'de segunda a sábado, das 7h as 19h', 6.00,
   'pix@demonstracao.com.br', 'Nome do Titular', 'Nubank', 15, true)
on conflict (slug) do nothing;

insert into public.produtos (restaurante_id, nome, descricao, categoria, preco, destaque, ordem)
select r.id, p.nome, p.descricao, p.categoria, p.preco, p.destaque, p.ordem
from public.restaurantes r,
     (values
        ('Bolo de Pote Ninho com Nutella', 'Massa branca, creme de leite ninho e Nutella — 300ml', 'Doces', 18.90, true,  1),
        ('Caixa com 6 Brigadeiros Gourmet', 'Sortidos: tradicional, ninho, churros e pistache', 'Doces', 24.90, false, 2),
        ('Torta Holandesa (fatia)', 'Base de bolacha, creme e cobertura de chocolate belga', 'Doces', 16.90, false, 3),
        ('Cesta de Café da Manhã',  'Pães, frios, bolo, suco e café — serve duas pessoas', 'Cestas', 89.90, false, 4),
        ('Pão Francês (kg)',        'Assado de hora em hora', 'Padaria', 18.90, false, 5),
        ('Sonho de Creme',          'Recheado na hora', 'Padaria', 8.50, false, 6),
        ('Cappuccino Cremoso 500ml', null, 'Bebidas', 14.90, false, 7)
     ) as p(nome, descricao, categoria, preco, destaque, ordem)
where r.slug = 'template-doceria'
on conflict (restaurante_id, nome) do nothing;

-- ─── Conferência ────────────────────────────────────────────────────────────
-- select r.slug, r.nome, count(p.id) as produtos
--   from restaurantes r left join produtos p on p.restaurante_id = r.id
--  where r.template group by 1,2 order by 1;
