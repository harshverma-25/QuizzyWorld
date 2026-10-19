import express from 'express';
import http from 'http';
import net from 'net';

async function runProxyTrustVerification() {
  console.log('====================================================');
  console.log('🛡️ Proxy Trust & Spoofed IP Regression Verification');
  console.log('====================================================\n');

  // Verify resolved proxy-addr version in node_modules
  const proxyAddrPkg = await import('proxy-addr/package.json', { with: { type: 'json' } }).catch(() => null);
  const proxyAddrVersion = proxyAddrPkg?.default?.version || 'unknown';
  console.log(`📦 Installed proxy-addr version: ${proxyAddrVersion}`);

  if (proxyAddrVersion !== '2.0.8' && !proxyAddrVersion.startsWith('2.0.8')) {
    console.error(`❌ Expected proxy-addr >= 2.0.8, found ${proxyAddrVersion}`);
    process.exit(1);
  }
  console.log('✅ proxy-addr version satisfies patched release requirement (>= 2.0.8)\n');

  // Create an Express instance configured identical to server/src/app.ts
  const app = express();
  app.set('trust proxy', 1);

  let capturedReq: express.Request | null = null;
  app.get('/test-ip', (req, res) => {
    capturedReq = req;
    res.json({
      ip: req.ip,
      ips: req.ips,
      remoteAddress: req.socket.remoteAddress,
      header: req.headers['x-forwarded-for'],
    });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as net.AddressInfo).port;

  try {
    // SCENARIO 1: Legitimate client behind 1 reverse proxy (e.g. Render Load Balancer)
    // Reverse proxy forwards request with: X-Forwarded-For: <real_client_ip>
    console.log('▶️ Scenario 1: Legitimate Client through Render reverse proxy');
    const res1 = await fetch(`http://127.0.0.1:${port}/test-ip`, {
      headers: {
        'x-forwarded-for': '203.0.113.195',
      },
    });
    const data1 = await res1.json();
    console.log(`  Client IP determined by Express: ${data1.ip}`);
    if (data1.ip === '203.0.113.195') {
      console.log('  ✅ Correctly detected real client IP through 1 trusted reverse proxy hop\n');
    } else {
      throw new Error(`Expected 203.0.113.195, got ${data1.ip}`);
    }

    // SCENARIO 2: Attacker injects a spoofed IP before the real client IP
    // Reverse proxy appends the real client IP to the existing header:
    // Header becomes: "spoofed_ip, real_client_ip"
    console.log('▶️ Scenario 2: Attacker injects spoofed IP in X-Forwarded-For');
    const res2 = await fetch(`http://127.0.0.1:${port}/test-ip`, {
      headers: {
        'x-forwarded-for': '8.8.8.8, 203.0.113.195',
      },
    });
    const data2 = await res2.json();
    console.log(`  Header received: "8.8.8.8, 203.0.113.195"`);
    console.log(`  Client IP determined by Express: ${data2.ip}`);
    if (data2.ip === '203.0.113.195') {
      console.log('  ✅ Spoofed 8.8.8.8 rejected; real client IP 203.0.113.195 enforced!\n');
    } else {
      throw new Error(`VULNERABILITY: Express trusted spoofed IP 8.8.8.8 instead of 203.0.113.195!`);
    }

    // SCENARIO 3: IPv4-mapped IPv6 trust spoofing exploit attempt (GHSA-jqcg-44mw-7w3h)
    console.log('▶️ Scenario 3: IPv4-mapped IPv6 trust bypass exploit attempt');
    const res3 = await fetch(`http://127.0.0.1:${port}/test-ip`, {
      headers: {
        'x-forwarded-for': '::ffff:127.0.0.1, 203.0.113.195',
      },
    });
    const data3 = await res3.json();
    console.log(`  Header received: "::ffff:127.0.0.1, 203.0.113.195"`);
    console.log(`  Client IP determined by Express: ${data3.ip}`);
    if (data3.ip === '203.0.113.195') {
      console.log('  ✅ Exploit thwarted; Express trusted hop calculation is safe.\n');
    } else {
      throw new Error(`VULNERABILITY: IPv4-mapped IPv6 bypass succeeded! Got: ${data3.ip}`);
    }

    // SCENARIO 4: Multiple spoofed IP chain
    console.log('▶️ Scenario 4: Multiple spoofed proxies in chain');
    const res4 = await fetch(`http://127.0.0.1:${port}/test-ip`, {
      headers: {
        'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3, 198.51.100.50',
      },
    });
    const data4 = await res4.json();
    console.log(`  Client IP determined: ${data4.ip}`);
    if (data4.ip === '198.51.100.50') {
      console.log('  ✅ Express correctly trusts exactly 1 proxy hop and takes immediate client IP!\n');
    } else {
      throw new Error(`Expected 198.51.100.50, got ${data4.ip}`);
    }

    console.log('====================================================');
    console.log('🎉 ALL PROXY TRUST REGRESSION TESTS PASSED (4/4)');
    console.log('====================================================');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

runProxyTrustVerification().catch((err) => {
  console.error('❌ Proxy trust verification failed:', err);
  process.exit(1);
});
