export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const sum = (arr) => arr.reduce((a, b) => a + b, 0);
export const argmax = (arr) => arr.reduce((best, v, i) => (v > arr[best] ? i : best), 0);

const MIN_SAMPLE = 15;

const STOPWORDS = new Set(`
  the and for with from into this that are was were not but you your our its it's when then than
  have has had will can all any via use using also only more less onto out off over under per
  a an to of in on at by as is be or if so up do no it we i my me
`.trim().split(/\s+/));

const isBot = (login) => !login || login.endsWith('[bot]');

export function hourLabel(h) {
  return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;
}

export function analyzeCommits(commits) {
  const hours = Array(24).fill(0);
  const byWeekday = Array(7).fill(0);
  const words = new Map();
  const types = new Map();
  let fixes = 0;
  let merges = 0;
  const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);

  for (const c of commits) {
    const d = new Date(c.date);
    hours[d.getHours()]++;
    byWeekday[d.getDay()]++;
    const msg = c.message ?? '';
    if (/^merge (pull request|branch|remote-tracking)/i.test(msg)) { merges++; continue; }
    let body = msg;
    const conventional = msg.match(/^([a-z]+)(\([^)]*\))?!?:\s*/i);
    if (conventional) {
      bump(types, conventional[1].toLowerCase());
      body = msg.slice(conventional[0].length);
    }
    if (/\bfix(es|ed|ing)?\b/i.test(msg)) fixes++;
    for (const w of body.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []) {
      if (!STOPWORDS.has(w)) bump(words, w);
    }
  }

  const top = (map, n) => [...map].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));
  return {
    sample: commits.length,
    hours,
    byWeekday,
    fixes,
    merges,
    topWords: top(words, 6),
    types: top(types, 4),
  };
}

function languageMix(entries) {
  const langs = new Map();
  for (const { weight, languages } of entries) {
    if (!languages?.totalSize) continue;
    for (const e of languages.edges) {
      const entry = langs.get(e.node.name) ?? { name: e.node.name, color: e.node.color || '#ffffff', weight: 0 };
      entry.weight += (weight * e.size) / languages.totalSize;
      langs.set(e.node.name, entry);
    }
  }
  const list = [...langs.values()].sort((a, b) => b.weight - a.weight);
  const total = sum(list.map((l) => l.weight));
  return list.slice(0, 5).map((l) => ({ ...l, pct: total ? (l.weight / total) * 100 : 0 }));
}

function percentChange(now, before) {
  return before > 0 ? ((now - before) / before) * 100 : null;
}

export function persona(info, { weekendShare = 0, longest = 0, team = false } = {}) {
  if (info.sample >= MIN_SAMPLE) {
    const h = argmax(info.hours);
    const peak = `Peak hour: ${hourLabel(h)}.`;
    if (h >= 22 || h < 5) return team
      ? { title: 'Night Shift Crew', blurb: `Your team ships while the city sleeps. ${peak}` }
      : { title: 'Night Owl', blurb: `Your code came alive after dark. ${peak}` };
    if (h < 11) return team
      ? { title: 'Sunrise Squad', blurb: `First commits before first coffee. ${peak}` }
      : { title: 'Early Bird', blurb: `You shipped before most people had coffee. ${peak}` };
    if (h < 17) return team
      ? { title: 'Nine-to-Five Engine', blurb: `Steady, focused, business hours. ${peak}` }
      : { title: 'Daylight Builder', blurb: `Steady, focused, business hours. ${peak}` };
    return team
      ? { title: 'After-Hours Collective', blurb: `The best ideas land after 5pm. ${peak}` }
      : { title: 'Evening Hacker', blurb: `Day job done, real work begins. ${peak}` };
  }
  if (weekendShare > 0.3) return { title: 'Weekend Warrior', blurb: `${Math.round(weekendShare * 100)}% of the work landed on weekends.` };
  if (longest >= 30) return { title: 'Streak Machine', blurb: `${longest} days in a row. Relentless.` };
  return { title: team ? 'Steady Crew' : 'Steady Shipper', blurb: 'Showing up, again and again.' };
}

export function computeUserStats(raw) {
  const { user, year, range, commits } = raw;
  const cc = user.contributionsCollection;
  const days = cc.contributionCalendar.weeks
    .flatMap((w) => w.contributionDays)
    .filter((d) => d.date.startsWith(String(year)));
  const total = cc.contributionCalendar.totalContributions;

  let longest = 0, run = 0, longestEnd = null;
  for (const d of days) {
    run = d.contributionCount > 0 ? run + 1 : 0;
    if (run > longest) { longest = run; longestEnd = d.date; }
  }

  const byWeekday = Array(7).fill(0);
  const byMonth = Array(12).fill(0);
  for (const d of days) {
    const dt = new Date(`${d.date}T00:00:00Z`);
    byWeekday[dt.getUTCDay()] += d.contributionCount;
    byMonth[dt.getUTCMonth()] += d.contributionCount;
  }
  const busiest = days.reduce((a, d) => (d.contributionCount > a.contributionCount ? d : a), { date: null, contributionCount: 0 });
  const weekendShare = total ? (byWeekday[0] + byWeekday[6]) / total : 0;
  const info = analyzeCommits(commits);
  const prevTotal = user.prev.contributionCalendar.totalContributions;

  return {
    kind: 'user',
    year,
    name: user.name || user.login,
    login: user.login,
    avatarUrl: user.avatarUrl,
    total,
    privateCount: cc.restrictedContributionsCount,
    commits: cc.totalCommitContributions,
    prs: cc.totalPullRequestContributions,
    issues: cc.totalIssueContributions,
    reviews: cc.totalPullRequestReviewContributions,
    newRepos: cc.totalRepositoryContributions,
    days,
    longest,
    longestEnd,
    busiest,
    byWeekday,
    byMonth,
    activeDays: days.filter((d) => d.contributionCount > 0).length,
    elapsedDays: Math.round((new Date(range.to) - Date.UTC(year, 0, 1)) / 86400000) + 1,
    weekendShare,
    languages: languageMix(cc.commitContributionsByRepository.map((r) => ({
      weight: r.contributions.totalCount, languages: r.repository.languages,
    }))),
    repos: cc.commitContributionsByRepository.slice(0, 5).map((r) => ({
      nameWithOwner: r.repository.nameWithOwner,
      language: r.repository.primaryLanguage?.name,
      count: r.contributions.totalCount,
    })),
    topStarred: user.topStarred.nodes[0]?.stargazerCount > 0 ? user.topStarred.nodes[0] : null,
    prevTotal,
    change: percentChange(total, prevTotal),
    info,
    persona: persona(info, { weekendShare, longest }),
  };
}

