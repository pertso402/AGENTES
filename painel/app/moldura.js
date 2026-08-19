'use client';

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { tenantSalvo, salvarTenant } from '../lib/publico';

// O restaurante selecionado é estado global de verdade: as três telas falam do
// mesmo tenant, e trocar numa tem que refletir nas outras na hora.
const TenantContext = createContext(null);

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant fora do provider');
  return ctx;
}

export default function Moldura({ children }) {
  const [restaurantes, setRestaurantes] = useState([]);
  const [tenantId, setTenantId] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const caminho = usePathname();

  const recarregar = useCallback(async () => {
    try {
      const res = await fetch('/api/restaurantes');
      const data = await res.json();
      const lista = data.restaurantes || [];
      setRestaurantes(lista);

      // Preferência, nesta ordem: o que você escolheu neste aparelho, o marcado
      // como ativo no banco, o lead mais recente.
      const leads = lista.filter((r) => !r.template);
      setTenantId((atual) => {
        const salvo = atual || tenantSalvo();
        if (salvo && leads.some((r) => r.id === salvo)) return salvo;
        return leads.find((r) => r.ativo)?.id || leads[0]?.id || null;
      });
    } catch {
      /* offline: a tela mostra o estado vazio e você tenta de novo */
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { recarregar(); }, [recarregar]);

  const trocarTenant = useCallback((id) => {
    setTenantId(id);
    salvarTenant(id);
    // Melhor esforço: se a rede falhar, o painel continua no tenant certo
    // localmente — só o fallback do agente fica desatualizado.
    if (id) {
      fetch('/api/restaurantes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, acao: 'ativar' }),
      }).catch(() => {});
    }
  }, []);

  const tenant = useMemo(
    () => restaurantes.find((r) => r.id === tenantId) || null,
    [restaurantes, tenantId]
  );

  // A cor da marca do lead pinta o painel inteiro. É metade do efeito de "isso
  // é o MEU sistema" — o dono vê a identidade dele, não a nossa.
  useEffect(() => {
    if (tenant?.cor_primaria) {
      document.documentElement.style.setProperty('--marca', tenant.cor_primaria);
    }
  }, [tenant]);

  const valor = useMemo(
    () => ({ restaurantes, tenant, tenantId, trocarTenant, recarregar, carregando }),
    [restaurantes, tenant, tenantId, trocarTenant, recarregar, carregando]
  );

  const abas = [
    { href: '/', rotulo: 'Disparar' },
    { href: '/pedidos', rotulo: 'Pedidos' },
    { href: '/setup', rotulo: 'Restaurante' },
  ];

  return (
    <TenantContext.Provider value={valor}>
      <div className="app">
        <header className="topo">
          <div className="topo-marca">
            {tenant?.logo_url ? <img src={tenant.logo_url} alt="" /> : (tenant?.persona_emoji || '🍽️')}
          </div>
          <div>
            <div className="topo-nome">{tenant?.nome || 'Agente Demo'}</div>
            <div className="topo-sub">
              {tenant ? `${tenant.persona_nome} atendendo` : 'Nenhum restaurante configurado'}
            </div>
          </div>
        </header>

        {children}
      </div>

      <nav className="nav">
        {abas.map((a) => (
          <Link key={a.href} href={a.href} className={caminho === a.href ? 'ativo' : ''}>
            {a.rotulo}
          </Link>
        ))}
      </nav>
    </TenantContext.Provider>
  );
}
