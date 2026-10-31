const GRAPHQL_URL = 'https://api.github.com/graphql';
export const NAME_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
export const FIRST_YEAR = 2008;

export class GitHubError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

export function createClient(token, { userAgent } = {}) {
  return async function gql(query, variables = {}, { partial = false } = {}) {
    const headers = { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' };
    if (userAgent) headers['User-Agent'] = userAgent;
    const res = await fetch(GRAPHQL_URL, { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
    const json = await res.json().catch(() => ({}));
    if (res.status === 401) throw new GitHubError('GitHub rejected that token. Check it is valid and not expired.', 401);
    if (res.status === 403 || res.status === 429) throw new GitHubError('GitHub is rate limiting us right now. Try again in a few minutes.', 429);
    if (!res.ok) throw new GitHubError(json.message || `GitHub API error (${res.status})`, res.status);
    if (json.errors && !(partial && json.data)) {
      const err = json.errors[0];
      if (err.type === 'RATE_LIMITED') throw new GitHubError('GitHub is rate limiting us right now. Try again in a few minutes.', 429);
      throw new GitHubError(err.message, err.type === 'NOT_FOUND' ? 404 : 502);
    }
    return json.data;
  };
}

export function yearRange(year, now = new Date()) {
  const from = new Date(Date.UTC(year, 0, 1));
  if (from > now) throw new GitHubError(`${year} hasn't started yet.`, 400);
  const endOfYear = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
  const to = endOfYear > now ? now : endOfYear;
  const prevTo = new Date(to);
  prevTo.setUTCFullYear(year - 1);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    prevFrom: new Date(Date.UTC(year - 1, 0, 1)).toISOString(),
    prevTo: prevTo.toISOString(),
  };
}

const LANGUAGES = `languages(first: 6, orderBy: { field: SIZE, direction: DESC }) {
  totalSize
  edges { size node { name color } }
}`;

const USER_QUERY = `
query($login: String!, $from: DateTime!, $to: DateTime!, $prevFrom: DateTime!, $prevTo: DateTime!) {
  user(login: $login) {
    id login name avatarUrl createdAt
    prev: contributionsCollection(from: $prevFrom, to: $prevTo) {
      contributionCalendar { totalContributions }
    }
    topStarred: repositories(first: 1, ownerAffiliations: [OWNER], isFork: false, privacy: PUBLIC,
                             orderBy: { field: STARGAZERS, direction: DESC }) {
      nodes { name nameWithOwner stargazerCount description primaryLanguage { name color } }
    }
    contributionsCollection(from: $from, to: $to) {
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      totalRepositoryContributions
      restrictedContributionsCount
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
      commitContributionsByRepository(maxRepositories: 25) {
        contributions { totalCount }
        repository {
          nameWithOwner isPrivate stargazerCount
          primaryLanguage { name color }
          ${LANGUAGES}
        }
      }
    }
  }
}`;

const ORG_QUERY = `
query($org: String!, $repoq: String!, $since: GitTimestamp!, $until: GitTimestamp!, $prq: String!, $issueq: String!, $prevPrq: String!) {
  owner: repositoryOwner(login: $org) {
    __typename login avatarUrl
    ... on Organization { name }
  }
  repos: search(query: $repoq, type: REPOSITORY, first: 100) {
    repositoryCount
    nodes {
      ... on Repository {
        name nameWithOwner isPrivate isFork stargazerCount createdAt
        primaryLanguage { name color }
        ${LANGUAGES}
        defaultBranchRef { target { ... on Commit { history(since: $since, until: $until) { totalCount } } } }
      }
    }
  }
  prs: search(query: $prq, type: ISSUE, first: 0) { issueCount }
  issues: search(query: $issueq, type: ISSUE, first: 0) { issueCount }
  prevPrs: search(query: $prevPrq, type: ISSUE, first: 0) { issueCount }
}`;

async function fetchRepoCommits(gql, nameWithOwner, { since, until, authorId, pages }) {
  const [owner, name] = nameWithOwner.split('/');
  const query = `query($owner: String!, $name: String!, $cursor: String, $since: GitTimestamp!, $until: GitTimestamp!${authorId ? ', $authorId: ID!' : ''}) {
    repository(owner: $owner, name: $name) {
      defaultBranchRef { target { ... on Commit {
        history(first: 100, after: $cursor, since: $since, until: $until${authorId ? ', author: { id: $authorId }' : ''}) {
          pageInfo { hasNextPage endCursor }
          nodes { authoredDate messageHeadline author { user { login avatarUrl } } }
        }
      } } }
    }
  }`;
  const commits = [];
  let cursor = null;
  for (let page = 0; page < pages; page++) {
    let data;
    try {
      data = await gql(query, { owner, name, cursor, since, until, ...(authorId && { authorId }) });
    } catch {
      break;
    }
    const history = data?.repository?.defaultBranchRef?.target?.history;
    if (!history) break;
    for (const n of history.nodes) {
      commits.push({
        repo: nameWithOwner,
        date: n.authoredDate,
        message: n.messageHeadline,
        login: n.author?.user?.login ?? null,
        avatarUrl: n.author?.user?.avatarUrl ?? null,
      });
    }
    if (!history.pageInfo.hasNextPage) break;
    cursor = history.pageInfo.endCursor;
  }
  return commits;
}

async function sampleCommits(gql, repos, options) {
  const perRepo = await Promise.all(repos.map((r) => fetchRepoCommits(gql, r, options)));
  return perRepo.flat();
}

async function fetchMonthlyCommits(gql, repos, year, range) {
  const monthly = Array(12).fill(0);
  if (!repos.length) return monthly;
  const until = new Date(range.to);
  const vars = {};
  const defs = [];
  const fields = [];
  const months = [];
  for (let m = 0; m < 12; m++) {
    const start = new Date(Date.UTC(year, m, 1));
    if (start > until) break;
    const end = new Date(Math.min(Date.UTC(year, m + 1, 1) - 1000, until));
    vars[`s${m}`] = start.toISOString();
    vars[`e${m}`] = end.toISOString();
    defs.push(`$s${m}: GitTimestamp!, $e${m}: GitTimestamp!`);
    months.push(m);
  }
  repos.forEach((nameWithOwner, i) => {
    const [owner, name] = nameWithOwner.split('/');
    Object.assign(vars, { [`o${i}`]: owner, [`n${i}`]: name });
    defs.push(`$o${i}: String!, $n${i}: String!`);
    const perMonth = months.map((m) => `m${m}: history(since: $s${m}, until: $e${m}) { totalCount }`).join('\n');
    fields.push(`r${i}: repository(owner: $o${i}, name: $n${i}) {
      defaultBranchRef { target { ... on Commit { ${perMonth} } } }
    }`);
  });
  try {
    const data = await gql(`query(${defs.join(', ')}) { ${fields.join('\n')} }`, vars, { partial: true });
    repos.forEach((_, i) => {
      const target = data?.[`r${i}`]?.defaultBranchRef?.target;
      if (target) months.forEach((m) => { monthly[m] += target[`m${m}`]?.totalCount ?? 0; });
    });
  } catch {}
  return monthly;
}

export async function fetchUserData(gql, login, year, onProgress = () => {}) {
  if (!login) {
    onProgress('Checking your token…');
    login = (await gql('query { viewer { login } }')).viewer.login;
  }
  const range = yearRange(year);
  onProgress(`Reading ${login}'s ${year}…`);
  const { user } = await gql(USER_QUERY, { login, ...range });
  if (!user) throw new GitHubError(`No GitHub user called "${login}".`, 404);

  onProgress('Reading your commit messages…');
  const repos = user.contributionsCollection.commitContributionsByRepository
    .slice(0, 6)
    .map((r) => r.repository.nameWithOwner);
  const commits = await sampleCommits(gql, repos, { since: range.from, until: range.to, authorId: user.id, pages: 1 });
  return { kind: 'user', year, range, user, commits };
}

export async function fetchOrgData(gql, org, year, onProgress = () => {}) {
  const range = yearRange(year);
  const day = (iso) => iso.slice(0, 10);
  onProgress(`Reading ${org}'s ${year}…`);
  const data = await gql(ORG_QUERY, {
    org,
    repoq: `org:${org} sort:updated`,
    since: range.from,
    until: range.to,
    prq: `org:${org} is:pr is:merged merged:${day(range.from)}..${day(range.to)}`,
    issueq: `org:${org} is:issue created:${day(range.from)}..${day(range.to)}`,
    prevPrq: `org:${org} is:pr is:merged merged:${day(range.prevFrom)}..${day(range.prevTo)}`,
  });
  const o = data.owner;
  if (o?.__typename !== 'Organization') throw new GitHubError(`No GitHub organization called "${org}".`, 404);
  const nodes = data.repos.nodes.filter((r) => r.nameWithOwner);

  const repos = nodes
    .map((r) => ({
      name: r.name,
      nameWithOwner: r.nameWithOwner,
      isPrivate: r.isPrivate,
      stars: r.stargazerCount,
      primaryLanguage: r.primaryLanguage,
      languages: r.languages,
      commits: r.defaultBranchRef?.target?.history?.totalCount ?? 0,
    }))
    .filter((r) => r.commits > 0)
    .sort((a, b) => b.commits - a.commits);
  const newRepos = nodes.filter((r) => r.createdAt >= range.from && r.createdAt <= range.to).length;

  onProgress('Finding your top contributors…');
  const [monthly, commits] = await Promise.all([
    fetchMonthlyCommits(gql, repos.slice(0, 20).map((r) => r.nameWithOwner), year, range),
    sampleCommits(gql, repos.slice(0, 8).map((r) => r.nameWithOwner), { since: range.from, until: range.to, pages: 3 }),
  ]);

  return {
    kind: 'org',
    year,
    range,
    org: { login: o.login, name: o.name, avatarUrl: o.avatarUrl },
    repoCount: data.repos.repositoryCount,
    repos,
    newRepos,
    prs: data.prs.issueCount,
    prevPrs: data.prevPrs.issueCount,
    issues: data.issues.issueCount,
    monthly,
    commits,
  };
}
