const TARGET_URL = 'https://nexuscompendium.com/api/currently/herorotation+bgrotation';

export default {
  async fetch(request, env, ctx) {
    // Handle preflight requests cleanly
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const cache = caches.default;
    const cacheKey = new Request(TARGET_URL, { method: 'GET' });
    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const upstream = await fetch(TARGET_URL, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'HeroesVault-Rotation-Proxy/1.0',
        },
      });

      if (!upstream.ok) {
        return new Response(JSON.stringify({ error: `Upstream HTTP ${upstream.status}` }), {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      const bodyText = await upstream.text();
      const response = new Response(bodyText, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          // Cache for 1 hour at the edge since rotations update weekly
          'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        },
      });

      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Upstream fetch failed' }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
};
