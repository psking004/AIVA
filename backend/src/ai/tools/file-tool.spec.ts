import { FileTool } from './file.tool';
import { WeatherService } from '../kernel/weather.service';

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

async function runTestSuite() {
  console.log('\n============================================================');
  console.log('AIVA P7/P9 TOOLS & SECURITY SPECIFICATION TEST SUITE');
  console.log('============================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => Promise<void> | void) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`PASS [${total}] ${name}`);
    } catch (err: any) {
      console.error(`FAIL [${total}] ${name}: ${err.message}`);
      throw err;
    }
  }

  const fileTool = new FileTool();

  // Test 1: Normal workspace file operations
  await test('FileTool: Allows normal workspace file operations', async () => {
    const res = await fileTool.execute('user-1', 'exists', { filePath: 'package.json' });
    assert(res.success === true, 'exists must succeed');
    assert(res.exists === true, 'package.json must exist in workspace');
  });

  // Test 2: FileTool blocks parent traversal
  await test('FileTool: Blocks parent directory traversal (../../)', async () => {
    let blocked = false;
    try {
      await fileTool.execute('user-1', 'read', { filePath: '../../Windows/System32/drivers/etc/hosts' });
    } catch (err: any) {
      if (err.message.includes('Security boundary violation')) {
        blocked = true;
      }
    }
    assert(blocked, 'Parent traversal must throw Security boundary violation');
  });

  // Test 3: FileTool blocks absolute path outside workspace
  await test('FileTool: Blocks absolute paths outside workspace', async () => {
    let blocked = false;
    try {
      await fileTool.execute('user-1', 'read', { filePath: 'C:\\Windows\\System32\\notepad.exe' });
    } catch (err: any) {
      if (err.message.includes('Security boundary violation')) {
        blocked = true;
      }
    }
    assert(blocked, 'Absolute path outside workspace must throw Security boundary violation');
  });

  // Test 4: FileTool blocks Windows-style relative traversal
  await test('FileTool: Blocks Windows-style relative traversal (..\\..\\)', async () => {
    let blocked = false;
    try {
      await fileTool.execute('user-1', 'read', { filePath: '..\\..\\..\\Windows\\win.ini' });
    } catch (err: any) {
      if (err.message.includes('Security boundary violation')) {
        blocked = true;
      }
    }
    assert(blocked, 'Windows relative traversal must throw Security boundary violation');
  });

  // Test 5: Weather Service never invents/estimates synthetic weather
  await test('WeatherService: Never fabricates estimated weather when live providers fail', async () => {
    const weather = new WeatherService();
    // Simulate provider failure without cache
    // Mock fetch to simulate failure
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => {
        throw new Error('All weather endpoints down 503');
      };
      let caught = false;
      try {
        await weather.getWeather('Bengaluru');
      } catch (err: any) {
        caught = true;
        assert(
          err.message.includes("I can't retrieve live weather right now"),
          `Expected clean failure message, got: ${err.message}`
        );
        assert(!err.message.includes('Estimated'), 'Must never fabricate estimated weather');
      }
      assert(caught, 'Must throw when live weather is unavailable and no cache exists');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // Test 6: Weather Service uses timestamped cache if available
  await test('WeatherService: Returns timestamped cache with clear notice if providers fail', async () => {
    const weather = new WeatherService();
    // Pre-populate cache
    const mockCached = {
      data: {
        location: 'Bengaluru',
        temperatureC: 24,
        temperatureF: 75,
        condition: 'Partly Cloudy',
        humidityPercent: 65,
        windSpeedKmh: 10,
      } as any,
      timestamp: Date.now() - 120000, // 2 mins ago
    };
    (WeatherService as any).cache.set('bengaluru', mockCached);

    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => {
        throw new Error('All weather endpoints down 503');
      };
      const result = await weather.getWeather('Bengaluru');
      assert(result.source === 'cache', 'Must indicate cache source');
      assert(
        result.summary.includes("I can't retrieve live weather right now. According to earlier recorded data"),
        'Must explicitly notify user of cached status'
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  console.log(`\nP7/P9 SPECIFICATION RESULTS: ${passed}/${total} passed\n`);
}

runTestSuite().catch((e) => {
  console.error(e);
  process.exit(1);
});
