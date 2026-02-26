const fs = require('fs');
const path = require('path');
const { getDb, calculateCost } = require('./db');

const AGENTS_DIR = process.env.AGENTS_DIR || '/home/node/.openclaw/agents';

function getAllAgentIds() {
  if (!fs.existsSync(AGENTS_DIR)) return [];
  return fs.readdirSync(AGENTS_DIR).filter(d =>
    fs.statSync(path.join(AGENTS_DIR, d)).isDirectory()
  );
}

function parseSessionJsonl(filePath, agentId) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(l => l.trim());
  const usages = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'message' && entry.message?.usage) {
        const usage = entry.message.usage;
        const model = entry.message.model || 'unknown';
        const timestamp = entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now();
        const cost = (usage.cost && usage.cost.total) ? usage.cost.total : 0;
        usages.push({
          agentId, sessionId: entry.id,
          input: usage.input || 0, output: usage.output || 0,
          cacheRead: usage.cacheRead || 0, cacheWrite: usage.cacheWrite || 0,
          totalTokens: usage.totalTokens || 0, cost, model, timestamp
        });
      }
    } catch {}
  }
  return usages;
}

async function collectUsageData() {
  const pool = getDb();
  const agentIds = getAllAgentIds();
  console.log(`📊 Collecting usage data from agents: ${agentIds.join(', ')}`);

  // Clear and re-insert (simple strategy for MVP)
  await pool.query('DELETE FROM agent_usage');
  await pool.query('DELETE FROM daily_usage');

  for (const agentId of agentIds) {
    const sessionsPath = path.join(AGENTS_DIR, agentId, 'sessions');
    if (!fs.existsSync(sessionsPath)) continue;
    const files = fs.readdirSync(sessionsPath).filter(f => f.endsWith('.jsonl') && !f.includes('.deleted.'));

    for (const file of files) {
      const usages = parseSessionJsonl(path.join(sessionsPath, file), agentId);
      for (const u of usages) {
        await pool.query(
          `INSERT INTO agent_usage (agent_id,session_id,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,total_tokens,cost,model,timestamp)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [u.agentId, u.sessionId, u.input, u.output, u.cacheRead, u.cacheWrite, u.totalTokens, u.cost, u.model, u.timestamp]
        );
        const date = new Date(u.timestamp).toISOString().split('T')[0];
        const { rows } = await pool.query(
          'SELECT id FROM daily_usage WHERE agent_id=$1 AND date=$2 AND model=$3',
          [u.agentId, date, u.model]
        );
        if (rows.length > 0) {
          await pool.query(
            `UPDATE daily_usage SET input_tokens=input_tokens+$1, output_tokens=output_tokens+$2,
             cache_read_tokens=cache_read_tokens+$3, cache_write_tokens=cache_write_tokens+$4,
             total_tokens=total_tokens+$5, cost=cost+$6 WHERE id=$7`,
            [u.input, u.output, u.cacheRead, u.cacheWrite, u.totalTokens, u.cost, rows[0].id]
          );
        } else {
          await pool.query(
            `INSERT INTO daily_usage (agent_id,date,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,total_tokens,cost,model)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [u.agentId, date, u.input, u.output, u.cacheRead, u.cacheWrite, u.totalTokens, u.cost, u.model]
          );
        }
      }
    }
  }
  console.log('✅ Usage data collected');
}

async function getAllUsage() {
  const pool = getDb();
  const { rows: byAgent } = await pool.query(`
    SELECT agent_id, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens,
           SUM(total_tokens) as total_tokens, SUM(cost) as total_cost
    FROM agent_usage GROUP BY agent_id`);
  const { rows: [total] } = await pool.query(`
    SELECT SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens,
           SUM(total_tokens) as total_tokens, SUM(cost) as total_cost FROM agent_usage`);
  return { byAgent, total };
}

async function getAgentUsage(agentId) {
  const pool = getDb();
  const { rows: sessions } = await pool.query(`
    SELECT session_id, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens,
           SUM(total_tokens) as total_tokens, SUM(cost) as total_cost, model,
           MIN(timestamp) as first_seen, MAX(timestamp) as last_seen
    FROM agent_usage WHERE agent_id=$1 GROUP BY session_id, model ORDER BY last_seen DESC`, [agentId]);
  const { rows: daily } = await pool.query(`
    SELECT date, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens,
           SUM(total_tokens) as total_tokens, SUM(cost) as total_cost
    FROM daily_usage WHERE agent_id=$1 GROUP BY date ORDER BY date DESC LIMIT 30`, [agentId]);
  return { sessions, daily };
}

async function getCostSummary() {
  const pool = getDb();
  const { rows: byAgent } = await pool.query(`
    SELECT agent_id, SUM(cost) as total_cost, SUM(total_tokens) as total_tokens
    FROM daily_usage GROUP BY agent_id ORDER BY total_cost DESC`);
  const { rows: byModel } = await pool.query(`
    SELECT model, SUM(cost) as total_cost, SUM(total_tokens) as total_tokens
    FROM daily_usage GROUP BY model ORDER BY total_cost DESC`);
  const { rows: [overall] } = await pool.query(`
    SELECT SUM(cost) as total_cost, SUM(total_tokens) as total_tokens,
           COUNT(DISTINCT agent_id) as agent_count, COUNT(DISTINCT date) as day_count
    FROM daily_usage`);
  return { byAgent, byModel, overall };
}

async function getDailyCost(days = 30) {
  const pool = getDb();
  const { rows } = await pool.query(`
    SELECT date, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens,
           SUM(total_tokens) as total_tokens, SUM(cost) as total_cost
    FROM daily_usage GROUP BY date ORDER BY date DESC LIMIT $1`, [days]);
  return rows.reverse();
}

module.exports = { collectUsageData, getAllUsage, getAgentUsage, getCostSummary, getDailyCost };
