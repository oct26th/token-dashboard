const fs = require('fs');
const path = require('path');
const { getDb, calculateCost } = require('./db');

const AGENTS_DIR = '/home/node/.openclaw/agents';
const SUBAGENTS_RUNS = '/home/node/.openclaw/subagents/runs.json';

function getAllAgentIds() {
  const dirs = fs.readdirSync(AGENTS_DIR).filter(d => {
    const stat = fs.statSync(path.join(AGENTS_DIR, d));
    return stat.isDirectory();
  });
  return dirs;
}

// Parse session JSONL file and extract usage data
function parseSessionJsonl(filePath, agentId) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  const usages = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'message' && entry.message?.usage) {
        const usage = entry.message.usage;
        const model = entry.message.model || 'unknown';
        const timestamp = entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now();
        
        usages.push({
          agentId,
          sessionId: entry.id,
          input: usage.input || 0,
          output: usage.output || 0,
          cacheRead: usage.cacheRead || 0,
          cacheWrite: usage.cacheWrite || 0,
          totalTokens: usage.totalTokens || 0,
          cost: calculateCost(usage, model),
          model,
          timestamp
        });
      }
    } catch (e) {
      // Skip invalid JSON lines
    }
  }

  return usages;
}

// Collect all usage data from sessions
function collectUsageData() {
  const db = getDb();
  const agentIds = getAllAgentIds();
  
  console.log(`📊 Collecting usage data from agents: ${agentIds.join(', ')}`);

  const insertUsage = db.prepare(`
    INSERT INTO agent_usage (agent_id, session_id, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, total_tokens, cost, model, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertDaily = db.prepare(`
    INSERT INTO daily_usage (agent_id, date, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, total_tokens, cost, model)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const today = new Date().toISOString().split('T')[0];

  for (const agentId of agentIds) {
    const sessionsPath = path.join(AGENTS_DIR, agentId, 'sessions');
    if (!fs.existsSync(sessionsPath)) continue;

    const files = fs.readdirSync(sessionsPath);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl') && !f.includes('.reset.'));

    for (const file of jsonlFiles) {
      const filePath = path.join(sessionsPath, file);
      const usages = parseSessionJsonl(filePath, agentId);

      for (const usage of usages) {
        // Insert into agent_usage
        insertUsage.run(
          usage.agentId,
          usage.sessionId,
          usage.input,
          usage.output,
          usage.cacheRead,
          usage.cacheWrite,
          usage.totalTokens,
          usage.cost,
          usage.model,
          usage.timestamp
        );

        // Aggregate into daily_usage
        const date = new Date(usage.timestamp).toISOString().split('T')[0];
        
        // Check if record exists for this agent+date
        const existing = db.prepare(`
          SELECT id FROM daily_usage 
          WHERE agent_id = ? AND date = ? AND model = ?
        `).get(usage.agentId, date, usage.model);

        if (existing) {
          db.prepare(`
            UPDATE daily_usage 
            SET input_tokens = input_tokens + ?,
                output_tokens = output_tokens + ?,
                cache_read_tokens = cache_read_tokens + ?,
                cache_write_tokens = cache_write_tokens + ?,
                total_tokens = total_tokens + ?,
                cost = cost + ?
            WHERE id = ?
          `).run(
            usage.input,
            usage.output,
            usage.cacheRead,
            usage.cacheWrite,
            usage.totalTokens,
            usage.cost,
            existing.id
          );
        } else {
          insertDaily.run(
            usage.agentId,
            date,
            usage.input,
            usage.output,
            usage.cacheRead,
            usage.cacheWrite,
            usage.totalTokens,
            usage.cost,
            usage.model
          );
        }
      }
    }
  }

  console.log('✅ Usage data collected');
}

// Get all usage data
function getAllUsage() {
  const db = getDb();
  
  const byAgent = db.prepare(`
    SELECT 
      agent_id,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens,
      SUM(cache_read_tokens) as cache_read_tokens,
      SUM(cache_write_tokens) as cache_write_tokens,
      SUM(total_tokens) as total_tokens,
      SUM(cost) as total_cost
    FROM agent_usage
    GROUP BY agent_id
  `).all();

  const total = db.prepare(`
    SELECT 
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens,
      SUM(cache_read_tokens) as cache_read_tokens,
      SUM(cache_write_tokens) as cache_write_tokens,
      SUM(total_tokens) as total_tokens,
      SUM(cost) as total_cost
    FROM agent_usage
  `).get();

  return { byAgent, total };
}

// Get usage for specific agent
function getAgentUsage(agentId) {
  const db = getDb();
  
  const sessions = db.prepare(`
    SELECT 
      session_id,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens,
      SUM(total_tokens) as total_tokens,
      SUM(cost) as total_cost,
      model,
      MIN(timestamp) as first_seen,
      MAX(timestamp) as last_seen
    FROM agent_usage
    WHERE agent_id = ?
    GROUP BY session_id, model
    ORDER BY last_seen DESC
  `).all(agentId);

  const daily = db.prepare(`
    SELECT 
      date,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens,
      SUM(total_tokens) as total_tokens,
      SUM(cost) as total_cost
    FROM daily_usage
    WHERE agent_id = ?
    GROUP BY date
    ORDER BY date DESC
    LIMIT 30
  `).all(agentId);

  return { sessions, daily };
}

// Get cost summary
function getCostSummary() {
  const db = getDb();
  
  const byAgent = db.prepare(`
    SELECT 
      agent_id,
      SUM(cost) as total_cost,
      SUM(total_tokens) as total_tokens
    FROM daily_usage
    GROUP BY agent_id
    ORDER BY total_cost DESC
  `).all();

  const byModel = db.prepare(`
    SELECT 
      model,
      SUM(cost) as total_cost,
      SUM(total_tokens) as total_tokens
    FROM daily_usage
    GROUP BY model
    ORDER BY total_cost DESC
  `).all();

  const overall = db.prepare(`
    SELECT 
      SUM(cost) as total_cost,
      SUM(total_tokens) as total_tokens,
      COUNT(DISTINCT agent_id) as agent_count,
      COUNT(DISTINCT date) as day_count
    FROM daily_usage
  `).get();

  return { byAgent, byModel, overall };
}

// Get daily cost trend
function getDailyCost(days = 30) {
  const db = getDb();
  
  const daily = db.prepare(`
    SELECT 
      date,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens,
      SUM(total_tokens) as total_tokens,
      SUM(cost) as total_cost
    FROM daily_usage
    GROUP BY date
    ORDER BY date DESC
    LIMIT ?
  `).all(days);

  return daily.reverse();
}

module.exports = {
  collectUsageData,
  getAllUsage,
  getAgentUsage,
  getCostSummary,
  getDailyCost
};
