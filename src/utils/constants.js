// Configuration constants for the SaaS platform

export const PLANS = {
  FREE: {
    name: 'free',
    price: 0,
    limits: {
      apiCallsPerMonth: 1000,
      storageLimit: 100 * 1024 * 1024, // 100MB
      vectorLimit: 100000, // 100K vectors
      tokensPerRequest: 2000,
      requestsPerMinute: 10,
      requestsPerHour: 100
    }
  },
  PRO: {
    name: 'pro',
    price: 29,
    limits: {
      apiCallsPerMonth: 50000,
      storageLimit: 10 * 1024 * 1024 * 1024, // 10GB
      vectorLimit: 1000000, // 1M vectors
      tokensPerRequest: 4000,
      requestsPerMinute: 30,
      requestsPerHour: 500
    }
  },
  ENTERPRISE: {
    name: 'enterprise',
    price: 299,
    limits: {
      apiCallsPerMonth: 500000,
      storageLimit: 100 * 1024 * 1024 * 1024, // 100GB
      vectorLimit: 10000000, // 10M vectors
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
