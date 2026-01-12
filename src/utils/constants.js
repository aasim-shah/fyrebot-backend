// Configuration constants for the SaaS platform

export const PLANS = {
  FREE: {
    name: 'free',
    price: 0,
    limits: {
      apiCallsPerMonth: 1000,
      sectionsPerTenant: 10,
      tokensPerRequest: 2000,
      requestsPerMinute: 10,
      requestsPerHour: 100
    }
  },
  PRO: {
    name: 'pro',
    price: 29,
    limits: {
      apiCallsPerMonth: 10000,
      sectionsPerTenant: 100,
      tokensPerRequest: 4000,
      requestsPerMinute: 30,
      requestsPerHour: 500
    }
  },
  ENTERPRISE: {
    name: 'enterprise',
    price: 299,
    limits: {
      apiCallsPerMonth: 100000,
      sectionsPerTenant: 1000,
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
