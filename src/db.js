const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'dashboard.db');

let db;

function initDb() {
  const dbPath = path.dirname(DB_PATH);
  const fs = require('fs');
  if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath, { recursive: true });
  }

  db = new Database(DB_PATH);
  
  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model TEXT UNIQUE NOT NULL,
      provider TEXT,
      input_rate REAL DEFAULT 0,
      output_rate REAL DEFAULT 0,
      cache_read_rate REAL DEFAULT 0,
      cache_write_rate REAL DEFAULT 0,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS daily_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      date TEXT NOT NULL,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      cache_write_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      cost REAL DEFAULT 0,
      model TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE TABLE IF NOT EXISTS agent_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      session_id TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      cache_write_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      cost REAL DEFAULT 0,
      model TEXT,
      timestamp INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_daily_usage_date ON daily_usage(date);
    CREATE INDEX IF NOT EXISTS idx_daily_usage_agent ON daily_usage(agent_id);
    CREATE INDEX IF NOT EXISTS idx_agent_usage_agent ON agent_usage(agent_id);
  `);

  // Insert default rates if empty
  const count = db.prepare('SELECT COUNT(*) as cnt FROM rates').get();
  if (count.cnt === 0) {
    const insertRate = db.prepare(`
      INSERT INTO rates (model, provider, input_rate, output_rate, cache_read_rate, cache_write_rate)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    const defaultRates = [
      ['MiniMax-M2.5', 'minimax-portal', 0, 0, 0, 0],
      ['gemini-3-flash', 'google-antigravity', 0.00035, 0.0007, 0, 0],
      ['claude-sonnet-4-5-thinking', 'anthropic', 0.003, 0.015, 0.0003, 0.0003],
      ['claude-sonnet-4-5', 'anthropic', 0.003, 0.015, 0.0003, 0.0003],
      ['gpt-4o', 'openai', 0.0025, 0.01, 0, 0],
      ['gpt-4o-mini', 'openai', 0.00015, 0.0006, 0, 0],
    ];
    
    for (const rate of defaultRates) {
      insertRate.run(...rate);
    }
  }

  console.log('✅ Database initialized');
  return db;
}

function getDb() {
  if (!db) {
    initDb();
  }
  return db;
}

// Get rate for a model
function getRateForModel(model) {
  const db = getDb();
  const rate = db.prepare('SELECT * FROM rates WHERE model = ?').get(model);
  return rate || { input_rate: 0, output_rate: 0, cache_read_rate: 0, cache_write_rate: 0 };
}

// Calculate cost based on tokens and model
function calculateCost(usage, model) {
  const rate = getRateForModel(model);
  return (
    (usage.input || 0) * rate.input_rate +
    (usage.output || 0) * rate.output_rate +
    (usage.cacheRead || 0) * rate.cache_read_rate +
    (usage.cacheWrite || 0) * rate.cache_write_rate
  );
}

module.exports = {
  initDb,
  getDb,
  getRateForModel,
  calculateCost
};
