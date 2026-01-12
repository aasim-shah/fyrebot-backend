#!/bin/bash

echo "🚀 Setting up Chatbot SaaS Platform..."
echo ""

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Error: Node.js 20 or higher is required"
    exit 1
fi
echo "✅ Node.js version: $(node -v)"

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Please edit .env and add your configuration"
else
    echo "✅ .env file exists"
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
else
    echo "✅ Dependencies already installed"
fi

echo ""
echo "📋 Setup Checklist:"
echo ""
echo "1. Edit .env file with your configuration:"
echo "   - MONGODB_URI (MongoDB Atlas or local)"
echo "   - REDIS_URL (Redis Cloud or local)"
echo "   - GROQ_API_KEY (Get from https://console.groq.com/keys)"
echo ""
echo "2. If using MongoDB Atlas, create a vector search index:"
echo "   - Go to Atlas > Database > Search"
echo "   - Create index named 'vector_index' on 'chunks' collection"
echo "   - Use the JSON definition in README.md"
echo ""
echo "3. Start the application:"
echo "   npm run dev"
echo ""
echo "4. Test with the example in README.md"
echo ""
echo "✨ Setup complete! Happy coding!"
