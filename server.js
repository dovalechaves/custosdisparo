import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
app.use(cors());
app.use(express.json());

const META_TOKEN = 'EAA9L0ZBKhUj0BQvpSsI3YoZBZB7sedh8P9PXOcwqz21qKcUrK9NpUPNJQ82JtXKqXSa62fGTwnRrCnNRYDOBV5l7YjZC9mXMj1hZBn3ktFnfBZB5wBkLFWleNGnkrIJuHiLUMhks6ZA5EEd0PXGxfJy0k25CQMSX8BPoDnIbCea00PDteAot9mC023bpmnWUwZDZD';
const BUSINESS_ACCOUNT_ID = '1480922856932125';
const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Cache dos phone IDs da conta (carregado dinamicamente)
let _cachedPhoneIds = null;
async function getAllPhoneIds() {
  if (_cachedPhoneIds) return _cachedPhoneIds;
  const res = await fetch(`${GRAPH_BASE}/${BUSINESS_ACCOUNT_ID}/phone_numbers?fields=id&access_token=${META_TOKEN}`);
  const data = await res.json();
  _cachedPhoneIds = (data.data || []).map(p => p.id);
  console.log(`[phones] IDs encontrados: ${_cachedPhoneIds.join(', ')}`);
  return _cachedPhoneIds;
}

// Auxiliar: converte YYYY-MM-DD para Unix Timestamp (seconds)
const toUnix = (dateStr) => Math.floor(new Date(dateStr).getTime() / 1000);

// GET /api/usd-brl — cotação dólar via AwesomeAPI
app.get('/api/usd-brl', async (req, res) => {
  try {
    const r = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
    const data = await r.json();
    const rate = parseFloat(data.USDBRL.bid);
    res.json({ rate });
  } catch (err) {
    console.error('[usd-brl]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/templates — lista templates do WABA
app.get('/api/templates', async (req, res) => {
  try {
    const url = `${GRAPH_BASE}/${BUSINESS_ACCOUNT_ID}/message_templates?fields=id,name,status,category,language,components&limit=500&access_token=${META_TOKEN}`;
    const r = await fetch(url);
    const data = await r.json();
    if (data.error) return res.status(400).json({ error: data.error });
    res.json(data);
  } catch (err) {
    console.error('[templates]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/template-analytics — analytics por template com batching
app.get('/api/template-analytics', async (req, res) => {
  try {
    const { since, until } = req.query;
    const startTs = toUnix(since);
    const endTs = toUnix(until);

    // 1) Buscar TODOS os templates com paginação (id + name)
    let tplUrl = `${GRAPH_BASE}/${BUSINESS_ACCOUNT_ID}/message_templates?fields=id,name&limit=200&access_token=${META_TOKEN}`;
    const allTemplates = [];
    while (tplUrl) {
      const tplRes = await fetch(tplUrl);
      const tplData = await tplRes.json();
      if (tplData.error) return res.status(400).json({ error: tplData.error });
      allTemplates.push(...(tplData.data || []));
      tplUrl = tplData.paging?.next || null;
    }
    if (allTemplates.length === 0) return res.json({ data: [] });

    console.log(`[template-analytics] ${allTemplates.length} templates encontrados`);

    const idToName = {};
    allTemplates.forEach(t => { idToName[t.id] = t.name; });

    const allIds = allTemplates.map(t => t.id);
    
    const agg = {};
    allTemplates.forEach(t => {
      agg[t.id] = { templateId: t.id, templateName: t.name, sent: 0, delivered: 0, read: 0, cost: 0 };
    });

    const CONCURRENCY = 5;

    const processPoints = (points) => {
      for (const pt of points) {
        const tid = pt.template_id;
        if (!tid || !agg[tid]) continue;
        agg[tid].sent += pt.sent || 0;
        agg[tid].delivered += pt.delivered || 0;
        agg[tid].read += pt.read || 0;
        const amountSpent = (Array.isArray(pt.cost) ? pt.cost : [])
          .find(c => c.type === 'amount_spent');
        agg[tid].cost += amountSpent?.value || 0;
      }
    };

    console.log(`[template-analytics] Buscando dados para ${allIds.length} templates individualmente...`);

    for (let i = 0; i < allIds.length; i += CONCURRENCY) {
      const batchIds = allIds.slice(i, i + CONCURRENCY);

      const promises = batchIds.map(async (tid) => {
        const params = new URLSearchParams({
          access_token: META_TOKEN,
          start: startTs, end: endTs,
          granularity: 'DAILY',
          template_ids: JSON.stringify([tid]), // 1 template por chamada
          metric_types: JSON.stringify(["SENT", "DELIVERED", "READ", "COST"]),
        });
        const url = `${GRAPH_BASE}/${BUSINESS_ACCOUNT_ID}/template_analytics?${params}`;
        try {
          const r = await fetch(url);
          const data = await r.json();
          if (data.error) {
            console.error(`[analytics] Erro template ${tid}:`, data.error.message);
            return;
          }
          const pts = (data.data || []).flatMap(item => item.data_points || []);
          processPoints(pts);
        } catch (e) {
          console.error(`[analytics] Falha na rede para template ${tid}:`, e.message);
        }
      });

      await Promise.all(promises);
    }

    console.log(`[template-analytics] Concluído!`);

    res.json({ data: Object.values(agg) });
  } catch (err) {
    console.error('[template-analytics]', err.message);
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/conversation-analytics', async (req, res) => {
  try {
    const { since, until } = req.query;
    const startTs = toUnix(since);
    const endTs = toUnix(until);

    const params = new URLSearchParams({
      access_token: META_TOKEN,
      start: startTs,
      end: endTs,
      granularity: 'DAILY',
      phone_numbers: JSON.stringify(await getAllPhoneIds()),
      conversation_types: '["REGULAR","FREE_TIER","FREE_ENTRY_POINT"]',
      conversation_directions: '["BUSINESS_INITIATED","USER_INITIATED"]',
      dimensions: '["CONVERSATION_TYPE","CONVERSATION_DIRECTION","PHONE"]',
    });

    const url = `${GRAPH_BASE}/${BUSINESS_ACCOUNT_ID}/conversation_analytics?${params.toString()}`;
    const r = await fetch(url);
    const data = await r.json();

    if (data.error) return res.status(400).json({ error: data.error });
    res.json(data);
  } catch (err) {
    console.error('[conversation-analytics]', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = 3001;
app.listen(PORT, '0.0.0.0', () => console.log(`✅ CustoDisparo API running on http://0.0.0.0:${PORT}`));
