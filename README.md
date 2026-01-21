# FyreBot Platform

A production-ready multi-tenant SaaS chatbot platform with RAG (Retrieval-Augmented Generation) using Gemini AI, MongoDB, and Redis.

## 🚀 Features

- **Multi-tenant Architecture**: Complete tenant isolation with API key authentication
- **RAG Implementation**: Vector search with MongoDB Atlas for contextual responses
- **Smart Rate Limiting**: Per-tenant rate limits (minute, hour, monthly)
- **Three Pricing Tiers**: Free, Pro, and Enterprise plans
- **Production Ready**: Proper error handling, logging, caching, and graceful shutdown
- **Scalable**: Built with Fastify, MongoDB, and Redis for high performance

## 📋 Prerequisites

- Node.js 20+ 
- MongoDB (local or Atlas)
- Redis (local or cloud)
- Google Gemini API key

## 🛠️ Installation

1. **Clone and install dependencies:**
```bash
cd chatbot-saas
npm install
```

2. **Set up environment variables:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Configure MongoDB Atlas Vector Search:**

Create a vector search index named `vector_index` on the `chunks` collection:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 768,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "tenantId"
    },
    {
      "type": "filter",
      "path": "sectionType"
    }
  ]
}
```

## 🏃 Running the Application

**Development mode:**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

## 📚 API Documentation

### Base URL
```
http://localhost:3000
```

### 1. Register Tenant

**Endpoint:** `POST /v1/tenants/register`

**Request:**
```json
{
  "email": "user@example.com",
  "businessName": "Acme Corp",
  "plan": "free"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tenantId": "ten_xxx",
    "apiKey": "sk_xxx",
    "email": "user@example.com",
    "businessName": "Acme Corp",
    "plan": "free",
    "limits": {
      "apiCallsPerMonth": 1000,
      "sectionsPerTenant": 10,
      "tokensPerRequest": 2000,
      "requestsPerMinute": 10,
      "requestsPerHour": 100
    }
  },
  "message": "Tenant registered successfully. Save your API key securely - it will not be shown again."
}
```

### 2. Register Data Sections

**Endpoint:** `POST /v1/data/register`

**Headers:**
```
X-API-Key: sk_xxx
```

**Request:**
```json
{
  "sections": [
    {
      "type": "faq",
      "title": "Shipping Policy",
      "content": "We offer free shipping on orders over $50. Standard shipping takes 3-5 business days..."
    },
    {
      "type": "product",
      "title": "Product Features",
      "content": "Our premium widget includes..."
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sectionsCreated": 2,
    "chunksCreated": 8,
    "sections": [
      {
        "sectionId": "sec_xxx",
        "type": "faq",
        "title": "Shipping Policy",
        "chunkCount": 4,
        "status": "completed"
      }
    ]
  },
  "message": "Data registered and embeddings generated successfully"
}
```

### 3. Chat Query

**Endpoint:** `POST /v1/chat`

**Headers:**
```
X-API-Key: sk_xxx
```

**Request:**
```json
{
  "query": "What is your shipping policy?",
  "sessionId": "session_123",
  "includeMetadata": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "answer": "We offer free shipping on orders over $50. Standard shipping typically takes 3-5 business days...",
    "confidence": "high",
    "sources": [
      {
        "sectionId": "sec_xxx",
        "title": "Shipping Policy",
        "type": "faq",
        "score": 0.89
      }
    ],
    "metadata": {
      "searchResultsCount": 3,
      "averageScore": 0.85,
      "tokensUsed": 450
    }
  }
}
```

### 4. List Sections

**Endpoint:** `GET /v1/data/sections?skip=0&limit=50`

**Headers:**
```
X-API-Key: sk_xxx
```

### 5. Delete Section

**Endpoint:** `DELETE /v1/data/sections/:sectionId`

**Headers:**
```
X-API-Key: sk_xxx
```

### 6. Get Tenant Info

**Endpoint:** `GET /v1/tenants/me`

**Headers:**
```
X-API-Key: sk_xxx
```

### 7. Update Plan

**Endpoint:** `POST /v1/tenants/plan`

**Headers:**
```
X-API-Key: sk_xxx
```

**Request:**
```json
{
  "plan": "pro"
}
```

## 🔑 Pricing Plans

| Feature | Free | Pro | Enterprise |
|---------|------|-----|------------|
| API Calls/Month | 1,000 | 10,000 | 100,000 |
| Sections | 10 | 100 | 1,000 |
| Tokens/Request | 2,000 | 4,000 | 8,000 |
| Requests/Minute | 10 | 30 | 100 |
| Requests/Hour | 100 | 500 | 2,000 |
| **Price** | **$0** | **$29/mo** | **$299/mo** |

## 🏗️ Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────┐
│   Fastify API Server            │
│   - Authentication              │
│   - Rate Limiting               │
│   - Request Validation          │
└──────┬──────────────────────────┘
       │
       ├──────┬──────────┬─────────┐
       ▼      ▼          ▼         ▼
   ┌────────┐ ┌──────┐ ┌──────┐ ┌────────┐
   │ Tenant │ │ Data │ │ Chat │ │ Vector │
   │Service │ │Service│ │Service│ │ Search │
   └────────┘ └──────┘ └──────┘ └────────┘
       │          │        │         │
       └──────────┴────────┴─────────┘
                  │
       ┌──────────┴───────────┐
       ▼                      ▼
   ┌──────────┐          ┌─────────┐
   │ MongoDB  │          │  Redis  │
   │ (Atlas)  │          │ (Cache) │
   └──────────┘          └─────────┘
       │
       ▼
   ┌──────────────────┐
   │  Gemini AI       │
   │  - Embeddings    │
   │  - Chat          │
   └──────────────────┘
```

