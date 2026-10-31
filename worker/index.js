import { createClient, fetchUserData, fetchOrgData, GitHubError, NAME_RE, FIRST_YEAR } from '../public/github.js';
import { computeUserStats, computeOrgStats } from '../public/stats.js';
import { userCard, orgCard, defaultCard } from './og.js';

const HOUR = 3600;
const DAY = 24 * HOUR;
const JSON_TYPE = 'application/json; charset=utf-8';
const ALLOWED_SCOPES = new Set(['read:org']);
const tokenChecks = new Map();
const inflight = new Map();

const thisYear = () => new Date().getUTCFullYear();
const freshFor = (year) => (year === thisYear() ? 6 * HOUR : 7 * DAY);
const keepFor = (year) => (year === thisYear() ? 14 * DAY : 60 * DAY);
const fmt = (n) => Math.round(n).toLocaleString('en-US');

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': JSON_TYPE, ...headers } });
}

function track(env, route, kind, status, year) {
  try {
    env.WRAPS?.writeDataPoint({ blobs: [route, kind, status], doubles: [year], indexes: [route] });
  } catch {}
}

async function hasOnlyPublicScopes(token) {
  const res = await fetch('https://api.github.com/rate_limit', {
    headers: { Authorization: `bearer ${token}`, 'User-Agent': 'github-wrapped' },
  });
  const header = res.headers.get('x-oauth-scopes');
  if (!res.ok || header === null) return false;
  return header.split(',').map((s) => s.trim()).filter(Boolean).every((s) => ALLOWED_SCOPES.has(s));
}

async function usableTokens(env) {
  const all = [env.GITHUB_TOKEN, ...(env.GITHUB_TOKENS ?? '').split(',')].map((t) => t?.trim()).filter(Boolean);
  const unique = [...new Set(all)];
  const ok = await Promise.all(unique.map((t) => {
    if (!tokenChecks.has(t)) tokenChecks.set(t, hasOnlyPublicScopes(t).catch(() => false));
    return tokenChecks.get(t);
  }));
  unique.forEach((t, i) => { if (!ok[i]) tokenChecks.delete(t); });
  return unique.filter((_, i) => ok[i]);
}

function hashOf(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
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

async function fetchFresh(kind, name, year, tokens) {
  const start = hashOf(name.toLowerCase()) % tokens.length;
  let lastError;
  for (let k = 0; k < tokens.length; k++) {
    const gql = createClient(tokens[(start + k) % tokens.length], { userAgent: 'github-wrapped' });
    try {
      return publicOnly(kind === 'org' ? await fetchOrgData(gql, name, year) : await fetchUserData(gql, name, year));
    } catch (err) {
      lastError = err;
      if (!(err instanceof GitHubError && err.status === 429)) throw err;
    }
  }
  throw lastError;
}

const cacheKey = (kind, name, year) => `v3:${kind}:${name.toLowerCase()}:${year}`;

async function getData(kind, name, year, { env, ctx, request }) {
  const key = cacheKey(kind, name, year);
  const stored = await env.CACHE?.get(key, 'json');
  if (stored && Date.now() - stored.at < freshFor(year) * 1000) return { data: stored.data, status: 'HIT' };

  if (env.LIMITER) {
    const { success } = await env.LIMITER.limit({ key: request.headers.get('cf-connecting-ip') ?? 'anon' });
    if (!success) {
      if (stored) return { data: stored.data, status: 'STALE' };
      throw new GitHubError("You're unwrapping fast. Give it a minute and try again.", 429);
    }
  }

  const tokens = await usableTokens(env);
  if (!tokens.length) {
    if (stored) return { data: stored.data, status: 'STALE' };
    throw new GitHubError('Public mode is temporarily unavailable. Use a token instead.', 503);
  }

  const leader = !inflight.has(key);
  if (leader) inflight.set(key, fetchFresh(kind, name, year, tokens).finally(() => inflight.delete(key)));
  try {
    const data = await inflight.get(key);
    if (leader && env.CACHE) {
      ctx.waitUntil(env.CACHE.put(key, JSON.stringify({ at: Date.now(), data }), { expirationTtl: keepFor(year) }).catch(() => {}));
    }
    return { data, status: 'MISS' };
  } catch (err) {
    if (stored && !(err instanceof GitHubError && err.status === 404)) return { data: stored.data, status: 'STALE' };
    throw err;
  }
}

function parseTarget(kind, name, yearText) {
  const year = Number(yearText);
  if (!NAME_RE.test(name ?? '')) return null;
  if (!Number.isInteger(year) || year < FIRST_YEAR || year > thisYear()) return null;
  return { kind, name, year };
}

function errorResponse(err) {
  if (err instanceof GitHubError && err.status < 500) {
    return json({ error: err.message }, err.status, err.status === 429 ? { 'Retry-After': '60' } : {});
  }
  if (err instanceof GitHubError && err.status === 503) return json({ error: err.message }, 503, { 'Retry-After': '300' });
  console.error(err);
  return json({ error: 'GitHub is busy right now. Try again in a minute.' }, 502, { 'Retry-After': '60' });
}

async function handleApi(request, env, ctx, kind) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
  const url = new URL(request.url);
  const target = parseTarget(kind, (url.searchParams.get(kind === 'org' ? 'org' : 'login') ?? '').trim(), url.searchParams.get('year'));
  if (!target) return json({ error: "That doesn't look like a GitHub name and year." }, 400);
  try {
    const { data, status } = await getData(kind, target.name, target.year, { env, ctx, request });
    track(env, 'api', kind, status, target.year);
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': JSON_TYPE, 'X-Cache': status, 'Cache-Control': `public, max-age=${Math.min(freshFor(target.year), HOUR)}` },
    });
  } catch (err) {
    track(env, 'api', kind, 'ERROR', target.year);
    return errorResponse(err);
  }
}

