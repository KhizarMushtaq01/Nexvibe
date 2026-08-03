#!/bin/bash
# NexVibe - Full Setup Script
set -e

echo "🚀 NexVibe Setup"
echo "=================="

# Check Node
node_version=$(node -v 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1)
if [ -z "$node_version" ] || [ "$node_version" -lt 18 ]; then
  echo "❌ Node.js 18+ required. Visit https://nodejs.org"
  exit 1
fi
echo "✅ Node.js $(node -v)"

# Check MongoDB
if ! command -v mongod &>/dev/null; then
  echo "⚠️  MongoDB not found locally. Use MongoDB Atlas (cloud) instead:"
  echo "   https://www.mongodb.com/atlas/database"
fi

# Install dependencies
echo ""
echo "📦 Installing backend dependencies..."
cd backend && npm install
echo "✅ Backend ready"

echo ""
echo "📦 Installing frontend dependencies..."
cd ../frontend && npm install
echo "✅ Frontend ready"

cd ..

# Create .env if it doesn't exist
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo ""
  echo "📝 Created backend/.env - PLEASE EDIT IT with your values:"
  echo "   - MONGODB_URI: Your MongoDB connection string"
  echo "   - JWT_SECRET: Any long random string (min 32 chars)"
  echo "   - EMAIL_USER / EMAIL_PASS: Gmail + App Password"
  echo "   - CLOUDINARY_*: From cloudinary.com (free tier)"
  echo ""
  echo "   Then run: npm run dev"
else
  echo ""
  echo "✅ .env already exists"
  echo ""
  echo "▶️  Run the app:"
  echo "   Terminal 1: cd backend && npm run dev"
  echo "   Terminal 2: cd frontend && npm run dev"
  echo ""
  echo "   App: http://localhost:5173"
  echo "   API: http://localhost:5000/api"
fi
