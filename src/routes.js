const express = require('express');
const { getAllUsage, getAgentUsage, getCostSummary, getDailyCost } = require('./collector');
const { getDb } = require('./db');

const router = express.Router();

// GET /api/usage - All agent token usage
router.get('/usage', (req, res) => {
  try {
    const data = getAllUsage();
    res.json({
      success: true,
      data
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/usage/:agentId - Specific agent historical usage
router.get('/usage/:agentId', (req, res) => {
  try {
    const { agentId } = req.params;
    const data = getAgentUsage(agentId);
    res.json({
      success: true,
      data
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/cost/summary - Cost estimation summary
router.get('/cost/summary', (req, res) => {
  try {
    const data = getCostSummary();
    res.json({
      success: true,
      data
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/cost/daily - Daily cost trend
router.get('/cost/daily', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const data = getDailyCost(days);
    res.json({
      success: true,
      data
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/rates - Get rate table
router.get('/rates', (req, res) => {
  try {
    const db = getDb();
    const rates = db.prepare('SELECT * FROM rates ORDER BY model').all();
    res.json({
      success: true,
      data: rates
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/rates - Update rates
router.put('/rates', (req, res) => {
  try {
    const { rates } = req.body;
    if (!Array.isArray(rates)) {
      return res.status(400).json({ success: false, error: 'rates should be an array' });
    }

    const db = getDb();
    const updateRate = db.prepare(`
      UPDATE rates 
      SET input_rate = ?, output_rate = ?, cache_read_rate = ?, cache_write_rate = ?, updated_at = ?
      WHERE model = ?
    `);

    const now = Math.floor(Date.now() / 1000);
    
    for (const rate of rates) {
      if (!rate.model) {
        continue;
      }
      updateRate.run(
        rate.input_rate || 0,
        rate.output_rate || 0,
        rate.cache_read_rate || 0,
        rate.cache_write_rate || 0,
        now,
        rate.model
      );
    }

    const updatedRates = db.prepare('SELECT * FROM rates ORDER BY model').all();
    
    res.json({
      success: true,
      data: updatedRates,
      message: 'Rates updated successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
