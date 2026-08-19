'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTenant } from './moldura';
import { telefoneBonito } from '../lib/formato';

// O disparo leva de 8 a 15 segundos (número, copy, voz, envio). Silêncio nesse
// tempo, na frente do dono, parece travamento — então a tela conta o que está
// acontecendo enquanto isso.
const ETAPAS = [
  'Conferindo o WhatsApp...',
  'Escrevendo a oferta...',
  'Gravando o áudio...',
  'Enviando pro celular...',
];

export default function Disparar() {
  const { restaurantes, tenant, tenantId, trocarTenant, carregando } = useTenant();
  const [telefone, setTelefone] = useState('');
  const [nome, setNome] = useState('');
  const [comAudio, setComAudio] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [etapa, setEtapa] = useState(0);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);
  const timer = useRef(null);

  const leads = restaurantes.filter((r) => !r.template);

  useEffect(() => () => clearInterval(timer.current), []);

  async function disparar() {
    if (!tenantId) return setErro('Escolha um restaurante primeiro.');
    if (!telefone.trim()) return setErro('Digite o número do celular.');

    setEnviando(true);
    setErro(null);
    setResultado(null);
    setEtapa(0);
    timer.current = setInterval(() => setEtapa((e) => Math.min(e + 1, ETAPAS.length - 1)), 3500);

    try {
      const res = await fetch('/api/disparar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restauranteId: tenantId, telefone, nome, comAudio }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha no disparo');
      setResultado(data);
    } catch (e) {
      setErro(e.message);
    } finally {
      clearInterval(timer.current);
      setEnviando(false);
    }
  }

  if (carregando) return <div className="vazio">Carregando...</div>;

  if (!leads.length) {
    return (
      <div className="vazio">
        Nenhum restaurante configurado ainda.
        <br />
        <br />
        <Link href="/setup" className="btn btn-pequeno" style={{ textDecoration: 'none' }}>
          Criar o primeiro em 90 segundos
        </Link>
      </div>
    );
  }

  return (
    <>
      {erro && <div className="aviso aviso-erro">{erro}</div>}

      {resultado && (
        <div className="card">
          <div className="aviso aviso-ok" style={{ marginBottom: 12 }}>
            Oferta enviada para {telefoneBonito(telefone)} — cupom <b>{resultado.cupom.codigo}</b> (
            {resultado.cupom.desconto}% off) já está no banco.
          </div>

          {resultado.avisos?.map((a, i) => (
            <div key={i} className="aviso aviso-atencao">{a}</div>
          ))}

          <p className="titulo">O que ele recebeu</p>
          <div style={{ fontSize: 13, color: 'var(--texto-fraco)', lineHeight: 1.55 }}>
            {resultado.comAudio && <p style={{ marginTop: 0 }}>🎙️ <i>{resultado.textoAudio}</i></p>}
            <p style={{ marginBottom: 0 }}>🎬 {resultado.produto} — “{resultado.cta}”</p>
          </div>

          <div className="acoes">
            <Link href="/pedidos" className="btn btn-secundario" style={{ textAlign: 'center', textDecoration: 'none' }}>
              Abrir o painel de pedidos
            </Link>
          </div>
        </div>
      )}

      <div className="card">
        <p className="titulo">Restaurante</p>
        <div className="campo">
          <select value={tenantId || ''} onChange={(e) => trocarTenant(e.target.value)}>
            {leads.map((r) => (
              <option key={r.id} value={r.id}>{r.nome}</option>
            ))}
          </select>
        </div>

        <p className="titulo">Pra quem vai a oferta</p>

        <div className="campo">
          <label htmlFor="tel">Celular com DDD</label>
          <input
            id="tel"
            type="tel"
            inputMode="numeric"
            placeholder="44 99999-9999"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
          />
        </div>

        <div className="campo">
          <label htmlFor="nome">Nome (opcional)</label>
          <input
            id="nome"
            placeholder="Como o agente vai chamar a pessoa"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </div>

        <div className="toggle">
          <input id="audio" type="checkbox" checked={comAudio} onChange={(e) => setComAudio(e.target.checked)} />
          <span>Mandar com áudio (voz humana)</span>
        </div>

        <button className="btn" onClick={disparar} disabled={enviando}>
          {enviando ? ETAPAS[etapa] : `Disparar oferta de ${tenant?.desconto_padrao || 15}%`}
        </button>
      </div>

      <p style={{ fontSize: 12, color: 'var(--texto-fraco)', textAlign: 'center', lineHeight: 1.6 }}>
        A cada disparo a conversa desse número é zerada.
        <br />
        Quando ele responder, {tenant?.persona_nome || 'o agente'} assume no mesmo chat.
      </p>
    </>
  );
}
