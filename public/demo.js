const MESSAGES = [
  'fix flaky test in the importer', 'add dark mode toggle', 'feat: streak counter on profile',
  'refactor cache layer', 'docs: update readme', 'fix typo', 'add tests for calendar parser',
  'chore: bump dependencies', 'fix off-by-one in calendar', 'feat: export to png', 'add retry to api client',
  'fix layout on small screens', 'wip', 'add keyboard shortcuts', 'fix race in sync worker',
  'feat(api): paginate repos', 'add empty state for new users', 'fix timezone handling', 'add loading skeleton',
  'refactor: split story player', 'fix memory leak in watcher', 'add onboarding tour', 'feat: share card',
];

const REPOS = [
  { name: 'pixel-garden', share: 0.46, langs: [['TypeScript', '#3178c6', 70], ['CSS', '#663399', 20], ['HTML', '#e34c26', 10]] },
  { name: 'tidepool', share: 0.27, langs: [['Rust', '#dea584', 92], ['Shell', '#89e051', 8]] },
  { name: 'ferry-times', share: 0.14, langs: [['Python', '#3572A5', 100]] },
  { name: 'notes-api', share: 0.09, langs: [['Go', '#00ADD8', 95], ['Dockerfile', '#384d54', 5]] },
  { name: 'dotfiles', share: 0.04, langs: [['Shell', '#89e051', 80], ['Lua', '#000080', 20]] },
];

function seeded(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

export function demoRaw(year = new Date().getFullYear()) {
  const rand = seeded(year * 7919);
  const now = new Date();
  const end = year === now.getFullYear() ? now : new Date(Date.UTC(year, 11, 31));
  const monthBase = [5, 4, 7, 8, 5, 6, 9, 11, 8, 13, 10, 6];
  const streakStart = Date.UTC(year, 8, 2);
  const streakEnd = Date.UTC(year, 9, 12);

  const weeks = [];
  let week = [];
  for (const d = new Date(Date.UTC(year, 0, 1)); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const weekday = d.getUTCDay();
    const inStreak = d >= streakStart && d <= streakEnd;
    const active = inStreak || rand() < (weekday === 0 || weekday === 6 ? 0.4 : 0.82);
    const burst = rand() < 0.02 ? 5 : 1;
    const count = active ? Math.max(1, Math.round(monthBase[d.getUTCMonth()] * (0.3 + rand() * 1.4) * burst)) : 0;
    week.push({ date: d.toISOString().slice(0, 10), contributionCount: count });
    if (weekday === 6) { weeks.push({ contributionDays: week }); week = []; }
  }
  if (week.length) weeks.push({ contributionDays: week });

  const total = weeks.flatMap((w) => w.contributionDays).reduce((a, d) => a + d.contributionCount, 0);
  const prs = Math.round(total * 0.04);
  const issues = Math.round(total * 0.015);
  const reviews = Math.round(total * 0.06);
  const newRepos = 4;
  const commitTotal = total - prs - issues - reviews - newRepos;

  const commits = [];
  for (let i = 0; i < 420; i++) {
    const day = new Date(Date.UTC(year, 0, 1) + rand() * (end - Date.UTC(year, 0, 1)));
    const night = rand() < 0.62;
    const hour = night ? (21 + Math.floor(rand() * 5)) % 24 : 9 + Math.floor(rand() * 10);
    const local = new Date(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, Math.floor(rand() * 60));
    const repo = REPOS[Math.floor(rand() * REPOS.length)];
    commits.push({
      repo: `your-name/${repo.name}`,
      date: local.toISOString(),
      message: MESSAGES[Math.floor(rand() * MESSAGES.length)],
      login: 'your-name',
      avatarUrl: null,
    });
  }

  return {
    kind: 'user',
    year,
    range: { from: new Date(Date.UTC(year, 0, 1)).toISOString(), to: end.toISOString() },
    commits,
    user: {
      id: 'demo',
      login: 'your-name',
      name: 'Sam Rivera',
      avatarUrl: null,
      prev: { contributionCalendar: { totalContributions: Math.round(total * 0.71) } },
      topStarred: {
        nodes: [{
          name: 'pixel-garden',
          nameWithOwner: 'your-name/pixel-garden',
          stargazerCount: 128,
          description: 'A tiny garden that grows one pixel for every commit you push.',
        }],
      },
      contributionsCollection: {
        totalCommitContributions: commitTotal,
        totalIssueContributions: issues,
        totalPullRequestContributions: prs,
        totalPullRequestReviewContributions: reviews,
        totalRepositoryContributions: newRepos,
        restrictedContributionsCount: 0,
        contributionCalendar: { totalContributions: total, weeks },
        commitContributionsByRepository: REPOS.map((r) => ({
          contributions: { totalCount: Math.round(commitTotal * r.share) },
          repository: {
            nameWithOwner: `your-name/${r.name}`,
            isPrivate: false,
            stargazerCount: 0,
            primaryLanguage: { name: r.langs[0][0], color: r.langs[0][1] },
            languages: {
              totalSize: 100,
              edges: r.langs.map(([name, color, size]) => ({ size, node: { name, color } })),
            },
          },
        })),
      },
    },
  };
}
