/**
 * Redis client helper for game services
 */

const { createClient } = require('redis');
const { trace, context } = require('@opentelemetry/api');

// Redis connection configuration
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

let redisClient = null;

/**
 * Initialize Redis client
 */
function initializeRedis() {
  if (redisClient) {
    return redisClient;
  }

  redisClient = createClient({
    socket: {
      host: REDIS_HOST,
      port: REDIS_PORT,
    },
    password: REDIS_PASSWORD,
  });

  // Redis connection handling
  redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
  });

  redisClient.on('connect', () => {
    console.log(`✅ Connected to Redis at ${REDIS_HOST}:${REDIS_PORT}`);
  });

  redisClient.on('ready', () => {
    console.log('✅ Redis client ready');
  });

  // Connect to Redis
  (async () => {
    try {
      await redisClient.connect();
      console.log('✅ Redis connection established');
    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error);
      console.warn('⚠️  Falling back to in-memory storage');
      redisClient = null;
    }
  })();

  return redisClient;
}

/**
 * Get value from Redis
 */
async function get(key, defaultValue = null) {
  const tracer = trace.getTracer('redis-client');
  const span = tracer.startSpan('redis.get', {
    attributes: {
      'db.system': 'redis',
      'db.operation': 'get',
      'db.redis.key': key,
    },
  });
  
  try {
    if (!redisClient || !redisClient.isReady) {
      span.setAttribute('db.redis.connection', false);
      span.end();
      return defaultValue;
    }

    const value = await redisClient.get(key);
    span.setAttribute('db.redis.value_found', value !== null);
    span.setStatus({ code: 1 }); // OK
    span.end();
    return value !== null ? value : defaultValue;
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    span.end();
    console.error('Redis get error:', error);
    return defaultValue;
  }
}

/**
 * Set value in Redis
 */
async function set(key, value, expirationSeconds = null) {
  const tracer = trace.getTracer('redis-client');
  const span = tracer.startSpan('redis.set', {
    attributes: {
      'db.system': 'redis',
      'db.operation': expirationSeconds ? 'setex' : 'set',
      'db.redis.key': key,
      'db.redis.value_length': String(value).length,
    },
  });
  
  try {
    if (!redisClient || !redisClient.isReady) {
      span.setAttribute('db.redis.connection', false);
      span.setStatus({ code: 2, message: 'Redis client not ready' });
      span.end();
      return false;
    }

    if (expirationSeconds) {
      await redisClient.setEx(key, expirationSeconds, value);
      span.setAttribute('db.redis.expiration_seconds', expirationSeconds);
    } else {
      await redisClient.set(key, value);
    }
    span.setStatus({ code: 1 }); // OK
    span.end();
    return true;
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    span.end();
    console.error('Redis set error:', error);
    return false;
  }
}

/**
 * Delete key from Redis
 */
async function del(key) {
  const tracer = trace.getTracer('redis-client');
  const span = tracer.startSpan('redis.del', {
    attributes: {
      'db.system': 'redis',
      'db.operation': 'del',
      'db.redis.key': key,
    },
  });
  
  try {
    if (!redisClient || !redisClient.isReady) {
      span.setAttribute('db.redis.connection', false);
      span.setStatus({ code: 2, message: 'Redis client not ready' });
      span.end();
      return false;
    }

    await redisClient.del(key);
    span.setStatus({ code: 1 }); // OK
    span.end();
    return true;
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    span.end();
    console.error('Redis delete error:', error);
    return false;
  }
}

/**
 * Check if key exists in Redis
 */
async function exists(key) {
  if (!redisClient || !redisClient.isReady) {
    return false;
  }

  try {
    const result = await redisClient.exists(key);
    return result === 1;
  } catch (error) {
    console.error('Redis exists error:', error);
    return false;
  }
}

/**
 * Get multiple keys
 */
async function mGet(keys) {
  if (!redisClient || !redisClient.isReady) {
    return keys.map(() => null);
  }

  try {
    return await redisClient.mGet(keys);
  } catch (error) {
    console.error('Redis mGet error:', error);
    return keys.map(() => null);
  }
}

/**
 * Set multiple key-value pairs
 */
async function mSet(keyValuePairs) {
  if (!redisClient || !redisClient.isReady) {
    return false;
  }

  try {
    await redisClient.mSet(keyValuePairs);
    return true;
  } catch (error) {
    console.error('Redis mSet error:', error);
    return false;
  }
}

/**
 * Close Redis connection
 */
async function close() {
  if (redisClient && redisClient.isReady) {
    try {
      await redisClient.quit();
      console.log('Redis connection closed');
    } catch (error) {
      console.error('Error closing Redis connection:', error);
    }
  }
}

module.exports = {
  initializeRedis,
  get,
  set,
  del,
  exists,
  mGet,
  mSet,
  close,
  getClient: () => redisClient,
};

