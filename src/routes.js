const express = require('express');
const { getAllUsage, getAgentUsage, getCostSummary, getDailyCost } = require('./collector');
const { getDb } = require('./db');

const router = express.Router();

router.get('/usage', async (req, res) => {
  try { res.json({ success: true, data: await getAllUsage() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/usage/:agentId', async (req, res) => {
  try { res.json({ success: true, data: await getAgentUsage(req.params.agentId) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/cost/summary', async (req, res) => {
  try { res.json({ success: true, data: await getCostSummary() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/cost/daily', async (req, res) => {
  try { res.json({ success: true, data: await getDailyCost(parseInt(req.query.days) || 30) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/rates', async (req, res) => {
  try {
    const { rows } = await getDb().query('SELECT * FROM rates ORDER BY model');
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.put('/rates', async (req, res) => {
  try {
    const { rates } = req.body;
    if (!Array.isArray(rates)) return res.status(400).json({ success: false, error: 'rates must be array' });
    const pool = getDb();
    for (const r of rates) {
      if (!r.model) continue;
      await pool.query(
        `UPDATE rates SET input_rate=$1, output_rate=$2, cache_read_rate=$3, cache_write_rate=$4, updated_at=EXTRACT(EPOCH FROM NOW()) WHERE model=$5`,
        [r.input_rate || 0, r.output_rate || 0, r.cache_read_rate || 0, r.cache_write_rate || 0, r.model]
      );
    }
    const { rows } = await pool.query('SELECT * FROM rates ORDER BY model');
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
