const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { initDb } = require('./db');
const { collectUsageData } = require('./collector');
const routes = require('./routes');

const PORT = process.env.PORT || 3001;

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api', routes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Token Dashboard API',
    version: '1.0.0',
    endpoints: [
      'GET /api/usage',
      'GET /api/usage/:agentId',
      'GET /api/cost/summary',
      'GET /api/cost/daily',
      'GET /api/rates',
      'PUT /api/rates',
      'GET /api/health'
    ]
  });
});

// Initialize database
initDb();

// Initial data collection
console.log('📥 Initial data collection...');
collectUsageData();

// Schedule cron job to collect data every 5 minutes
cron.schedule('*/5 * * * *', () => {
  console.log('🔄 Scheduled data collection...');
  collectUsageData();
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Token Dashboard API running on port ${PORT}`);
  console.log(`📊 API available at http://localhost:${PORT}/api`);
});

module.exports = app;
