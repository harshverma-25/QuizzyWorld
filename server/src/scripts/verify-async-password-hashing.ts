import {
  hashPassword,
  verifyPassword,
  hashPasswordSync,
  verifyPasswordSync,
  PBKDF2_ITERATIONS,
} from '../shared/utils/crypto-auth.js';

async function runAsyncPasswordSuite() {
  console.log('====================================================');
  console.log('🔐 Asynchronous Password Hashing & Event-Loop Suite');
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

  // 1. Basic Async Hash & Verify
  console.log('▶️ Test 1: Basic Asynchronous Hashing & Verification');
  const password = 'SuperSecretPassword!2026';
  const hash = await hashPassword(password);
  assert(typeof hash === 'string', 'hashPassword returns string');
  assert(hash.includes(':'), 'Hash uses salt:hash format');
  const [salt, rawHash] = hash.split(':');
  assert(salt.length === 32, 'Salt is 16 bytes (32 hex characters)');
  assert(rawHash.length === 128, 'Hash is 64 bytes (128 hex characters for SHA-512)');

  const isValid = await verifyPassword(password, hash);
  assert(isValid === true, 'Valid password verifies to true');

  // 2. Incorrect Password Rejection
  console.log('\n▶️ Test 2: Incorrect Password Rejection');
  const isWrongValid = await verifyPassword('WrongPassword123', hash);
  assert(isWrongValid === false, 'Incorrect password safely returns false');

  // 3. Malformed Hash Safety
  console.log('\n▶️ Test 3: Malformed Hash Safety & Graceful Failure');
  assert((await verifyPassword(password, '')) === false, 'Empty string returns false');
  assert((await verifyPassword(password, 'no_colon_here')) === false, 'Missing colon returns false');
  assert((await verifyPassword(password, ':')) === false, 'Only colon returns false');
  assert((await verifyPassword(password, 'short_salt:short_hash')) === false, 'Short salt/hash returns false');
  assert((await verifyPassword(password, `${salt}:not_a_valid_hex_hash_zzzz`)) === false, 'Non-hex characters fail safely');
  assert((await verifyPassword('', hash)) === false, 'Empty password fails safely');
  assert((await verifyPassword(null as any, hash)) === false, 'Null password fails safely');
  assert((await verifyPassword(password, null as any)) === false, 'Null hash fails safely');

  // 4. Backward Compatibility with Legacy Sync Hashes
  console.log('\n▶️ Test 4: Backward Compatibility with Legacy Sync Hashes');
  const legacySyncHash = hashPasswordSync('LegacyPassword_123');
  const legacyAsyncVerify = await verifyPassword('LegacyPassword_123', legacySyncHash);
  assert(legacyAsyncVerify === true, 'Asynchronous verifyPassword verifies legacy synchronous hash');

  const asyncHash = await hashPassword('NewAsyncPassword_456');
  const syncVerify = verifyPasswordSync('NewAsyncPassword_456', asyncHash);
  assert(syncVerify === true, 'Synchronous verifyPasswordSync verifies new asynchronous hash');

  // 5. Event Loop Non-Blocking Benchmark
  console.log('\n▶️ Test 5: Event Loop Non-Blocking Verification Under Load');
  let maxLoopLag = 0;
  let timerTicks = 0;
  let lastTick = Date.now();

  const interval = setInterval(() => {
    const now = Date.now();
    const lag = now - lastTick - 5; // Expected 5ms
    if (lag > maxLoopLag) maxLoopLag = lag;
    lastTick = now;
    timerTicks++;
  }, 5);

  const startTime = Date.now();
  // Fire 15 concurrent password hashes simultaneously
  const testPromises = Array.from({ length: 15 }, (_, i) =>
    hashPassword(`ConcurrentPassword_${i}_Test`)
  );
  const results = await Promise.all(testPromises);
  const elapsedMs = Date.now() - startTime;
  clearInterval(interval);

  assert(results.length === 15, 'All 15 concurrent hashes computed successfully');
  console.log(`  ⏱️ 15 concurrent pbkdf2 (${PBKDF2_ITERATIONS} iterations) completed in ${elapsedMs}ms`);
  console.log(`  ⏱️ Event loop timer ticked ${timerTicks} times during hashing`);
  console.log(`  ⏱️ Maximum event loop lag observed: ${maxLoopLag}ms`);
  assert(timerTicks >= 3, 'Event loop continued processing timers during concurrent hashing (libuv offload active)');
  assert(maxLoopLag < 60, `Event loop lag (${maxLoopLag}ms) remains well under starvation threshold`);

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passed} ASYNC PASSWORD HASHING TESTS PASSED!`);
  console.log('====================================================');
}

runAsyncPasswordSuite().catch((err) => {
  console.error('❌ Async password suite error:', err);
  process.exit(1);
});
