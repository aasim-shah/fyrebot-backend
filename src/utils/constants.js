// Configuration constants for the SaaS platform

export const PLANS = {
  FREE: {
    name: 'free',
    price: 0,
    limits: {
      apiKeys: 1,
      dataFiles: 10,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      chatbots: 1,
      apiCallsPerMonth: 1000,
      storageLimit: 10 * 1024 * 1024, // 10MB total
      tokensPerRequest: 2000,
      requestsPerMinute: 10,
      requestsPerHour: 100
    }
  },
  PRO: {
    name: 'pro',
    price: 9.99,
    limits: {
      apiKeys: 4,
      dataFiles: 40,
      maxFileSize: 100 * 1024 * 1024, // 100MB
      chatbots: 4,
      apiCallsPerMonth: 50000,
      storageLimit: 4000 * 1024 * 1024, // 4GB total (100MB * 40 files)
      tokensPerRequest: 4000,
      requestsPerMinute: 30,
      requestsPerHour: 500
    }
  },
  ENTERPRISE: {
    name: 'enterprise',
    price: 299,
    limits: {
      apiKeys: 20,
      dataFiles: 200,
      maxFileSize: 500 * 1024 * 1024, // 500MB
      chatbots: 20,
      apiCallsPerMonth: 500000,
      storageLimit: 100 * 1024 * 1024 * 1024, // 100GB
      tokensPerRequest: 8000,
      requestsPerMinute: 100,
      requestsPerHour: 2000
    }
  }
};

export const CHUNK_CONFIG = {
  size: 500,
  overlap: 50,
  minSize: 100
};

export const VECTOR_SEARCH = {
  numCandidates: 100,
  limit: 5,
  similarityThreshold: 0.70
};

export const CACHE_TTL = {
  tenant: 3600,        // 1 hour
  apiKey: 300,         // 5 minutes
  embeddings: 86400    // 24 hours
};

export const OPENAI_MODELS = {
  EMBEDDING: {
    SMALL: 'text-embedding-3-small',    // 1536 dimensions, $0.02/1M tokens
    LARGE: 'text-embedding-3-large',    // 3072 dimensions, $0.13/1M tokens
    ADA: 'text-embedding-ada-002'       // 1536 dimensions (legacy)
  },
  CHAT: {
    GPT4_TURBO: 'gpt-4-turbo-preview',  // Best quality
    GPT4: 'gpt-4',                       // High quality
    GPT35_TURBO: 'gpt-3.5-turbo',       // Fast & economical
    GPT4O: 'gpt-4o',                     // Latest model
    GPT4O_MINI: 'gpt-4o-mini'            // Cheapest, fast
  }
};

export const DEFAULT_MODELS = {
  embedding: OPENAI_MODELS.EMBEDDING.SMALL,
  chat: OPENAI_MODELS.CHAT.GPT4O_MINI
};
