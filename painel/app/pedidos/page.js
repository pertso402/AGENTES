'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTenant } from '../moldura';
import { sb } from '../../lib/publico';
import { fmtBRL, telefoneBonito } from '../../lib/formato';

const FLUXO = ['pendente', 'preparando', 'pronto', 'saiu_entrega', 'entregue'];

const ROTULO = {
  pendente: 'Novos',
  preparando: 'Preparando',
  pronto: 'Prontos',
  saiu_entrega: 'Saiu pra entrega',
  entregue: 'Finalizados',
  cancelado: 'Cancelados',
};

const PROXIMO = {
  pendente: 'Aceitar e preparar',
  preparando: 'Marcar como pronto',
  pronto: 'Saiu pra entrega',
  saiu_entrega: 'Finalizar',
};

const ABAS = ['pendente', 'preparando', 'pronto', 'entregue', 'cancelado'];

export default function Pedidos() {
  const { tenant, tenantId } = useTenant();
  const [pedidos, setPedidos] = useState([]);
  const [aba, setAba] = useState('pendente');
  const [carregando, setCarregando] = useState(true);
  const conhecidos = useRef(new Set());

  const carregar = useCallback(async () => {
    if (!tenantId) return;

    const { data } = await sb
      .from('pedidos')
      .select('*, clientes(nome, telefone), itens_pedido(*), cupons(codigo, desconto_percentual)')
      .eq('restaurante_id', tenantId)
      .order('criado_em', { ascending: false })
      .limit(60);

    setPedidos(data || []);
    setCarregando(false);
    return data || [];
  }, [tenantId]);

  useEffect(() => {
    conhecidos.current = new Set();
    setCarregando(true);
    carregar().then((lista) => {
      // A primeira carga não toca som: os pedidos que já estavam lá não são
      // novidade, e um alarme ao abrir a tela assusta em vez de avisar.
      (lista || []).forEach((p) => conhecidos.current.add(p.id));
    });
  }, [carregar, tenantId]);

  // Realtime: é isto que faz o pedido aparecer sozinho na tela enquanto o dono
  // está olhando. Sem isso a demo vira "aperta F5", que não impressiona ninguém.
  useEffect(() => {
    if (!tenantId) return;

    const canal = sb
      .channel(`pedidos-${tenantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos', filter: `restaurante_id=eq.${tenantId}` },
        async (payload) => {
          const lista = await carregar();
          const novo = payload.eventType === 'INSERT' && !conhecidos.current.has(payload.new?.id);
          (lista || []).forEach((p) => conhecidos.current.add(p.id));
          if (novo) {
            setAba('pendente');
            tocarAlerta();
          }
        }
      )
      .subscribe();

    return () => { sb.removeChannel(canal); };
  }, [tenantId, carregar]);

  async function avancar(pedido) {
    const atual = FLUXO.indexOf(pedido.status);
    const proximo = FLUXO[atual + 1];
    if (!proximo) return;

    setPedidos((lista) => lista.map((p) => (p.id === pedido.id ? { ...p, status: proximo } : p)));
    await sb.from('pedidos').update({ status: proximo }).eq('id', pedido.id);
  }

  async function cancelar(pedido) {
    if (!window.confirm(`Cancelar o pedido #${pedido.numero_pedido}?`)) return;
    setPedidos((lista) => lista.map((p) => (p.id === pedido.id ? { ...p, status: 'cancelado' } : p)));
    await sb.from('pedidos').update({ status: 'cancelado' }).eq('id', pedido.id);
  }

  if (!tenant) return <div className="vazio">Escolha um restaurante na aba Disparar.</div>;

  const visiveis = pedidos.filter((p) =>
    aba === 'entregue' ? ['entregue', 'saiu_entrega'].includes(p.status) : p.status === aba
  );

  return (
    <>
      <div className="abas">
        {ABAS.map((s) => {
          const n = pedidos.filter((p) =>
            s === 'entregue' ? ['entregue', 'saiu_entrega'].includes(p.status) : p.status === s
          ).length;
          return (
            <button key={s} className={`aba ${aba === s ? 'ativa' : ''}`} onClick={() => setAba(s)}>
              {ROTULO[s]} {n > 0 && `(${n})`}
            </button>
          );
        })}
      </div>

      {carregando && <div className="vazio">Carregando pedidos...</div>}

      {!carregando && !visiveis.length && (
        <div className="vazio">
          Nenhum pedido aqui.
          <br />
          Os pedidos caem nesta tela sozinhos, assim que o cliente confirmar no WhatsApp.
        </div>
      )}

      {visiveis.map((p) => (
        <CardPedido key={p.id} pedido={p} onAvancar={avancar} onCancelar={cancelar} />
      ))}
    </>
  );
}

function CardPedido({ pedido, onAvancar, onCancelar }) {
  const hora = new Date(pedido.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const itens = pedido.itens_pedido || [];
  const encerrado = ['entregue', 'cancelado'].includes(pedido.status);

  return (
    <div className="card">
      <div className="pedido-topo">
        <span className="pedido-num">#{pedido.numero_pedido}</span>
        <span className="pedido-hora">{hora}</span>
      </div>

      <div className="pedido-cliente">{pedido.clientes?.nome || 'Cliente'}</div>
      <div className="pedido-tel">{telefoneBonito(pedido.clientes?.telefone)}</div>

      <div className="etiquetas">
        <span className="etiqueta">{pedido.tipo_entrega === 'delivery' ? '🛵 Entrega' : '🏃 Retirada'}</span>
        {pedido.forma_pagamento && <span className="etiqueta">{rotuloPagamento(pedido)}</span>}
        {pedido.cupons?.codigo && (
          <span className="etiqueta etiqueta-cupom">
            🎟️ {pedido.cupons.codigo} · {pedido.cupons.desconto_percentual}%
          </span>
        )}
      </div>

      {pedido.endereco_entrega && (
        <div style={{ fontSize: 13, color: 'var(--texto-fraco)', marginBottom: 10, lineHeight: 1.5 }}>
          📍 {pedido.endereco_entrega}
        </div>
      )}

      <div className="itens">
        {itens.map((i) => (
          <div key={i.id}>
            <div className="item">
              <span>{i.quantidade}x {i.nome_produto}{i.cortesia ? ' (cortesia)' : ''}</span>
              <span>{fmtBRL(i.total)}</span>
            </div>
            {i.observacao && <div className="item-obs">↳ {i.observacao}</div>}
          </div>
        ))}
      </div>

      {pedido.observacao && (
        <div className="aviso aviso-atencao" style={{ fontSize: 12 }}>📝 {pedido.observacao}</div>
      )}

      <div className="totais">
        <div><span>Subtotal</span><span>{fmtBRL(pedido.subtotal)}</span></div>
        {Number(pedido.taxa_entrega) > 0 && (
          <div><span>Entrega</span><span>{fmtBRL(pedido.taxa_entrega)}</span></div>
        )}
        {Number(pedido.desconto) > 0 && (
          <div><span>Desconto</span><span>− {fmtBRL(pedido.desconto)}</span></div>
        )}
        <div className="total-final"><span>Total</span><span>{fmtBRL(pedido.total)}</span></div>
      </div>

      {!encerrado && (
        <div className="acoes">
          <button className="btn" onClick={() => onAvancar(pedido)}>{PROXIMO[pedido.status]}</button>
          <button className="btn btn-perigo btn-pequeno" onClick={() => onCancelar(pedido)}>Cancelar</button>
        </div>
      )}
    </div>
  );
}

function rotuloPagamento(pedido) {
  const base = { pix: '💠 PIX', dinheiro: '💵 Dinheiro', cartao: '💳 Cartão' }[pedido.forma_pagamento]
    || pedido.forma_pagamento;
  if (pedido.forma_pagamento === 'dinheiro' && pedido.troco_para != null) {
    return Number(pedido.troco_para) === 0 ? `${base} (sem troco)` : `${base} — troco pra ${fmtBRL(pedido.troco_para)}`;
  }
  return base;
}

// Som gerado na hora, sem arquivo: um MP3 hospedado é mais uma coisa pra falhar
// no wi-fi do restaurante bem na hora em que o pedido cai.
function tocarAlerta() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.18, 0.36].forEach((atraso, i) => {
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      osc.connect(vol);
      vol.connect(ctx.destination);
      osc.frequency.value = i === 2 ? 1180 : 880;
      osc.type = 'sine';
      vol.gain.setValueAtTime(0.0001, ctx.currentTime + atraso);
      vol.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + atraso + 0.02);
      vol.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + atraso + 0.16);
      osc.start(ctx.currentTime + atraso);
      osc.stop(ctx.currentTime + atraso + 0.18);
    });
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  } catch {
    /* navegador bloqueou áudio antes de qualquer toque na tela — sem alarme, mas o card aparece */
  }
}
