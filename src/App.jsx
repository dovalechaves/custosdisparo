import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';

const API = ''; // proxy do Vite roteia /api/* para localhost:3001

// ─── Mapeamento Loja / Vendedor ───────────────────────────────────────────
function extractGroup(templateName) {
  const n = templateName.toLowerCase();

  // Vendedores
  if (n.includes('jessica')) return { loja: '—', vendedor: 'Jessica' };
  if (n.includes('haroldo')) return { loja: '—', vendedor: 'Haroldo' };

  // Lojas
  if (n.includes('santana'))                                   return { loja: 'Santana', vendedor: '—' };
  if (n.includes('riopreto') || n.includes('rio_preto'))       return { loja: 'Rio Preto', vendedor: '—' };
  if (n.startsWith('poa') || n.includes('portoalegre'))        return { loja: 'Porto Alegre', vendedor: '—' };
  if (n.includes('fortaleza'))                                 return { loja: 'Fortaleza', vendedor: '—' };
  if (n.startsWith('rj') || n.includes('riodejaneiro'))        return { loja: 'Rio de Janeiro', vendedor: '—' };
  if (n.startsWith('bh') || n.includes('belohorizonte'))       return { loja: 'Belo Horizonte', vendedor: '—' };
  if (n.includes('campinas'))                                  return { loja: 'Campinas', vendedor: '—' };
  if (n.includes('ecomerce') || n.includes('ecommerce'))       return { loja: 'E-commerce', vendedor: '—' };

  // Fallback
  return { loja: 'Matriz', vendedor: '—' };
}

const ALL_LOJAS = ['Santana', 'Rio Preto', 'Porto Alegre', 'Fortaleza', 'Rio de Janeiro', 'Belo Horizonte', 'Campinas', 'E-commerce', 'Matriz'];
const ALL_VENDEDORES = ['Jessica', 'Haroldo'];

// ─── Utils ────────────────────────────────────────────────────────────────
function fmtUSD(val) {
  if (val == null) return '–';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
}
function fmtBRL(val) {
  if (val == null) return '–';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
}
function fmtNum(val) {
  if (val == null) return '–';
  return new Intl.NumberFormat('pt-BR').format(val);
}

function statusBadge(status) {
  const map = { APPROVED: 'badge-green', REJECTED: 'badge-red', PENDING: 'badge-yellow', PAUSED: 'badge-purple', DISABLED: 'badge-gray' };
  return <span className={`badge ${map[status] || 'badge-gray'}`}>{status}</span>;
}
function categoryBadge(cat) {
  const map = { MARKETING: 'badge-purple', UTILITY: 'badge-blue', AUTHENTICATION: 'badge-yellow' };
  return <span className={`badge ${map[cat] || 'badge-gray'}`}>{cat}</span>;
}

// ─── Header ───────────────────────────────────────────────────────────────
function Header({ usdRate }) {
  return (
    <header className="header">
      <div className="header-logo">
        <img src="/icon.jpg" alt="Dovale" style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #1e3a8a' }} />
        <div>
          <div className="header-title">CustoDisparo Dovale</div>
          <div className="header-subtitle">Análise de custos · WhatsApp Business API</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        {usdRate && (
          <div className="header-rate">
            <span className="header-rate-label">USD/BRL</span>
            <span className="header-rate-value">R$ {usdRate.toFixed(4)}</span>
          </div>
        )}
        <div className="header-rate">
          <span className="header-rate-label">📞</span>
          <code style={{ fontSize: '11px', color: '#94a3b8' }}>880579608482362</code>
        </div>
      </div>
    </header>
  );
}

