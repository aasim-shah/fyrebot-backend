# 🚀 Quick Start Guide

Get your chatbot SaaS platform running in under 5 minutes!

## Prerequisites

- ✅ Node.js 20+ installed
- ✅ MongoDB (Atlas free tier or local)
- ✅ Redis (free tier or local)
- ✅ Groq API key

## Step 1: Get Your Services

### MongoDB Atlas (Free)
1. Go to https://www.mongodb.com/cloud/atlas/register
2. Create a free cluster
3. Get connection string: `mongodb+srv://username:password@cluster.mongodb.net/chatbot-saas`

### Redis (Free)
**Option A: Local (macOS/Linux)**
```bash
# macOS
brew install redis
redis-server

# Linux
sudo apt-get install redis-server
redis-server
```

**Option B: Redis Cloud (Free)**
1. Go to https://redis.com/try-free/
2. Create free database
3. Get connection URL: `redis://default:password@host:port`

### Groq API Key (Free)
1. Go to https://console.groq.com/keys
2. Create API key
3. Copy the key

## Step 2: Configure

```bash
cd chatbot-saas

# Create .env file
cp .env.example .env

# Edit .env with your credentials
nano .env
```

Add your configuration:
```env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/chatbot-saas
REDIS_URL=redis://localhost:6379
GROQ_API_KEY=your_actual_groq_api_key_here
CHAT_MODEL=llama-3.3-70b-versatile
```

## Step 3: Setup MongoDB Atlas Vector Search

**IMPORTANT:** This is required for vector search to work!

1. Go to your MongoDB Atlas cluster
2. Navigate to **Search** tab
3. Click **Create Search Index**
4. Choose **JSON Editor**
5. Paste this configuration:

```json
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "embedding": {
        "type": "knnVector",
        "dimensions": 768,
        "similarity": "cosine"
      },
      "tenantId": {
        "type": "token"
      },
      "sectionType": {
        "type": "token"
      }
    }
  }
}
```

6. Set:
   - **Index Name:** `vector_index`
   - **Database:** `chatbot-saas` (or your database name)
   - **Collection:** `chunks`
7. Click **Create Search Index**

Wait 1-2 minutes for the index to build.

## Step 4: Install & Run

```bash
# Install dependencies (already done if you see node_modules)
npm install

# Start the server
npm run dev
```

You should see:
```
🚀 Server running at http://0.0.0.0:3000
📚 API documentation: http://0.0.0.0:3000/
```

## Step 5: Test It!

### A. Check health
```bash
curl http://localhost:3000/health
```

### B. Register a tenant
```bash
curl -X POST http://localhost:3000/v1/tenants/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "businessName": "Test Company",
    "plan": "free"
  }'
```

**💾 Save the API key from the response!**

### C. Add some data
```bash
export API_KEY="your_api_key_from_step_b"

curl -X POST http://localhost:3000/v1/data/register \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "sections": [{
      "type": "faq",
      "title": "Shipping Info",
      "content": "We ship worldwide. Free shipping on orders over $50. Delivery takes 3-5 business days."
    }]
  }'
```

### D. Chat with your data!
```bash
curl -X POST http://localhost:3000/v1/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{
    "query": "Do you offer free shipping?"
  }'
```

You should get an AI-powered response based on your data! 🎉

## Troubleshooting

### "Database not connected"
- Check your MongoDB URI in `.env`
- Ensure your IP is whitelisted in MongoDB Atlas (Network Access)

### "Redis not connected"
- If using local Redis: `redis-server` should be running
- Check Redis URL in `.env`

### "Failed to generate embedding"
- Verify your Groq API key in `.env`
- Note: Groq doesn't provide embeddings, so mock embeddings are used
- This is suitable for development and testing

### "Vector search failed"
- Ensure you created the `vector_index` in MongoDB Atlas
- Wait a few minutes for the index to become active
- Check the index name is exactly `vector_index`

### Chat returns "I don't have enough information"
- Make sure you registered data sections first
- Verify embeddings were generated (check logs)
- Try asking questions related to your content

## What's Next?

1. **Read the full documentation:** See `README.md`
2. **Test all endpoints:** See `docs/API_TESTING.md`
3. **Deploy to production:** See deployment section in README
4. **Add more data:** Register more sections for better responses
5. **Upgrade plan:** Test Pro or Enterprise features

## Common Use Cases

### E-commerce Store
```json
{
  "sections": [
    {"type": "product", "title": "Product X", "content": "...features..."},
    {"type": "policy", "title": "Returns", "content": "...policy..."},
    {"type": "faq", "title": "Shipping", "content": "...info..."}
  ]
}
```

### SaaS Documentation
```json
{
  "sections": [
    {"type": "general", "title": "Getting Started", "content": "...guide..."},
    {"type": "faq", "title": "Common Issues", "content": "...solutions..."},
    {"type": "general", "title": "API Reference", "content": "...docs..."}
  ]
}
```

### Customer Support
```json
{
  "sections": [
    {"type": "faq", "title": "Account Setup", "content": "...steps..."},
    {"type": "policy", "title": "Terms of Service", "content": "...legal..."},
    {"type": "general", "title": "Contact Info", "content": "...details..."}
  ]
}
```

## Development Tips

### Watch mode
The server auto-reloads when you change code:
```bash
npm run dev
```

### Check logs
All requests and errors are logged with timestamps and request IDs.

### Test rate limits
Free plan: 10 req/min, 100 req/hour, 1000/month

### Session support
Use `sessionId` in chat requests to maintain conversation context.

## Architecture Overview

```
Client → API (Fastify)
         ↓
    Auth Middleware (API Key)
         ↓
    Rate Limiter (Redis)
         ↓
    Service Layer
         ↓
    ├─ Tenant Service → MongoDB
    ├─ Data Service → MongoDB + Mock Embeddings
    ├─ Vector Search → MongoDB Atlas Search
    └─ Chat Service → Groq + Vector Search
```

## Need Help?

1. Check `README.md` for detailed documentation
2. Review `docs/API_TESTING.md` for all endpoints
3. Check server logs for errors
4. Verify all services are running with `/health` endpoint

---

**🎉 Congratulations! Your multi-tenant chatbot platform is running!**

Start building amazing conversational experiences with RAG-powered AI. 🚀