export function computeOrgStats(raw) {
  const { org, year, repos, commits, monthly } = raw;
  const info = analyzeCommits(commits);
  const totalCommits = sum(repos.map((r) => r.commits));

  const people = new Map();
  for (const c of commits) {
    if (isBot(c.login)) continue;
    const p = people.get(c.login) ?? { login: c.login, avatarUrl: c.avatarUrl, count: 0 };
    p.count++;
    people.set(c.login, p);
  }
  const sampledTotal = sum(repos.slice(0, 8).map((r) => r.commits));

  return {
    kind: 'org',
    year,
    name: org.name || org.login,
    login: org.login,
    avatarUrl: org.avatarUrl,
    totalCommits,
    activeRepos: repos.length,
    repoCount: raw.repoCount,
    newRepos: raw.newRepos,
    prs: raw.prs,
    prevPrs: raw.prevPrs,
    change: percentChange(raw.prs, raw.prevPrs),
    issues: raw.issues,
    repos: repos.slice(0, 5).map((r) => ({ nameWithOwner: r.nameWithOwner, language: r.primaryLanguage?.name, count: r.commits })),
    topStarred: [...repos].sort((a, b) => b.stars - a.stars)[0] ?? null,
    languages: languageMix(repos.map((r) => ({ weight: r.commits, languages: r.languages }))),
    contributors: [...people.values()].sort((a, b) => b.count - a.count).slice(0, 5),
    contributorCount: people.size,
    coverage: sampledTotal ? Math.min(1, commits.length / sampledTotal) : 1,
    byMonth: monthly,
    info,
    persona: persona(info, { team: true }),
  };
}

const shareBetween = (hours, from, to) => {
  const total = sum(hours);
  if (!total) return 0;
  let n = 0;
  for (let h = from; h !== to; h = (h + 1) % 24) n += hours[h];
  return n / total;
};

function champion(members, score, { min = -Infinity } = {}) {
  let best = null;
  for (const m of members) {
    const v = score(m);
    if (v > min && (!best || v > best.value)) best = { member: m, value: v };
  }
  return best;
}

export function computePartyStats(members, year) {
  const ranked = [...members].sort((a, b) => b.total - a.total);
  const weeks = [];
  for (const m of members) m.days.forEach((d, i) => { weeks[Math.floor(i / 7)] = (weeks[Math.floor(i / 7)] ?? 0) + d.contributionCount; });

  const langs = new Map();
  for (const m of members) {
    for (const l of m.languages) {
      const entry = langs.get(l.name) ?? { name: l.name, color: l.color, weight: 0 };
      entry.weight += l.pct * m.total;
      langs.set(l.name, entry);
    }
  }
  const langList = [...langs.values()].sort((a, b) => b.weight - a.weight).slice(0, 5);
  const langTotal = sum(langList.map((l) => l.weight));

  const words = new Map();
  for (const m of members) for (const w of m.info.topWords) words.set(w.name, (words.get(w.name) ?? 0) + w.count);

  const timed = members.filter((m) => m.info.sample >= 15);
  const starred = members.filter((m) => m.topStarred).sort((a, b) => b.topStarred.stargazerCount - a.topStarred.stargazerCount)[0];

  return {
    kind: 'party',
    year,
    name: 'Wrap Party',
    login: ranked.map((m) => m.login).join('-'),
    avatarUrl: null,
    members: ranked,
    total: sum(members.map((m) => m.total)),
    weeks,
    languages: langList.map((l) => ({ ...l, pct: langTotal ? (l.weight / langTotal) * 100 : 0 })),
    topWord: [...words].sort((a, b) => b[1] - a[1])[0] ?? null,
    streak: champion(members, (m) => m.longest, { min: 0 }),
    biggestDay: champion(members, (m) => m.busiest.contributionCount, { min: 0 }),
    nightOwl: champion(timed, (m) => shareBetween(m.info.hours, 22, 5), { min: 0 }),
    earlyBird: champion(timed, (m) => shareBetween(m.info.hours, 5, 11), { min: 0 }),
    prs: champion(members, (m) => m.prs, { min: 0 }),
    fixer: champion(members, (m) => m.info.fixes, { min: 0 }),
    weekend: champion(members, (m) => m.weekendShare, { min: 0 }),
    reviewer: champion(members, (m) => m.reviews, { min: 0 }),
    sunday: champion(members, (m) => (m.total ? m.byWeekday[0] / m.total : 0), { min: 0 }),
    starred,
  };
}