// ─── Summary Cards ─────────────────────────────────────────────────────────
function SummaryCards({ data, usdRate }) {
  const totalUSD = data.reduce((s, r) => s + (r.cost || 0), 0);
  const totalBRL = usdRate ? totalUSD * usdRate : null;
  const totalSent = data.reduce((s, r) => s + (r.sent || 0), 0);
  const totalDel = data.reduce((s, r) => s + (r.delivered || 0), 0);
  const totalRead = data.reduce((s, r) => s + (r.read || 0), 0);
  const avgCost = data.length ? totalUSD / data.length : 0;

  return (
    <div className="summary-grid animate-in">
      <div className="summary-card">
        <div className="summary-icon">💵</div>
        <div className="summary-label">Custo Total</div>
        <div className="summary-value" style={{ color: '#60a5fa' }}>{totalBRL != null ? fmtBRL(totalBRL) : '–'}</div>
        <div className="summary-sub">{fmtUSD(totalUSD)} USD</div>
      </div>
      <div className="summary-card green">
        <div className="summary-icon">📤</div>
        <div className="summary-label">Mensagens Enviadas</div>
        <div className="summary-value" style={{ color: '#4ade80' }}>{fmtNum(totalSent)}</div>
        <div className="summary-sub">total no período</div>
      </div>
      <div className="summary-card yellow">
        <div className="summary-icon">✅</div>
        <div className="summary-label">Entregues</div>
        <div className="summary-value" style={{ color: '#fbbf24' }}>{fmtNum(totalDel)}</div>
        {totalSent > 0 && <div className="summary-sub">{((totalDel / totalSent) * 100).toFixed(1)}% de entrega</div>}
      </div>
      <div className="summary-card purple">
        <div className="summary-icon">👀</div>
        <div className="summary-label">Lidas</div>
        <div className="summary-value" style={{ color: '#a78bfa' }}>{fmtNum(totalRead)}</div>
        {totalSent > 0 && <div className="summary-sub">{((totalRead / totalSent) * 100).toFixed(1)}% de leitura</div>}
      </div>
      <div className="summary-card cyan">
        <div className="summary-icon">📊</div>
        <div className="summary-label">Custo Médio / Template</div>
        <div className="summary-value" style={{ color: '#22d3ee', fontSize: '22px' }}>{usdRate ? fmtBRL(avgCost * usdRate) : fmtUSD(avgCost)}</div>
        <div className="summary-sub">{fmtUSD(avgCost)} USD · {data.length} templates</div>
      </div>
    </div>
  );
}

// ─── Helpers de mês ────────────────────────────────────────────────────────
const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];
function monthRange(year, month) {
  // month: 1-12. Retorna { since: 'YYYY-MM-DD', until: 'YYYY-MM-DD' }
  const since = dayjs(`${year}-${String(month).padStart(2, '0')}-01`);
  const until = since.endOf('month');
  return { since: since.format('YYYY-MM-DD'), until: until.format('YYYY-MM-DD') };
}

