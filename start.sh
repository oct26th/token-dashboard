#!/bin/bash
# NERV Token Dashboard Startup Script

echo "🚀 Starting NERV Token Dashboard..."

# Start backend
echo "📦 Starting Backend API..."
cd /home/node/.openclaw/workspace/dashboard-backend
node src/index.js > /tmp/dashboard-backend.log 2>&1 &
BACKEND_PID=$!

# Wait for backend to be ready
sleep 3

# Start frontend server
echo "🌐 Starting Frontend Server..."
cd /home/node/.openclaw/workspace/dashboard-pwa
python3 -m http.server 8080 > /tmp/dashboard-frontend.log 2>&1 &
FRONTEND_PID=$!

echo ""
echo "✅ Dashboard is running!"
echo "   Frontend: http://localhost:8080"
echo "   Backend API: http://localhost:3001/api"
echo ""
echo "   Backend PID: $BACKEND_PID"
echo "   Frontend PID: $FRONTEND_PID"
echo ""
echo "To stop: kill $BACKEND_PID $FRONTEND_PID"
