/**
 * AIVA Fabric Subnet Auto-Discovery & Host Resolution Helper
 * 
 * Automatically resolves PC-B (:5050) across active subnets, Wi-Fi shifts,
 * and hotspot IP ranges (e.g. 10.16.177.x, 10.84.73.x, 192.168.1.x, 192.168.43.x).
 */

const KNOWN_PCB_CANDIDATES = [
  'http://10.16.177.59:5050',
  'http://10.84.73.59:5050',
  'http://192.168.1.59:5050',
  'http://192.168.43.59:5050',
  'http://127.0.0.1:5050'
];

let cachedPcbBaseUrl: string | null = 'http://10.16.177.59:5050';

export async function resolvePcbBaseUrl(forceRefresh = false): Promise<string> {
  if (cachedPcbBaseUrl && !forceRefresh) {
    return cachedPcbBaseUrl;
  }

  // Probe candidates with low-latency abort signal (800ms)
  const probeCandidate = async (base: string): Promise<string | null> => {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 800);
      const res = await fetch(`${base}/health`, { signal: controller.signal });
      clearTimeout(id);
      if (res.ok) {
        return base;
      }
    } catch (_e) {}
    return null;
  };

  try {
    const winner = await Promise.any(
      KNOWN_PCB_CANDIDATES.map((cand) =>
        probeCandidate(cand).then((res) => {
          if (!res) throw new Error('Not reachable');
          return res;
        })
      )
    );
    cachedPcbBaseUrl = winner;
    console.log(`[Fabric Discovery] Resolved PC-B active host: ${winner}`);
    return winner;
  } catch (_e) {
    // Default to current active subnet host if discovery probes exhaust
    const fallback = 'http://10.16.177.59:5050';
    cachedPcbBaseUrl = fallback;
    return fallback;
  }
}

export function getCachedPcbBaseUrl(): string {
  return cachedPcbBaseUrl || 'http://10.16.177.59:5050';
}