// ─── Filter Panel ──────────────────────────────────────────────────────────
function FilterPanel({ filters, setFilters, onSearch, loading }) {
  const categories = ['', 'MARKETING', 'UTILITY', 'AUTHENTICATION'];
  const statuses = ['', 'APPROVED', 'REJECTED', 'PENDING', 'PAUSED', 'DISABLED'];

  const currentYear = dayjs().year();
  const years = Array.from({ length: 4 }, (_, i) => currentYear - i);

  const handleMonthChange = (field, value) => {
    const newFilters = { ...filters, [field]: value };
    const { since, until } = monthRange(newFilters.year, newFilters.month);
    setFilters(f => ({ ...f, [field]: value, since, until }));
  };

  return (
    <div className="filter-panel animate-in" style={{ animationDelay: '0.1s' }}>
      <div className="filter-panel-header">
        <div className="filter-panel-title">🔍 Filtros</div>
        <div style={{ fontSize: '12px', color: '#64748b' }}>
          📅 {filters.since} → {filters.until}
        </div>
      </div>
      <div className="filter-row">
        <div className="filter-group">
          <label className="filter-label">Mês</label>
          <select
            id="filter-month"
            className="filter-select"
            value={filters.month}
            onChange={e => handleMonthChange('month', Number(e.target.value))}
          >
            {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label">Ano</label>
          <select
            id="filter-year"
            className="filter-select"
            value={filters.year}
            onChange={e => handleMonthChange('year', Number(e.target.value))}
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label">Loja</label>
          <select
            id="filter-loja"
            className="filter-select"
            value={filters.loja}
            onChange={e => setFilters(f => ({ ...f, loja: e.target.value, vendedor: '' }))}
          >
            <option value="">Todas</option>
            {ALL_LOJAS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label">Vendedor</label>
          <select
            id="filter-vendedor"
            className="filter-select"
            value={filters.vendedor}
            onChange={e => setFilters(f => ({ ...f, vendedor: e.target.value, loja: '' }))}
          >
            <option value="">Todos</option>
            {ALL_VENDEDORES.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label">Categoria</label>
          <select
            id="filter-category"
            className="filter-select"
            value={filters.category}
            onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}
          >
            {categories.map(c => <option key={c} value={c}>{c || 'Todas'}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label">Status</label>
          <select
            id="filter-status"
            className="filter-select"
            value={filters.status}
            onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
          >
            {statuses.map(s => <option key={s} value={s}>{s || 'Todos'}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label className="filter-label">Nome Template</label>
          <input
            id="filter-name"
            type="text"
            className="filter-input"
            placeholder="Buscar..."
            value={filters.name}
            onChange={e => setFilters(f => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="filter-group" style={{ justifyContent: 'flex-end' }}>
          <label className="filter-label"> </label>
          <button
            id="btn-search"
            className="btn btn-primary"
            onClick={onSearch}
            disabled={loading}
          >
            {loading ? '⏳ Buscando...' : '🔄 Buscar Dados'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Table ─────────────────────────────────────────────────────────────────
const PAGE_SIZE = 25;

function DataTable({ rows, usdRate, templates }) {
  const [sortKey, setSortKey] = useState('cost');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
    setPage(0);
  };

  const sorted = [...rows].sort((a, b) => {
    let av = a[sortKey] ?? 0, bv = b[sortKey] ?? 0;
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  });

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const SortIcon = ({ k }) => sortKey === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅';

  // Mapa de template info por nome
  const tplMap = {};
  (templates || []).forEach(t => { tplMap[t.name] = t; });

  return (
    <div className="table-wrapper animate-in" style={{ animationDelay: '0.2s' }}>
      <div className="table-header-bar">
        <h2>📋 Custo por Template</h2>
        <span className="table-count">{rows.length} template(s)</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th className={sortKey === 'templateName' ? 'sorted' : ''} onClick={() => toggleSort('templateName')}>Template<SortIcon k="templateName" /></th>
              <th className={sortKey === 'loja' ? 'sorted' : ''} onClick={() => toggleSort('loja')}>Loja<SortIcon k="loja" /></th>
              <th className={sortKey === 'vendedor' ? 'sorted' : ''} onClick={() => toggleSort('vendedor')}>Vendedor<SortIcon k="vendedor" /></th>
              <th>Categoria</th>
              <th>Status</th>
              <th className={sortKey === 'sent' ? 'sorted' : ''} onClick={() => toggleSort('sent')}>Enviados<SortIcon k="sent" /></th>
              <th className={sortKey === 'delivered' ? 'sorted' : ''} onClick={() => toggleSort('delivered')}>Entregues<SortIcon k="delivered" /></th>
              <th className={sortKey === 'read' ? 'sorted' : ''} onClick={() => toggleSort('read')}>Lidas<SortIcon k="read" /></th>
              <th className={sortKey === 'cost' ? 'sorted' : ''} onClick={() => toggleSort('cost')}>Custo (USD)<SortIcon k="cost" /></th>
              <th>Custo (BRL)</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr><td colSpan={10}>
                <div className="empty-state">
                  <div className="empty-state-icon">📭</div>
                  <div>Nenhum dado encontrado. Ajuste os filtros e clique em <strong>Buscar Dados</strong>.</div>
                </div>
              </td></tr>
            )}
            {pageRows.map((row, i) => {
              const tpl = tplMap[row.templateName] || {};
              return (
                <tr key={row.templateName + i}>
                  <td className="td-name" title={row.templateName}>{row.templateName}</td>
                  <td style={{ color: '#38bdf8', fontWeight: 500 }}>{row.loja}</td>
                  <td style={{ color: '#fb923c', fontWeight: 500 }}>{row.vendedor}</td>
                  <td>{categoryBadge(tpl.category || row.category || '–')}</td>
                  <td>{statusBadge(tpl.status || '–')}</td>
                  <td style={{ color: '#60a5fa' }}>{fmtNum(row.sent)}</td>
                  <td style={{ color: '#4ade80' }}>{fmtNum(row.delivered)}</td>
                  <td style={{ color: '#a78bfa' }}>{fmtNum(row.read)}</td>
                  <td style={{ color: '#fbbf24', fontWeight: 600 }}>{fmtUSD(row.cost)}</td>
                  <td style={{ color: '#22d3ee' }}>{usdRate && row.cost ? fmtBRL(row.cost * usdRate) : '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="pagination">
          <span>Página {page + 1} de {totalPages}</span>
          <div className="pagination-controls">
            <button className="pagination-btn" onClick={() => setPage(0)} disabled={page === 0}>«</button>
            <button className="pagination-btn" onClick={() => setPage(p => p - 1)} disabled={page === 0}>‹</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
              const p = Math.max(0, Math.min(totalPages - 5, page - 2)) + idx;
              return <button key={p} className={`pagination-btn ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>{p + 1}</button>;
            })}
            <button className="pagination-btn" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>›</button>
            <button className="pagination-btn" onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}>»</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Visão Agrupada por Loja / Vendedor ────────────────────────────────────
function GroupedView({ rows, usdRate }) {
  // Agrupa por loja
  const byLoja = {};
  for (const r of rows) {
    const key = r.vendedor !== '—' ? `Vendedor: ${r.vendedor}` : r.loja;
    if (!byLoja[key]) byLoja[key] = { label: key, sent: 0, delivered: 0, read: 0, cost: 0, templates: 0 };
    byLoja[key].sent += r.sent || 0;
    byLoja[key].delivered += r.delivered || 0;
    byLoja[key].read += r.read || 0;
    byLoja[key].cost += r.cost || 0;
    byLoja[key].templates += 1;
  }

  const grouped = Object.values(byLoja).sort((a, b) => b.cost - a.cost);

  if (grouped.length === 0) return (
    <div className="table-wrapper animate-in">
      <div className="empty-state"><div className="empty-state-icon">📭</div><div>Nenhum dado. Ajuste os filtros e clique em <strong>Buscar Dados</strong>.</div></div>
    </div>
  );

  return (
    <div className="table-wrapper animate-in" style={{ animationDelay: '0.2s' }}>
      <div className="table-header-bar">
        <h2>🏪 Custo por Loja / Vendedor</h2>
        <span className="table-count">{grouped.length} grupo(s)</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Loja / Vendedor</th>
              <th>Templates</th>
              <th>Enviados</th>
              <th>Entregues</th>
              <th>Lidas</th>
              <th>Custo Total (USD)</th>
              <th>Custo Total (BRL)</th>
              <th>% do Total</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((g, i) => {
              const totalUSD = rows.reduce((s, r) => s + (r.cost || 0), 0);
              const pct = totalUSD > 0 ? ((g.cost / totalUSD) * 100).toFixed(1) : '0.0';
              const isVendedor = g.label.startsWith('Vendedor:');
              return (
                <tr key={i}>
                  <td style={{ fontWeight: 600, color: isVendedor ? '#fb923c' : '#38bdf8' }}>{g.label}</td>
                  <td style={{ color: '#94a3b8' }}>{g.templates}</td>
                  <td style={{ color: '#60a5fa' }}>{fmtNum(g.sent)}</td>
                  <td style={{ color: '#4ade80' }}>{fmtNum(g.delivered)}</td>
                  <td style={{ color: '#a78bfa' }}>{fmtNum(g.read)}</td>
                  <td style={{ color: '#fbbf24', fontWeight: 700 }}>{fmtUSD(g.cost)}</td>
                  <td style={{ color: '#22d3ee' }}>{usdRate ? fmtBRL(g.cost * usdRate) : '–'}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ background: '#1e293b', borderRadius: '4px', height: '8px', width: '80px', overflow: 'hidden' }}>
                        <div style={{ background: isVendedor ? '#fb923c' : '#38bdf8', width: `${pct}%`, height: '100%', borderRadius: '4px' }} />
                      </div>
                      <span style={{ color: '#94a3b8', fontSize: '12px' }}>{pct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Excel Export ──────────────────────────────────────────────────────────
function exportToExcel(rows, templates, usdRate, filters) {
  const tplMap = {};
  (templates || []).forEach(t => { tplMap[t.name] = t; });

  const wsData = rows.map(row => {
    const tpl = tplMap[row.templateName] || {};
    return {
      'Loja': row.loja,
      'Vendedor': row.vendedor,
      'Template': row.templateName,
      'Categoria': tpl.category || row.category || '',
      'Status': tpl.status || '',
      'Idioma': tpl.language || '',
      'Enviadas': row.sent || 0,
      'Entregues': row.delivered || 0,
      'Lidas': row.read || 0,
      'Custo (USD)': row.cost || 0,
      'Custo (BRL)': usdRate && row.cost ? +(row.cost * usdRate).toFixed(4) : '',
      'Taxa USD/BRL': usdRate || '',
    };
  });

  // Ordena por Loja, depois Vendedor, depois Template
  wsData.sort((a, b) => {
    if (a['Loja'] < b['Loja']) return -1;
    if (a['Loja'] > b['Loja']) return 1;
    if (a['Vendedor'] < b['Vendedor']) return -1;
    if (a['Vendedor'] > b['Vendedor']) return 1;
    return 0;
  });

  const ws = XLSX.utils.json_to_sheet(wsData);
  ws['!cols'] = [
    { wch: 15 }, { wch: 12 }, { wch: 35 }, { wch: 15 }, { wch: 12 }, { wch: 8 },
    { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
  ];

  // Aba agrupada por loja
  const byLoja = {};
  for (const r of rows) {
    const key = r.vendedor !== '—' ? `Vendedor: ${r.vendedor}` : r.loja;
    if (!byLoja[key]) byLoja[key] = { sent: 0, delivered: 0, read: 0, cost: 0, templates: 0 };
    byLoja[key].sent += r.sent || 0;
    byLoja[key].delivered += r.delivered || 0;
    byLoja[key].read += r.read || 0;
    byLoja[key].cost += r.cost || 0;
    byLoja[key].templates += 1;
  }
  const totalUSD = rows.reduce((s, r) => s + (r.cost || 0), 0);
  const wsGrouped = XLSX.utils.json_to_sheet(
    Object.entries(byLoja).sort((a, b) => b[1].cost - a[1].cost).map(([label, g]) => ({
      'Loja / Vendedor': label,
      'Templates': g.templates,
      'Enviadas': g.sent,
      'Entregues': g.delivered,
      'Lidas': g.read,
      'Custo Total (USD)': +g.cost.toFixed(6),
      'Custo Total (BRL)': usdRate ? +(g.cost * usdRate).toFixed(4) : '',
      '% do Total': totalUSD > 0 ? +((g.cost / totalUSD) * 100).toFixed(2) : 0,
    }))
  );
  wsGrouped['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 12 }];

  // Aba de resumo
  const wsSummary = XLSX.utils.json_to_sheet([
    { 'Métrica': 'Período', 'Valor': `${filters.since} até ${filters.until}` },
    { 'Métrica': 'Filtro Loja', 'Valor': filters.loja || 'Todas' },
    { 'Métrica': 'Filtro Vendedor', 'Valor': filters.vendedor || 'Todos' },
    { 'Métrica': 'Total Enviadas', 'Valor': rows.reduce((s, r) => s + (r.sent || 0), 0) },
    { 'Métrica': 'Total Entregues', 'Valor': rows.reduce((s, r) => s + (r.delivered || 0), 0) },
    { 'Métrica': 'Total Lidas', 'Valor': rows.reduce((s, r) => s + (r.read || 0), 0) },
    { 'Métrica': 'Custo Total (USD)', 'Valor': totalUSD },
    { 'Métrica': 'Custo Total (BRL)', 'Valor': usdRate ? totalUSD * usdRate : 'N/A' },
    { 'Métrica': 'Taxa USD/BRL', 'Valor': usdRate || 'N/A' },
    { 'Métrica': 'Templates com dados', 'Valor': rows.length },
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Por Template');
  XLSX.utils.book_append_sheet(wb, wsGrouped, 'Por Loja');
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo');

  const lojaTag = filters.loja ? `_${filters.loja.replace(/ /g, '')}` : '';
  const vendTag = filters.vendedor ? `_${filters.vendedor}` : '';
  const fname = `custo_disparos_${filters.since}_${filters.until}${lojaTag}${vendTag}.xlsx`;
  XLSX.writeFile(wb, fname);
}

// ─── Conversation Analytics Tab ─────────────────────────────────────────────
function ConversationTab({ data, usdRate }) {
  if (!data || data.length === 0) return (
    <div className="table-wrapper animate-in">
      <div className="empty-state"><div className="empty-state-icon">📭</div><div>Nenhum dado de conversa. Ajuste os filtros e clique em <strong>Buscar Dados</strong>.</div></div>
    </div>
  );

  return (
    <div className="table-wrapper animate-in" style={{ animationDelay: '0.2s' }}>
      <div className="table-header-bar">
        <h2>💬 Custo por Tipo de Conversa</h2>
        <span className="table-count">{data.length} linha(s)</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo Conversa</th>
              <th>Direção</th>
              <th>Qtd</th>
              <th>Custo (USD)</th>
              <th>Custo (BRL)</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={i}>
                <td>{r.date}</td>
                <td>{r.conversationType}</td>
                <td>{r.direction}</td>
                <td style={{ color: '#60a5fa' }}>{fmtNum(r.count)}</td>
                <td style={{ color: '#fbbf24', fontWeight: 600 }}>{fmtUSD(r.cost)}</td>
                <td style={{ color: '#22d3ee' }}>{usdRate && r.cost ? fmtBRL(r.cost * usdRate) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────
export default function App() {
  const now = dayjs();
  const initRange = monthRange(now.year(), now.month() + 1);

  const [usdRate, setUsdRate] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [tplAnalytics, setTplAnalytics] = useState([]);
  const [convAnalytics, setConvAnalytics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('templates');

  const [filters, setFilters] = useState({
    month: now.month() + 1,  // 1-12
    year: now.year(),
    since: initRange.since,
    until: initRange.until,
    category: '',
    status: '',
    name: '',
    loja: '',
    vendedor: '',
  });

  // Carrega USD/BRL ao montar
  useEffect(() => {
    axios.get(`${API}/api/usd-brl`)
      .then(r => setUsdRate(r.data.rate))
      .catch(() => { });
  }, []);

  // Carrega templates ao montar
  useEffect(() => {
    axios.get(`${API}/api/templates`)
      .then(r => setTemplates(r.data.data || []))
      .catch(() => { });
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tplRes, convRes] = await Promise.all([
        axios.get(`${API}/api/template-analytics`, { params: { since: filters.since, until: filters.until } }),
        axios.get(`${API}/api/conversation-analytics`, { params: { since: filters.since, until: filters.until } }),
      ]);

      // Processa template analytics
      const rawTpl = tplRes.data?.data || [];
      const tplRows = parseTplAnalytics(rawTpl);
      setTplAnalytics(tplRows);

      // Processa conversation analytics
      const rawConv = convRes.data?.data?.data_points || convRes.data?.data || [];
      const convRows = parseConvAnalytics(rawConv);
      setConvAnalytics(convRows);

    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [filters.since, filters.until]);

  // Aplica filtros nos dados de template
  const filteredTpl = tplAnalytics
    .map(r => ({ ...r, ...extractGroup(r.templateName) }))
    .filter(r => {
      const tpl = templates.find(t => t.name === r.templateName) || {};
      if (filters.category && tpl.category !== filters.category) return false;
      if (filters.status && tpl.status !== filters.status) return false;
      if (filters.name && !r.templateName.toLowerCase().includes(filters.name.toLowerCase())) return false;
      if (filters.loja && r.loja !== filters.loja) return false;
      if (filters.vendedor && r.vendedor !== filters.vendedor) return false;
      return true;
    });

  return (
    <>
      <Header usdRate={usdRate} />
      <main className="main">
        {error && <div className="error-box">⚠️ <strong>Erro da API:</strong> {error}</div>}

        <SummaryCards data={filteredTpl} usdRate={usdRate} />

        <FilterPanel
          filters={filters}
          setFilters={setFilters}
          onSearch={fetchData}
          loading={loading}
        />

        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="tabs" style={{ marginBottom: 0 }}>
            <button className={`tab ${tab === 'templates' ? 'active' : ''}`} onClick={() => setTab('templates')}>📋 Por Template</button>
            <button className={`tab ${tab === 'grouped' ? 'active' : ''}`} onClick={() => setTab('grouped')}>🏪 Por Loja/Vendedor</button>
            <button className={`tab ${tab === 'conversations' ? 'active' : ''}`} onClick={() => setTab('conversations')}>💬 Por Conversa</button>
          </div>
          <button
            id="btn-export"
            className="btn btn-success"
            onClick={() => exportToExcel(filteredTpl, templates, usdRate, filters)}
            disabled={filteredTpl.length === 0}
          >
            📥 Exportar Excel
          </button>
        </div>

        {loading && (
          <div className="loading">
            <div className="spinner" />
            <div className="loading-text">Consultando API da Meta...</div>
          </div>
        )}

        {!loading && tab === 'templates' && (
          <DataTable rows={filteredTpl} usdRate={usdRate} templates={templates} />
        )}
        {!loading && tab === 'grouped' && (
          <GroupedView rows={filteredTpl} usdRate={usdRate} />
        )}
        {!loading && tab === 'conversations' && (
          <ConversationTab data={convAnalytics} usdRate={usdRate} />
        )}
      </main>
    </>
  );
}

// ─── Parsers ───────────────────────────────────────────────────────────────
function parseTplAnalytics(raw) {
  // Backend já retorna dados agregados: { templateId, templateName, sent, delivered, read, cost }
  return raw.map(item => ({
    templateName: item.templateName || item.templateId || 'Desconhecido',
    sent: item.sent || 0,
    delivered: item.delivered || 0,
    read: item.read || 0,
    cost: item.cost || 0,
  }));
}

function parseConvAnalytics(raw) {
  const rows = [];
  for (const dp of raw) {
    rows.push({
      date: dp.start ? dayjs.unix(dp.start).format('DD/MM/YYYY') : (dp.date || '–'),
      conversationType: dp.conversation_type || dp.conversationType || '–',
      direction: dp.conversation_direction || dp.direction || '–',
      count: dp.conversation_count ?? dp.count ?? 0,
      cost: dp.cost ?? 0,
    });
  }
  return rows;
}