function stats(kind, data) {
  return kind === 'org' ? computeOrgStats(data) : computeUserStats(data);
}

function png(bytes, maxAge) {
  return new Response(bytes, { headers: { 'Content-Type': 'image/png', 'Cache-Control': `public, max-age=${maxAge}` } });
}

async function handleOg(request, env, ctx, pathname) {
  if (pathname === '/og.png') return png(await defaultCard(thisYear()), DAY);
  const match = pathname.match(/^\/og\/(user|org)\/([^/]+)\/(\d{4})\.png$/);
  const target = match && parseTarget(match[1], decodeURIComponent(match[2]), match[3]);
  if (!target) return png(await defaultCard(thisYear()), HOUR);
  try {
    const { data, status } = await getData(target.kind, target.name, target.year, { env, ctx, request });
    track(env, 'og', target.kind, status, target.year);
    const s = stats(target.kind, data);
    return png(await (target.kind === 'org' ? orgCard(s) : userCard(s)), Math.min(freshFor(target.year), 6 * HOUR));
  } catch {
    return png(await defaultCard(thisYear()), 10 * 60);
  }
}

function describe(kind, s) {
  if (kind === 'org') {
    return `${fmt(s.totalCommits)} commits and ${fmt(s.prs)} merged PRs across ${fmt(s.activeRepos)} repos, mostly ${s.languages[0]?.name ?? 'code'}. See the story.`;
  }
  const lang = s.languages[0] ? `, mostly in ${s.languages[0].name}` : '';
  return `${fmt(s.total)} contributions and a ${fmt(s.longest)}-day streak${lang}. Unwrap yours.`;
}

async function handlePage(request, env) {
  const url = new URL(request.url);
  const page = await env.ASSETS.fetch(new Request(new URL('/', url), request));
  if (!(page.headers.get('content-type') ?? '').includes('text/html')) return page;

  const kind = url.searchParams.get('org') ? 'org' : url.searchParams.get('user') ? 'user' : null;
  const target = kind && parseTarget(kind, url.searchParams.get(kind), url.searchParams.get('year') ?? String(thisYear()));
  let title = 'GitHub Wrapped: your year in code';
  let description = 'A tap-through story of your GitHub year: contributions, streaks, languages and the hour you code best. Free, with no sign-in.';
  let image = `${url.origin}/og.png`;

  if (target) {
    const who = target.kind === 'org' ? target.name : `@${target.name}`;
    title = `${who}'s ${target.year} on GitHub, wrapped`;
    image = `${url.origin}/og/${target.kind}/${encodeURIComponent(target.name)}/${target.year}.png`;
    try {
      const stored = await env.CACHE?.get(cacheKey(target.kind, target.name, target.year), 'json');
      if (stored) description = describe(target.kind, stats(target.kind, stored.data));
    } catch {}
  }

  const set = (value) => ({ element(el) { el.setAttribute('content', value); } });
  const rewritten = new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(title); } })
    .on('meta[name="description"]', set(description))
    .on('meta[property="og:title"]', set(title))
    .on('meta[property="og:description"]', set(description))
    .on('meta[property="og:image"]', set(image))
    .on('meta[property="og:url"]', set(url.href))
    .on('meta[name="twitter:title"]', set(title))
    .on('meta[name="twitter:description"]', set(description))
    .on('meta[name="twitter:image"]', set(image))
    .transform(page);
  const headers = new Headers(rewritten.headers);
  headers.set('Cache-Control', 'public, max-age=300');
  return new Response(rewritten.body, { status: rewritten.status, headers });
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/user') return handleApi(request, env, ctx, 'user');
    if (pathname === '/api/org') return handleApi(request, env, ctx, 'org');
    if (pathname.startsWith('/api/')) return json({ error: 'Not found.' }, 404);
    if (pathname === '/og.png' || pathname.startsWith('/og/')) return handleOg(request, env, ctx, pathname);
    if (pathname === '/' || pathname === '/index.html') return handlePage(request, env);
    return env.ASSETS.fetch(request);
  },
};