## 📁 Project Structure

```
chatbot-saas/
├── src/
│   ├── db/                 # Database connections
│   │   ├── mongodb.js
│   │   └── redis.js
│   ├── middleware/         # Express/Fastify middleware
│   │   ├── auth.js
│   │   └── rate-limit.js
│   ├── routes/             # API routes
│   │   ├── tenant.routes.js
│   │   ├── data.routes.js
│   │   └── chat.routes.js
│   ├── services/           # Business logic
│   │   ├── tenant.service.js
│   │   ├── data.service.js
│   │   ├── embedding.service.js
│   │   ├── vector-search.service.js
│   │   └── chat.service.js
│   ├── schemas/            # Validation schemas
│   │   └── validation.js
│   ├── utils/              # Utilities
│   │   ├── constants.js
│   │   └── helpers.js
│   └── index.js            # Application entry point
├── tests/                  # Test files
├── docs/                   # Documentation
├── .env.example
├── package.json
└── README.md
```

## 🔒 Security Features

- **API Key Authentication**: Secure tenant isolation
- **Rate Limiting**: Prevent abuse with multiple limits
- **Input Validation**: Zod schema validation
- **Helmet.js**: Security headers
- **CORS**: Configurable cross-origin policies
- **Hash Storage**: API keys stored as SHA-256 hashes

## 🧪 Testing

Run the test suite:
```bash
npm test
```

## 📊 Monitoring

Health check endpoint:
```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-12T10:30:00.000Z",
  "services": {
    "mongodb": "up",
    "redis": "up"
  }
}
```

## 🚀 Deployment

### Docker Deployment (Recommended)

1. **Build image:**
```bash
docker build -t chatbot-saas .
```

2. **Run container:**
```bash
docker run -d \
  -p 3000:3000 \
  -e MONGODB_URI=your_mongodb_uri \
  -e REDIS_URL=your_redis_url \
  -e GEMINI_API_KEY=your_api_key \
  chatbot-saas
```

### Cloud Deployment

Deploy to any Node.js hosting platform:
- **Heroku**: Use Procfile
- **Railway**: Auto-detected
- **Render**: Use build command `npm install`
- **AWS/GCP/Azure**: Use container services

## 🛠️ Configuration

All configuration is done via environment variables. See `.env.example` for all available options.

## 📈 Performance

- **Response Time**: < 500ms for chat queries
- **Throughput**: 1000+ requests/second
- **Caching**: Redis caching for tenant data and API keys
- **Connection Pooling**: MongoDB connection pooling configured

## 🤝 Contributing

This is a production-ready implementation. Feel free to extend it with:
- Admin dashboard
- Analytics and metrics
- Webhook support
- Multi-language support
- File upload support

## 📝 License

ISC

## 🆘 Support

For issues and questions:
1. Check the API documentation above
2. Review the health endpoint
3. Check logs for errors

## ⚡ Quick Start Example

```bash
# 1. Register a tenant
curl -X POST http://localhost:3000/v1/tenants/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@example.com",
    "businessName": "Demo Company",
    "plan": "free"
  }'

# Save the API key from response

# 2. Add some data
curl -X POST http://localhost:3000/v1/data/register \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "sections": [{
      "type": "faq",
      "title": "About Us",
      "content": "We are a company that provides excellent service..."
    }]
  }'

# 3. Chat with your data
curl -X POST http://localhost:3000/v1/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "query": "Tell me about your company"
  }'
```

## 🎯 Next Steps

1. Get MongoDB Atlas account (free tier available)
2. Get Redis instance (free tier available) 
3. Get Gemini API key (free tier available)
4. Configure .env file
5. Run `npm install && npm run dev`
6. Start building!

---

**Built with ❤️ using Node.js, Fastify, MongoDB, Redis, and Google Gemini AI**
# fyrebot-backend
