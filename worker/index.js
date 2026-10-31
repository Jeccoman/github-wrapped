import { createClient, fetchUserData, fetchOrgData, GitHubError, NAME_RE, FIRST_YEAR } from '../public/github.js';

const HOUR = 3600;

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

async function handleApi(request, env, ctx, kind) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
  if (!env.GITHUB_TOKEN) return json({ error: 'Public mode is not configured. Add a token instead.' }, 503);

  const url = new URL(request.url);
  const name = (url.searchParams.get(kind === 'org' ? 'org' : 'login') ?? '').trim();
  const year = Number(url.searchParams.get('year'));
  const thisYear = new Date().getUTCFullYear();
  if (!NAME_RE.test(name)) return json({ error: "That doesn't look like a GitHub name." }, 400);
  if (!Number.isInteger(year) || year < FIRST_YEAR || year > thisYear) return json({ error: 'Pick a year from the list.' }, 400);

  const ttl = year === thisYear ? 6 * HOUR : 7 * 24 * HOUR;
  const cacheKey = `v1:${kind}:${name.toLowerCase()}:${year}`;
  const cacheHeaders = { 'Cache-Control': `public, max-age=${Math.min(ttl, HOUR)}` };

  const cached = await env.CACHE?.get(cacheKey);
  if (cached) return new Response(cached, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Cache': 'HIT', ...cacheHeaders } });

  try {
    const gql = createClient(env.GITHUB_TOKEN, { userAgent: 'github-wrapped' });
    const data = kind === 'org' ? await fetchOrgData(gql, name, year) : await fetchUserData(gql, name, year);
    const body = JSON.stringify(data);
    if (env.CACHE) ctx.waitUntil(env.CACHE.put(cacheKey, body, { expirationTtl: ttl }));
    return new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Cache': 'MISS', ...cacheHeaders } });
  } catch (err) {
    if (err instanceof GitHubError && err.status < 500) return json({ error: err.message }, err.status);
    console.error(err);
    return json({ error: 'GitHub is busy right now. Try again in a minute.' }, 502);
  }
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/user') return handleApi(request, env, ctx, 'user');
    if (pathname === '/api/org') return handleApi(request, env, ctx, 'org');
    if (pathname.startsWith('/api/')) return json({ error: 'Not found.' }, 404);
    return env.ASSETS.fetch(request);
  },
};
