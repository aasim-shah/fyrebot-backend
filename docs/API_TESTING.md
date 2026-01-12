# API Testing Guide

This guide provides examples for testing all API endpoints using curl.

## Prerequisites

- Server running on http://localhost:3000
- MongoDB and Redis connected
- Gemini API key configured

## 1. Health Check

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-12T10:00:00.000Z",
  "services": {
    "mongodb": "up",
    "redis": "up"
  }
}
```

## 2. Register a Tenant (Get API Key)

```bash
curl -X POST http://localhost:3000/v1/tenants/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "businessName": "John's Tech Store",
    "plan": "free"
  }'
```

Expected response:
```json
{
  "success": true,
  "data": {
    "tenantId": "ten_xxxxxxxxxxxxxxxxx",
    "apiKey": "sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "email": "john@example.com",
    "businessName": "John's Tech Store",
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

**⚠️ IMPORTANT: Save the API key! You'll need it for all subsequent requests.**

## 3. Register Data Sections

Replace `YOUR_API_KEY` with the key from step 2.

```bash
curl -X POST http://localhost:3000/v1/data/register \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "sections": [
      {
        "type": "faq",
        "title": "Shipping Policy",
        "content": "We offer free shipping on all orders over $50 within the continental United States. Standard shipping typically takes 3-5 business days. Express shipping is available for an additional fee and delivers within 1-2 business days. International shipping is available to most countries and takes 7-14 business days."
      },
      {
        "type": "product",
        "title": "Premium Laptop Features",
        "content": "Our premium laptop features a 15.6-inch 4K display, Intel Core i7 processor, 16GB RAM, 512GB SSD storage, NVIDIA RTX 3060 graphics card, backlit keyboard, fingerprint reader, and up to 10 hours of battery life. It weighs only 4.2 pounds and comes with a 2-year warranty."
      },
      {
        "type": "policy",
        "title": "Return Policy",
        "content": "We offer a 30-day money-back guarantee on all products. Items must be returned in original condition with all accessories and packaging. Refunds are processed within 5-7 business days after we receive the returned item. Shipping costs are non-refundable unless the return is due to our error."
      }
    ]
  }'
```

Expected response:
```json
{
  "success": true,
  "data": {
    "sectionsCreated": 3,
    "chunksCreated": 12,
    "sections": [
      {
        "sectionId": "sec_xxxxxxxxxxxxxxxxx",
        "type": "faq",
        "title": "Shipping Policy",
        "chunkCount": 4,
        "status": "completed"
      },
      {
        "sectionId": "sec_yyyyyyyyyyyyyyyyy",
        "type": "product",
        "title": "Premium Laptop Features",
        "chunkCount": 5,
        "status": "completed"
      },
      {
        "sectionId": "sec_zzzzzzzzzzzzzzzzz",
        "type": "policy",
        "title": "Return Policy",
        "chunkCount": 3,
        "status": "completed"
      }
    ]
  },
  "message": "Data registered and embeddings generated successfully"
}
```

## 4. Chat with Your Data

```bash
curl -X POST http://localhost:3000/v1/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "query": "What is your shipping policy for orders over $50?",
    "includeMetadata": true
  }'
```

Expected response:
```json
{
  "success": true,
  "data": {
    "answer": "We offer free shipping on all orders over $50 within the continental United States. Standard shipping typically takes 3-5 business days.",
    "confidence": "high",
    "sources": [
      {
        "sectionId": "sec_xxxxxxxxxxxxxxxxx",
        "title": "Shipping Policy",
        "type": "faq",
        "score": 0.92
      }
    ],
    "metadata": {
      "searchResultsCount": 3,
      "averageScore": 0.88,
      "tokensUsed": 234
    }
  }
}
```

## 5. More Chat Examples

### Ask about products:
```bash
curl -X POST http://localhost:3000/v1/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "query": "Tell me about the laptop specifications"
  }'
```

### Ask about returns:
```bash
curl -X POST http://localhost:3000/v1/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "query": "How long do I have to return a product?"
  }'
```

### Using session for conversation:
```bash
curl -X POST http://localhost:3000/v1/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "query": "What laptops do you have?",
    "sessionId": "user_123_session"
  }'
```

## 6. List All Sections

```bash
curl -X GET "http://localhost:3000/v1/data/sections?skip=0&limit=50" \
  -H "X-API-Key: YOUR_API_KEY"
```

## 7. Get Specific Section

```bash
curl -X GET http://localhost:3000/v1/data/sections/SECTION_ID \
  -H "X-API-Key: YOUR_API_KEY"
```

## 8. Delete a Section

```bash
curl -X DELETE http://localhost:3000/v1/data/sections/SECTION_ID \
  -H "X-API-Key: YOUR_API_KEY"
```

## 9. Get Tenant Information

```bash
curl -X GET http://localhost:3000/v1/tenants/me \
  -H "X-API-Key: YOUR_API_KEY"
```

## 10. Update Tenant Settings

```bash
curl -X PATCH http://localhost:3000/v1/tenants/me \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "businessName": "John'\''s Tech Store - Updated",
    "metadata": {
      "website": "https://johnstech.com"
    }
  }'
```

## 11. Upgrade Plan

```bash
curl -X POST http://localhost:3000/v1/tenants/plan \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "plan": "pro"
  }'
```

## 12. Create Additional API Key

```bash
curl -X POST http://localhost:3000/v1/tenants/api-keys \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "name": "Production Key"
  }'
```

## Rate Limiting Test

The API includes rate limiting. You can test it by making rapid requests:

```bash
# This will eventually hit rate limits (10 requests/minute on free plan)
for i in {1..15}; do
  echo "Request $i"
  curl -X POST http://localhost:3000/v1/chat \
    -H "Content-Type: application/json" \
    -H "X-API-Key: YOUR_API_KEY" \
    -d '{"query": "Test query '$i'"}' \
    -w "\nStatus: %{http_code}\n\n"
  sleep 2
done
```

Expected rate limit response:
```json
{
  "error": "Rate limit exceeded",
  "message": "Rate limit: 10 requests per minute",
  "retryAfter": 60
}
```

## Error Responses

### Invalid API Key:
```json
{
  "error": "Unauthorized",
  "message": "Invalid API key"
}
```

### Missing API Key:
```json
{
  "error": "Unauthorized",
  "message": "API key is required. Provide it in the X-API-Key header."
}
```

### Validation Error:
```json
{
  "error": "Validation error",
  "details": [
    {
      "code": "too_small",
      "minimum": 1,
      "type": "string",
      "path": ["query"],
      "message": "Query is required"
    }
  ]
}
```

## Testing Tips

1. **Save your API key** immediately after registration
2. **Use environment variables** for the API key:
   ```bash
   export API_KEY="sk_your_actual_key_here"
   curl -H "X-API-Key: $API_KEY" ...
   ```
3. **Check rate limit headers** in responses:
   - X-RateLimit-Limit-Minute
   - X-RateLimit-Remaining-Minute
   - X-RateLimit-Limit-Hour
   - X-RateLimit-Remaining-Hour
4. **Monitor logs** for debugging

## Load Testing (Optional)

Use tools like `ab` (Apache Bench) or `hey`:

```bash
# Install hey
brew install hey

# Load test the chat endpoint
hey -n 100 -c 10 -m POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"query":"test"}' \
  http://localhost:3000/v1/chat
```

## Postman Collection

You can import these curl commands into Postman:
1. Open Postman
2. Import > Raw text
3. Paste any curl command above
4. Set API_KEY as a collection variable

---

**Happy Testing! 🚀**
