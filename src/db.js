const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://root:iZax24t76H0zSq5j8R3lCuvwbUW9V1XT@8.209.236.248:30300/zeabur';

const pool = new Pool({ connectionString: DATABASE_URL });

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rates (
      id SERIAL PRIMARY KEY,
      model TEXT UNIQUE NOT NULL,
      provider TEXT,
      input_rate REAL DEFAULT 0,
      output_rate REAL DEFAULT 0,
      cache_read_rate REAL DEFAULT 0,
      cache_write_rate REAL DEFAULT 0,
      updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
    );

    CREATE TABLE IF NOT EXISTS daily_usage (
      id SERIAL PRIMARY KEY,
      agent_id TEXT NOT NULL,
      date TEXT NOT NULL,
      input_tokens BIGINT DEFAULT 0,
      output_tokens BIGINT DEFAULT 0,
      cache_read_tokens BIGINT DEFAULT 0,
      cache_write_tokens BIGINT DEFAULT 0,
      total_tokens BIGINT DEFAULT 0,
      cost REAL DEFAULT 0,
      model TEXT,
      created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
    );

    CREATE TABLE IF NOT EXISTS agent_usage (
      id SERIAL PRIMARY KEY,
      agent_id TEXT NOT NULL,
      session_id TEXT,
      input_tokens BIGINT DEFAULT 0,
      output_tokens BIGINT DEFAULT 0,
      cache_read_tokens BIGINT DEFAULT 0,
      cache_write_tokens BIGINT DEFAULT 0,
      total_tokens BIGINT DEFAULT 0,
      cost REAL DEFAULT 0,
      model TEXT,
      timestamp BIGINT,
      created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
    );

    CREATE INDEX IF NOT EXISTS idx_daily_usage_date ON daily_usage(date);
    CREATE INDEX IF NOT EXISTS idx_daily_usage_agent ON daily_usage(agent_id);
    CREATE INDEX IF NOT EXISTS idx_agent_usage_agent ON agent_usage(agent_id);
  `);

  const { rows } = await pool.query('SELECT COUNT(*) as cnt FROM rates');
  if (parseInt(rows[0].cnt) === 0) {
    const defaultRates = [
      ['MiniMax-M2.5', 'minimax-portal', 0, 0, 0, 0],
      ['MiniMax-M2.1', 'minimax-portal', 0, 0, 0, 0],
      ['gemini-3-flash', 'google', 0.00035, 0.0007, 0, 0],
      ['claude-sonnet-4-5-thinking', 'anthropic', 0.003, 0.015, 0.0003, 0.0003],
      ['claude-sonnet-4-5', 'anthropic', 0.003, 0.015, 0.0003, 0.0003],
      ['gpt-4o', 'openai', 0.0025, 0.01, 0, 0],
    ];
    for (const [model, provider, inp, out, cr, cw] of defaultRates) {
      await pool.query(
        'INSERT INTO rates (model, provider, input_rate, output_rate, cache_read_rate, cache_write_rate) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (model) DO NOTHING',
        [model, provider, inp, out, cr, cw]
      );
    }
  }

  console.log('✅ Database initialized');
  return pool;
}

function getDb() {
  return pool;
}

async function getRateForModel(model) {
  const { rows } = await pool.query('SELECT * FROM rates WHERE model = $1', [model]);
  return rows[0] || { input_rate: 0, output_rate: 0, cache_read_rate: 0, cache_write_rate: 0 };
}

async function calculateCost(usage, model) {
  const rate = await getRateForModel(model);
  return (
    (usage.input || 0) * rate.input_rate +
    (usage.output || 0) * rate.output_rate +
    (usage.cacheRead || 0) * rate.cache_read_rate +
    (usage.cacheWrite || 0) * rate.cache_write_rate
  );
}

module.exports = { initDb, getDb, getRateForModel, calculateCost };
