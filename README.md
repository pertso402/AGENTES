# Agente Demo

Sistema multi-tenant de demonstração ao vivo para prospecção presencial de
restaurantes: você dispara uma oferta pro WhatsApp do dono, ele responde, o
agente monta o pedido aplicando o cupom sozinho, e o pedido cai num painel em
tempo real com a marca **dele**.

Tudo que identifica o restaurante mora no banco. Trocar do lead X pro Y é criar
um tenant, não editar código.

```
sql/       migrations do Supabase (rodar uma vez, na ordem)
painel/    Next.js — disparo + painel de pedidos + setup do restaurante  (Vercel)
agente/    Node/Express — atendimento no WhatsApp                        (sempre ligado)
_ref/      os três repos do Chapelão, só como referência (não é deploy)
```

## 1. Banco

No SQL Editor do Supabase, rode na ordem:

1. `sql/001_schema.sql` — tabelas, funções, RLS, realtime, bucket de mídia
2. `sql/002_templates.sql` — 6 templates de nicho com cardápio pronto

Ambos são idempotentes. Conferência:

```sql
select slug, nome from restaurantes where template order by slug;
```

## 2. Painel (Vercel)

```bash
cd painel && npm install && cp .env.local.example .env.local
```

Preencha `.env.local` (a `service_role` key está em Supabase → Settings → API) e:

```bash
npm run dev
```

Abre em `http://localhost:3001`. Na Vercel, as mesmas variáveis vão em
Environment Variables.

## 3. Agente (sempre ligado)

Precisa de um processo que não durma — EasyPanel, Railway, Fly. Serverless não
serve: o agrupamento de mensagens picadas e a fila por telefone vivem em memória.

```bash
cd agente && npm install && cp .env.example .env
npm test        # 27 testes de preço, troco e confirmação — não dependem de rede
npm start
```

Depois, na Evolution, aponte o webhook da instância para
`https://SEU-AGENTE/webhook` com o evento **MESSAGES_UPSERT**.

`GET /health` diz o que está faltando de configuração e qual tenant está ativo.

## Como rodar uma demo

1. **Setup** → nome do restaurante + nicho → *Criar com cardápio pronto* (~30s)
2. Ajuste o que der tempo: cor da marca, dois ou três produtos, e a **foto ou
   vídeo do produto em OFERTA** — se você fotografar o prato real dele ali na
   hora, a oferta sai com a comida da casa
3. **Disparar** → número do dono → *Disparar oferta*
4. Ele recebe áudio + vídeo + cupom. Responde no mesmo chat
5. O agente atende, monta o pedido e aplica o desconto sozinho
6. **Pedidos** → o card aparece com som, ele despacha

Para repetir no mesmo lead: **Setup → Zerar a demo**. Cada disparo já limpa
sozinho a conversa daquele número.

## Decisões que valem saber

- **Um número de WhatsApp só** faz disparo e atendimento, pra o dono responder
  no mesmo chat. Qual restaurante o agente representa vem de `demo_sessoes`
  (telefone → tenant, 24h), com fallback no tenant ativo.
- **A LLM não faz conta.** Preço, desconto, taxa, troco e o texto do resumo são
  calculados em `agente/src/precos.js`, e a mesma função roda no resumo e na
  gravação do pedido — não há como divergir.
- **Taxa de entrega é fixa por tenant.** No sistema original ela era digitada à
  mão no painel e o agente ficava esperando; numa demo de três minutos isso
  seria fatal.
- **Sem horário de funcionamento, sem pausa pra atendente humano.** Sua demo
  pode ser às 16h, e o agente não pode emudecer no meio dela.
