import express from 'express';
import http from 'http';
import net from 'net';
import { createRateLimiter } from '../middleware/rate-limiter.middleware.js';
import { setCustomRedisClient } from '../config/redis.js';

async function runRateLimitingSuite() {
  console.log('====================================================');
  console.log('🚦 Production-Safe Hybrid Rate Limiting Suite');
  console.log('====================================================\n');

  let passed = 0;
  function assert(cond: boolean, desc: string) {
    if (cond) {
      passed++;
      console.log(`  ✅ ${desc}`);
    } else {
      console.error(`  ❌ FAILED: ${desc}`);
      process.exit(1);
    }
  }

  // --------------------------------------------------------------------------
  // TEST SUITE 1: Standalone In-Memory Rate Limiting & 429 Retry-After Headers
  // --------------------------------------------------------------------------
  console.log('▶️ Test Suite 1: Local In-Memory Sliding Window & Headers');
  setCustomRedisClient(null); // Ensure fallback memory store

  const app1 = express();
  app1.set('trust proxy', 1);
  const testLimiter = createRateLimiter({
    windowMs: 5000, // 5s window
    maxRequests: 3,
    prefix: 'test-mem',
    message: 'Custom rate limit exceeded.',
  });

  app1.get('/test', testLimiter, (req, res) => res.json({ ok: true }));
  app1.use((err: any, req: any, res: any, next: any) => {
    res.status(err.statusCode || 500).json({ error: err.message });
  });

  const server1 = http.createServer(app1);
  await new Promise<void>((r) => server1.listen(0, '127.0.0.1', () => r()));
  const port1 = (server1.address() as net.AddressInfo).port;

  try {
    // 3 requests from IP 198.51.100.1
    for (let i = 1; i <= 3; i++) {
      const res = await fetch(`http://127.0.0.1:${port1}/test`, {
        headers: { 'x-forwarded-for': '198.51.100.1' },
      });
      assert(res.status === 200, `Request #${i} from IP 1 succeeded with 200`);
    }

    // 4th request from same IP should be blocked
    const resBlocked = await fetch(`http://127.0.0.1:${port1}/test`, {
      headers: { 'x-forwarded-for': '198.51.100.1' },
    });
    assert(resBlocked.status === 429, 'Request #4 from same IP blocked with 429');
    const retryAfter = resBlocked.headers.get('retry-after');
    assert(Boolean(retryAfter) && Number(retryAfter) > 0, `Retry-After header present: ${retryAfter}s`);
    const jsonBlocked = await resBlocked.json();
    assert(jsonBlocked.error === 'Custom rate limit exceeded.', 'Custom message preserved');

    // Request from different IP (198.51.100.2) should still succeed
    const resIp2 = await fetch(`http://127.0.0.1:${port1}/test`, {
      headers: { 'x-forwarded-for': '198.51.100.2' },
    });
    assert(resIp2.status === 200, 'Independent IP 198.51.100.2 is not blocked');
  } finally {
    await new Promise<void>((r) => server1.close(() => r()));
  }

  // --------------------------------------------------------------------------
  // TEST SUITE 2: Multi-Instance Distributed Rate Limiting via Shared Store
  // --------------------------------------------------------------------------
  console.log('\n▶️ Test Suite 2: Simulated Multi-Instance Coordination (Render cluster)');

  // Shared in-memory mock Redis database simulating Upstash Redis
  const sharedRedisDb = new Map<string, { value: number; expireAt: number }>();
  const mockRedisClient = {
    eval: async (script: string, keys: string[], args: any[]) => {
      const key = keys[0];
      const windowMs = Number(args[0]) || 60000;
      const now = Date.now();
      const existing = sharedRedisDb.get(key);

      if (!existing || now > existing.expireAt) {
        sharedRedisDb.set(key, { value: 1, expireAt: now + windowMs });
        return [1, windowMs];
      }

      existing.value += 1;
      const ttl = Math.max(0, existing.expireAt - now);
      return [existing.value, ttl];
    },
  };

  setCustomRedisClient(mockRedisClient);

  // Instance A
  const appA = express();
  appA.set('trust proxy', 1);
  const limiterA = createRateLimiter({
    windowMs: 10000,
    maxRequests: 4,
    prefix: 'dist-test',
    message: 'Cluster rate limit reached.',
  });
  appA.get('/api', limiterA, (req, res) => res.json({ instance: 'A' }));
  appA.use((err: any, req: any, res: any, next: any) => {
    res.status(err.statusCode || 500).json({ error: err.message });
  });

  // Instance B (different process/node sharing the same Redis client)
  const appB = express();
  appB.set('trust proxy', 1);
  const limiterB = createRateLimiter({
    windowMs: 10000,
    maxRequests: 4,
    prefix: 'dist-test',
    message: 'Cluster rate limit reached.',
  });
  appB.get('/api', limiterB, (req, res) => res.json({ instance: 'B' }));
  appB.use((err: any, req: any, res: any, next: any) => {
    res.status(err.statusCode || 500).json({ error: err.message });
  });

  const serverA = http.createServer(appA);
  const serverB = http.createServer(appB);
  await new Promise<void>((r) => serverA.listen(0, '127.0.0.1', () => r()));
  await new Promise<void>((r) => serverB.listen(0, '127.0.0.1', () => r()));
  const portA = (serverA.address() as net.AddressInfo).port;
  const portB = (serverB.address() as net.AddressInfo).port;

  try {
    const clientIp = '203.0.113.88';

    // 2 requests sent to Instance A
    const resA1 = await fetch(`http://127.0.0.1:${portA}/api`, { headers: { 'x-forwarded-for': clientIp } });
    const resA2 = await fetch(`http://127.0.0.1:${portA}/api`, { headers: { 'x-forwarded-for': clientIp } });
    assert(resA1.status === 200, 'Instance A Request #1 passed (Count=1)');
    assert(resA2.status === 200, 'Instance A Request #2 passed (Count=2)');

    // 2 requests sent to Instance B
    const resB1 = await fetch(`http://127.0.0.1:${portB}/api`, { headers: { 'x-forwarded-for': clientIp } });
    const resB2 = await fetch(`http://127.0.0.1:${portB}/api`, { headers: { 'x-forwarded-for': clientIp } });
    assert(resB1.status === 200, 'Instance B Request #3 passed via shared state (Count=3)');
    assert(resB2.status === 200, 'Instance B Request #4 passed via shared state (Count=4)');

    // 5th request sent to Instance A: MUST BE BLOCKED ACROSS THE ENTIRE CLUSTER!
    const resA3 = await fetch(`http://127.0.0.1:${portA}/api`, { headers: { 'x-forwarded-for': clientIp } });
    assert(resA3.status === 429, 'Instance A blocks Request #5 with 429 because Instance B consumed quota!');

    // 6th request sent to Instance B: MUST ALSO BE BLOCKED!
    const resB3 = await fetch(`http://127.0.0.1:${portB}/api`, { headers: { 'x-forwarded-for': clientIp } });
    assert(resB3.status === 429, 'Instance B blocks Request #6 with 429 consistently!');
  } finally {
    await new Promise<void>((r) => serverA.close(() => r()));
    await new Promise<void>((r) => serverB.close(() => r()));
  }

  // --------------------------------------------------------------------------
  // TEST SUITE 3: Fault-Tolerance & Graceful Fallback on Redis Outage
  // --------------------------------------------------------------------------
  console.log('\n▶️ Test Suite 3: Fault-Tolerance & Graceful Fallback on Redis Outage');

  // Inject a broken Redis client that simulates network timeout / outage
  const failingRedisClient = {
    eval: async () => {
      throw new Error('Connection refused by Upstash edge node');
    },
  };

  setCustomRedisClient(failingRedisClient);

  const appFail = express();
  appFail.set('trust proxy', 1);
  const limiterFail = createRateLimiter({
    windowMs: 5000,
    maxRequests: 2,
    prefix: 'fail-test',
    message: 'Rate limit during outage.',
  });
  appFail.get('/api', limiterFail, (req, res) => res.json({ ok: true }));
  appFail.use((err: any, req: any, res: any, next: any) => {
    res.status(err.statusCode || 500).json({ error: err.message });
  });

  const serverFail = http.createServer(appFail);
  await new Promise<void>((r) => serverFail.listen(0, '127.0.0.1', () => r()));
  const portFail = (serverFail.address() as net.AddressInfo).port;

  try {
    const res1 = await fetch(`http://127.0.0.1:${portFail}/api`, { headers: { 'x-forwarded-for': '1.2.3.4' } });
    assert(res1.status === 200, 'Gracefully served request despite Redis failure');

    const res2 = await fetch(`http://127.0.0.1:${portFail}/api`, { headers: { 'x-forwarded-for': '1.2.3.4' } });
    assert(res2.status === 200, 'Served 2nd request via in-memory fallback');

    const res3 = await fetch(`http://127.0.0.1:${portFail}/api`, { headers: { 'x-forwarded-for': '1.2.3.4' } });
    assert(res3.status === 429, 'Enforced rate limit via in-memory fallback during Redis outage!');
  } finally {
    await new Promise<void>((r) => serverFail.close(() => r()));
    setCustomRedisClient(null); // Reset
  }

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passed} RATE LIMITING VERIFICATION TESTS PASSED!`);
  console.log('====================================================');
}

runRateLimitingSuite().catch((err) => {
  console.error('❌ Rate limiting test error:', err);
  process.exit(1);
});
