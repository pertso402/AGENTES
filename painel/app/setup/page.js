'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTenant } from '../moldura';
import { fmtBRL } from '../../lib/formato';

const NICHOS = [
  { slug: 'template-pizzaria',     rotulo: 'Pizzaria' },
  { slug: 'template-hamburgueria', rotulo: 'Hamburgueria' },
  { slug: 'template-marmitaria',   rotulo: 'Marmitaria' },
  { slug: 'template-acai',         rotulo: 'Açaiteria' },
  { slug: 'template-sushi',        rotulo: 'Japonesa / Sushi' },
  { slug: 'template-doceria',      rotulo: 'Doceria / Padaria' },
];

export default function Setup() {
  const { restaurantes, tenant, tenantId, trocarTenant, recarregar } = useTenant();
  const [criando, setCriando] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [nicho, setNicho] = useState(NICHOS[0].slug);
  const [erro, setErro] = useState(null);
  const [ok, setOk] = useState(null);

  const leads = restaurantes.filter((r) => !r.template);

  async function criar() {
    if (!novoNome.trim()) return setErro('Digite o nome do restaurante do lead.');
    setCriando(true);
    setErro(null);
    try {
      const res = await fetch('/api/restaurantes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateSlug: nicho, nome: novoNome.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      await recarregar();
      trocarTenant(data.restaurante.id);
      setNovoNome('');
      setOk(`${data.restaurante.nome} criado com o cardápio do nicho. Ajuste o que quiser abaixo.`);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCriando(false);
    }
  }

  async function acao(tipo) {
    const textos = {
      resetar: 'Apagar pedidos, conversas e cupons deste restaurante? O cardápio e a configuração ficam.',
      excluir: 'Excluir este restaurante e tudo dele? Não dá pra desfazer.',
    };
    if (!window.confirm(textos[tipo])) return;

    setErro(null);
    try {
      if (tipo === 'resetar') {
        const res = await fetch('/api/restaurantes', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: tenantId, acao: 'resetar' }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        setOk('Demo zerada. Pode disparar de novo.');
      } else {
        const res = await fetch(`/api/restaurantes?id=${tenantId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error((await res.json()).error);
        trocarTenant(null);
        setOk('Restaurante excluído.');
      }
      await recarregar();
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <>
      {erro && <div className="aviso aviso-erro">{erro}</div>}
      {ok && <div className="aviso aviso-ok">{ok}</div>}

      <div className="card">
        <p className="titulo">Novo lead</p>
        <div className="campo">
          <label htmlFor="nome-novo">Nome do restaurante</label>
          <input
            id="nome-novo"
            placeholder="Pizzaria do Léo"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
          />
        </div>
        <div className="campo">
          <label htmlFor="nicho">Nicho</label>
          <select id="nicho" value={nicho} onChange={(e) => setNicho(e.target.value)}>
            {NICHOS.map((n) => <option key={n.slug} value={n.slug}>{n.rotulo}</option>)}
          </select>
        </div>
        <button className="btn" onClick={criar} disabled={criando}>
          {criando ? 'Criando...' : 'Criar com cardápio pronto'}
        </button>
      </div>

      {leads.length > 1 && (
        <div className="card">
          <p className="titulo">Trocar de lead</p>
          <select value={tenantId || ''} onChange={(e) => trocarTenant(e.target.value)}>
            {leads.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
        </div>
      )}

      {tenant && (
        <>
          <FormRestaurante tenant={tenant} onSalvo={recarregar} />
          <Cardapio tenant={tenant} />

          <div className="card">
            <p className="titulo">Zona de risco</p>
            <div className="acoes">
              <button className="btn btn-secundario" onClick={() => acao('resetar')}>Zerar a demo</button>
              <button className="btn btn-perigo btn-pequeno" onClick={() => acao('excluir')}>Excluir</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ─── Configuração do restaurante ─────────────────────────────────────────────

const CAMPOS = [
  { k: 'nome',              rotulo: 'Nome' },
  { k: 'persona_nome',      rotulo: 'Nome do atendente virtual' },
  { k: 'persona_emoji',     rotulo: 'Emoji da marca' },
  { k: 'descricao_negocio', rotulo: 'Como o negócio se descreve (entra na conversa do agente)', area: true },
  { k: 'horario_texto',     rotulo: 'Horário de funcionamento' },
  { k: 'endereco',          rotulo: 'Endereço' },
  { k: 'chave_pix',         rotulo: 'Chave PIX' },
  { k: 'pix_titular',       rotulo: 'Titular do PIX' },
];

function FormRestaurante({ tenant, onSalvo }) {
  const [form, setForm] = useState(tenant);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => { setForm(tenant); setSalvo(false); }, [tenant]);

  function mudar(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
    setSalvo(false);
  }

  async function salvar() {
    setSalvando(true);
    try {
      await fetch('/api/restaurantes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tenant.id, campos: form }),
      });
      await onSalvo();
      setSalvo(true);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="card">
      <p className="titulo">Identidade e regras</p>

      {CAMPOS.map(({ k, rotulo, area }) => (
        <div className="campo" key={k}>
          <label htmlFor={k}>{rotulo}</label>
          {area ? (
            <textarea id={k} value={form[k] || ''} onChange={(e) => mudar(k, e.target.value)} />
          ) : (
            <input id={k} value={form[k] || ''} onChange={(e) => mudar(k, e.target.value)} />
          )}
        </div>
      ))}

      <div className="linha">
        <div className="campo">
          <label htmlFor="cor">Cor da marca</label>
          <input id="cor" type="color" value={form.cor_primaria || '#e11d48'} onChange={(e) => mudar('cor_primaria', e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="taxa">Taxa de entrega</label>
          <input id="taxa" type="number" step="0.5" value={form.taxa_entrega ?? 0} onChange={(e) => mudar('taxa_entrega', Number(e.target.value))} />
        </div>
        <div className="campo">
          <label htmlFor="desc">Desconto %</label>
          <input id="desc" type="number" value={form.desconto_padrao ?? 15} onChange={(e) => mudar('desconto_padrao', Number(e.target.value))} />
        </div>
      </div>

      <button className="btn btn-secundario" onClick={salvar} disabled={salvando}>
        {salvando ? 'Salvando...' : salvo ? 'Salvo ✓' : 'Salvar'}
      </button>
    </div>
  );
}

// ─── Cardápio ────────────────────────────────────────────────────────────────

function Cardapio({ tenant }) {
  const [produtos, setProdutos] = useState([]);
  const [editando, setEditando] = useState(null);

  const carregar = useCallback(async () => {
    const res = await fetch(`/api/produtos?restauranteId=${tenant.id}`);
    const data = await res.json();
    setProdutos(data.produtos || []);
  }, [tenant.id]);

  useEffect(() => { carregar(); }, [carregar]);

  async function excluir(id) {
    if (!window.confirm('Excluir este produto?')) return;
    await fetch(`/api/produtos?id=${id}`, { method: 'DELETE' });
    carregar();
  }

  if (editando) {
    return (
      <FormProduto
        produto={editando}
        restauranteId={tenant.id}
        onFechar={() => setEditando(null)}
        onSalvo={() => { setEditando(null); carregar(); }}
      />
    );
  }

  return (
    <div className="card">
      <p className="titulo">Cardápio ({produtos.length})</p>

      {produtos.map((p) => (
        <div className="lista-item" key={p.id}>
          <span className={`ponto ${p.disponivel ? 'on' : ''}`} />
          <div className="lista-item-corpo" onClick={() => setEditando(p)} style={{ cursor: 'pointer' }}>
            <div className="lista-item-nome">
              {p.nome} {p.destaque && <span className="chip-destaque">OFERTA</span>}
            </div>
            <div className="lista-item-sub">
              {fmtBRL(p.preco)} · {p.categoria}
              {p.video_url ? ' · 🎬' : p.imagem_url ? ' · 📷' : ''}
            </div>
          </div>
          <button className="btn btn-perigo btn-pequeno" onClick={() => excluir(p.id)}>×</button>
        </div>
      ))}

      <button
        className="btn btn-secundario"
        style={{ marginTop: 12 }}
        onClick={() => setEditando({ restaurante_id: tenant.id, categoria: 'Outros', preco: 0, disponivel: true })}
      >
        + Adicionar produto
      </button>

      <p style={{ fontSize: 12, color: 'var(--texto-fraco)', marginBottom: 0, lineHeight: 1.6 }}>
        O produto marcado como <b>OFERTA</b> é o que vai no disparo — nome, foto e vídeo dele.
      </p>
    </div>
  );
}

function FormProduto({ produto, restauranteId, onFechar, onSalvo }) {
  const [form, setForm] = useState(produto);
  const [salvando, setSalvando] = useState(false);
  const [subindo, setSubindo] = useState(false);
  const [erro, setErro] = useState(null);

  function mudar(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function subirMidia(arquivo) {
    if (!arquivo) return;
    setSubindo(true);
    setErro(null);
    try {
      const dados = new FormData();
      dados.append('arquivo', arquivo);
      dados.append('restauranteId', restauranteId);

      const res = await fetch('/api/upload', { method: 'POST', body: dados });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Um produto tem uma mídia só: a nova substitui a anterior, seja qual for
      // o tipo. Guardar as duas faria o disparo escolher sozinho e você
      // descobriria qual foi só quando o vídeo errado chegasse no celular dele.
      if (data.tipo === 'video') setForm((f) => ({ ...f, video_url: data.url, imagem_url: null }));
      else setForm((f) => ({ ...f, imagem_url: data.url, video_url: null }));
    } catch (e) {
      setErro(e.message);
    } finally {
      setSubindo(false);
    }
  }

  async function salvar() {
    if (!form.nome?.trim()) return setErro('O produto precisa de um nome.');
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch('/api/produtos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, restaurante_id: restauranteId }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      onSalvo();
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  }

  const midia = form.video_url || form.imagem_url;

  return (
    <div className="card">
      <p className="titulo">{form.id ? 'Editar produto' : 'Novo produto'}</p>
      {erro && <div className="aviso aviso-erro">{erro}</div>}

      <div className="campo">
        <label htmlFor="p-nome">Nome</label>
        <input id="p-nome" value={form.nome || ''} onChange={(e) => mudar('nome', e.target.value)} />
      </div>

      <div className="campo">
        <label htmlFor="p-desc">Descrição</label>
        <textarea id="p-desc" value={form.descricao || ''} onChange={(e) => mudar('descricao', e.target.value)} />
      </div>

      <div className="linha">
        <div className="campo">
          <label htmlFor="p-preco">Preço</label>
          <input id="p-preco" type="number" step="0.5" value={form.preco ?? 0} onChange={(e) => mudar('preco', Number(e.target.value))} />
        </div>
        <div className="campo">
          <label htmlFor="p-cat">Categoria</label>
          <input id="p-cat" value={form.categoria || ''} onChange={(e) => mudar('categoria', e.target.value)} />
        </div>
      </div>

      <div className="toggle">
        <input id="p-disp" type="checkbox" checked={form.disponivel !== false} onChange={(e) => mudar('disponivel', e.target.checked)} />
        <span>Disponível</span>
      </div>

      <div className="toggle">
        <input id="p-dest" type="checkbox" checked={Boolean(form.destaque)} onChange={(e) => mudar('destaque', e.target.checked)} />
        <span>É o produto da oferta (vai no disparo)</span>
      </div>

      <div className="campo">
        <label htmlFor="p-midia">Foto ou vídeo {midia && '✓'}</label>
        <input
          id="p-midia"
          type="file"
          accept="image/*,video/*"
          onChange={(e) => subirMidia(e.target.files?.[0])}
          disabled={subindo}
        />
        {subindo && <p style={{ fontSize: 12, color: 'var(--texto-fraco)' }}>Subindo...</p>}
        {midia && (
          <p style={{ fontSize: 12, color: 'var(--texto-fraco)', wordBreak: 'break-all' }}>
            {form.video_url ? '🎬 vídeo' : '📷 foto'} pronto pro disparo
          </p>
        )}
      </div>

      <div className="acoes">
        <button className="btn" onClick={salvar} disabled={salvando || subindo}>
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
        <button className="btn btn-secundario btn-pequeno" onClick={onFechar}>Voltar</button>
      </div>
    </div>
  );
}
