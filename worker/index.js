import { createClient, fetchUserData, fetchOrgData, GitHubError, NAME_RE, FIRST_YEAR } from '../public/github.js';

const HOUR = 3600;

let tokenCheck = null;

async function hasNoScopes(token) {
  const res = await fetch('https://api.github.com/rate_limit', {
    headers: { Authorization: `bearer ${token}`, 'User-Agent': 'github-wrapped' },
  });
  const scopes = res.headers.get('x-oauth-scopes');
  return res.ok && scopes !== null && scopes.trim() === '';
}

function publicOnly(data) {
  if (data.kind === 'org') {
    const hidden = new Set(data.repos.filter((r) => r.isPrivate).map((r) => r.nameWithOwner));
    return { ...data, repos: data.repos.filter((r) => !r.isPrivate), commits: data.commits.filter((c) => !hidden.has(c.repo)) };
  }
  const cc = data.user.contributionsCollection;
  const hidden = new Set(cc.commitContributionsByRepository.filter((r) => r.repository.isPrivate).map((r) => r.repository.nameWithOwner));
  return {
    ...data,
    user: {
      ...data.user,
      contributionsCollection: {
        ...cc,
        commitContributionsByRepository: cc.commitContributionsByRepository.filter((r) => !r.repository.isPrivate),
      },
    },
    commits: data.commits.filter((c) => !hidden.has(c.repo)),
  };
}

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
  const cacheKey = `v2:${kind}:${name.toLowerCase()}:${year}`;
  const cacheHeaders = { 'Cache-Control': `public, max-age=${Math.min(ttl, HOUR)}` };

  tokenCheck ??= hasNoScopes(env.GITHUB_TOKEN).catch(() => false);
  if (!(await tokenCheck)) {
    tokenCheck = null;
    return json({ error: 'Public mode is temporarily unavailable. Use a token instead.' }, 503);
  }

  const cached = await env.CACHE?.get(cacheKey);
  if (cached) return new Response(cached, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Cache': 'HIT', ...cacheHeaders } });

  try {
    const gql = createClient(env.GITHUB_TOKEN, { userAgent: 'github-wrapped' });
    const data = publicOnly(kind === 'org' ? await fetchOrgData(gql, name, year) : await fetchUserData(gql, name, year));
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
