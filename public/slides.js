import { MONTH_NAMES, WEEKDAYS, argmax } from './stats.js';

const MONTH_INITIALS = 'JFMAMJJASOND';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const fmt = (n) => Math.round(n).toLocaleString('en-US');
const plural = (n, one, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
const shortName = (nameWithOwner) => nameWithOwner.split('/')[1];
const count = (n) => `<span data-count="${Math.round(n)}">${fmt(n)}</span>`;
const numLen = (text) => `style="--len:${Math.max(4, String(text).length)}"`;

function words(text, start = 0) {
  return String(text).split(' ').map((w, i) => `<span class="w" style="--i:${start + i}"><span>${esc(w)}</span></span>`).join(' ');
}

function avatar(s, cls = 'avatar') {
  if (s.avatarUrl) return `<img class="${cls}" src="${esc(s.avatarUrl)}" alt="" crossorigin="anonymous">`;
  return `<span class="${cls} initial">${esc(s.name.trim()[0] ?? '?')}</span>`;
}

function formatDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function level(value, max) {
  return value === 0 ? 0 : Math.min(4, Math.ceil((value / max) * 4));
}

export function yearGrid(days, cls = 'year-grid') {
  if (!days.length) return '';
  const max = Math.max(1, ...days.map((d) => d.contributionCount));
  const first = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
  const pad = Array.from({ length: first }, () => '<i class="pad"></i>').join('');
  const cells = days.map((d, i) => {
    const col = Math.floor((i + first) / 7);
    return `<i class="v${level(d.contributionCount, max)}" style="--c:${col}"></i>`;
  }).join('');
  return `<div class="${cls}" style="--cols:${Math.ceil((days.length + first) / 7)}">${pad}${cells}</div>`;
}

function rain(total, n = 112) {
  const per = Math.max(1, Math.ceil(total / n));
  const cells = Math.min(n, Math.ceil(total / per));
  const html = Array.from({ length: cells }, (_, i) => `<i style="--i:${i};--r:${((i * 37) % 11) - 5}"></i>`).join('');
  return { html: `<div class="rain" aria-hidden="true">${html}</div>`, per };
}

function stacks(values, { max = 10, highlight = -1, labels = [], cls = '' } = {}) {
  const top = Math.max(1, ...values);
  return `<div class="stacks ${cls}" style="--n:${values.length}">${values.map((v, i) => {
    const h = v === 0 ? 0 : Math.max(1, Math.round((v / top) * max));
    const cells = Array.from({ length: h }, (_, j) => `<i style="--j:${j}"></i>`).join('');
    return `<div class="stack ${i === highlight ? 'hot' : ''}" style="--i:${i}">${cells}${labels[i] ? `<span>${labels[i]}</span>` : ''}</div>`;
  }).join('')}</div>`;
}

function introSlide(s, title) {
  return {
    theme: 'deep',
    html: `
      ${avatar(s, 'avatar pop')}
      <h2 class="say xl">${words(title)}</h2>
      <p class="lead rise" style="--i:6">Your ${s.year} in code is ready. Tap to go on, hold to pause.</p>`,
  };
}

function totalSlide({ total, noun, line }) {
  const { html, per } = rain(total);
  return {
    theme: 'l2',
    html: `
      <h2 class="say"><span class="soft">${words('This year you made')}</span></h2>
      <p class="num bounce" ${numLen(fmt(total))}>${count(total)}</p>
      <p class="say-sm rise" style="--i:4">${esc(noun)}. ${esc(line)}</p>
      ${html}
      <p class="note rise" style="--i:6">Each square is ${per === 1 ? 'one' : `about ${fmt(per)}`}.</p>`,
  };
}

function changeSlide(s, { now, before, noun }) {
  const up = s.change >= 0;
  return {
    theme: up ? 'sun' : 'pumpkin',
    html: `
      <h2 class="say"><span class="soft">${words(`Compared to ${s.year - 1}`)}</span></h2>
      <p class="num bounce" ${numLen(`+${fmt(Math.abs(s.change))}%`)}>${up ? '+' : '−'}${count(Math.abs(s.change))}%</p>
      <p class="say-sm rise" style="--i:4">${up ? 'more' : 'fewer'} ${esc(noun)} than by this point last year.</p>
      ${stacks([before, now], { max: 9, highlight: 1, cls: 'duo', labels: [`${s.year - 1}<b>${fmt(before)}</b>`, `${s.year}<b>${fmt(now)}</b>`] })}`,
  };
}

function languageSlide(languages, who) {
  const top = languages[0];
  return {
    theme: 'night',
    html: `
      <h2 class="say"><span class="soft">${words(`${who} mostly spoke`)}</span><br><span class="w" style="--i:4;color:${esc(top.color)}"><span>${esc(top.name)}</span></span></h2>
      <ul class="lang-rows">
        ${languages.map((l, i) => {
          const filled = Math.max(1, Math.round(l.pct / 5));
          const cells = Array.from({ length: 20 }, (_, j) => `<i class="${j < filled ? 'on' : ''}" style="--j:${j}"></i>`).join('');
          return `<li class="rise" style="--i:${i + 5};--lang:${esc(l.color)}"><span class="lang-label">${esc(l.name)} <b>${Math.round(l.pct)}%</b></span><span class="lang-cells">${cells}</span></li>`;
        }).join('')}
      </ul>`,
  };
}

function reposSlide(repos, heading) {
  const [first, ...rest] = repos;
  return {
    theme: 'l1',
    html: `
      <h2 class="say">${words(heading)}</h2>
      <ol class="podium">
        <li class="first slide-in" style="--i:3"><span class="repo">${esc(shortName(first.nameWithOwner))}</span><span class="meta">${plural(first.count, 'commit')}${first.language ? ` · ${esc(first.language)}` : ''}</span></li>
        ${rest.map((r, i) => `<li class="slide-in" style="--i:${i + 4}"><span class="repo">${esc(shortName(r.nameWithOwner))}</span><span class="meta">${plural(r.count, 'commit')}</span></li>`).join('')}
      </ol>`,
  };
}

function starredSlide(repo, who) {
  const stars = repo.stargazerCount ?? repo.stars;
  return {
    theme: 'sun',
    html: `
      <h2 class="say"><span class="soft">${words(`${who} most-starred repo`)}</span><br>${words(repo.name, 4)}</h2>
      <p class="num bounce" ${numLen(fmt(stars))}>${count(stars)}</p>
      <p class="say-sm rise" style="--i:6">${stars === 1 ? 'star' : 'stars'}${repo.description ? `. ${esc(repo.description)}` : '.'}</p>`,
  };
}

function figuresSlide(heading, figures) {
  return {
    theme: 'l3',
    html: `
      <h2 class="say">${words(heading)}</h2>
      <ul class="figures">
        ${figures.map(([n, label], i) => `<li class="slide-in" style="--i:${i + 3}"><b>${count(n)}</b> ${esc(label)}</li>`).join('')}
      </ul>`,
  };
}

function seasonSlide(byMonth) {
  const topMonth = argmax(byMonth);
  const share = Math.round((byMonth[topMonth] / Math.max(1, byMonth.reduce((a, b) => a + b, 0))) * 100);
  return {
    theme: 'l4',
    html: `
      <h2 class="say"><span class="soft">${words('The busiest month was')}</span><br>${words(MONTH_NAMES[topMonth], 4)}</h2>
      <p class="lead rise" style="--i:6">${share}% of the whole year happened in that one month.</p>
      ${stacks(byMonth, { max: 12, highlight: topMonth, labels: [...MONTH_INITIALS] })}`,
  };
}

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_LINES = {
  0: 'Sunday panic is real.',
  1: 'Fresh week, fresh commits.',
  2: 'Tuesday is for shipping.',
  3: 'The midweek machine.',
  4: 'Thursday is the new Friday.',
  5: 'Friday deploys? Brave.',
  6: 'Saturday side quests.',
};

function weekdaySlide(byWeekday, who) {
  const top = argmax(byWeekday);
  const total = byWeekday.reduce((a, b) => a + b, 0);
  const share = Math.round((byWeekday[top] / Math.max(1, total)) * 100);
  return {
    theme: 'sun',
    html: `
      <h2 class="say"><span class="soft">${words(`${who} power day was`)}</span><br>${words(WEEKDAYS[top], 4)}</h2>
      <p class="lead rise" style="--i:6">${share}% of everything landed on ${WEEKDAYS[top]}s. ${DAY_LINES[top]}</p>
      ${stacks(WEEK_ORDER.map((d) => byWeekday[d]), { max: 10, highlight: WEEK_ORDER.indexOf(top), labels: WEEK_ORDER.map((d) => WEEKDAYS[d].slice(0, 3)), cls: 'week' })}`,
  };
}

function reviewSlide(opened, reviewed) {
  const verdict = reviewed >= opened * 1.5
    ? ['The Reviewer', 'You read more code than you shipped. Your team owes you one.']
    : opened >= reviewed * 1.5
      ? ['The Shipper', 'You open pull requests faster than anyone can review them.']
      : ['The Collaborator', 'Opened and reviewed in almost equal measure.'];
  return {
    theme: 'deep',
    html: `
      <h2 class="say"><span class="soft">${words('With pull requests, you were')}</span><br>${words(verdict[0], 5)}</h2>
      <p class="lead rise" style="--i:7">${esc(verdict[1])}</p>
      ${stacks([opened, reviewed], { max: 9, highlight: reviewed >= opened ? 1 : 0, cls: 'duo', labels: [`Opened<b>${fmt(opened)}</b>`, `Reviewed<b>${fmt(reviewed)}</b>`] })}`,
  };
}

function vocabularySlide(info, who) {
  const [top, ...rest] = info.topWords;
  const prefix = info.types.length && info.types[0].count >= 5 ? ` Favourite prefix: ${esc(info.types[0].name)}.` : '';
  return {
    theme: 'paper',
    html: `
      <h2 class="say"><span class="soft">${words(`${who} said it most`)}</span><br><span class="w" style="--i:4"><span>“${esc(top.name)}”</span></span></h2>
      <p class="lead rise" style="--i:5">${plural(top.count, 'time')} in commit messages.</p>
      <div class="stickers">${rest.map((w, i) => `<span class="sticker" style="--i:${i};--r:${[-6, 4, -3, 7, -5][i % 5]}deg">${esc(w.name)} <b>${fmt(w.count)}</b></span>`).join('')}</div>
      <p class="lead rise" style="--i:9">“fix” turned up in ${plural(info.fixes, 'commit')}.${prefix}</p>`,
  };
}

function personaSlide(s) {
  const { info, persona } = s;
  const showClock = info.sample >= 15;
  const peak = argmax(info.hours);
  return {
    theme: 'night',
    html: `
      <h2 class="say"><span class="soft">${words(s.kind === 'org' ? 'Your team is a' : 'You are a')}</span><br>${words(persona.title, 4)}</h2>
      <p class="lead rise" style="--i:7">${esc(persona.blurb)}</p>
      ${showClock ? `${stacks(info.hours, { max: 9, highlight: peak, cls: 'clock' })}<div class="axis rise" style="--i:8"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span></div>` : ''}`,
  };
}

function shareFacts(s) {
  if (s.kind === 'party') {
    return [
      ['Together', fmt(s.total)],
      ['Top of the party', `@${s.members[0].login}`],
      ['Longest streak', s.streak ? `@${s.streak.member.login}, ${plural(s.streak.value, 'day')}` : '—'],
      ['Night owl', s.nightOwl ? `@${s.nightOwl.member.login}` : '—'],
      ['Party language', s.languages[0]?.name ?? '—'],
      ['Party size', plural(s.members.length, 'person', 'people')],
    ];
  }
  if (s.kind === 'org') {
    return [
      ['Commits', fmt(s.totalCommits)],
      ['PRs merged', fmt(s.prs)],
      ['Top repo', s.repos[0] ? shortName(s.repos[0].nameWithOwner) : '—'],
      ['Top language', s.languages[0]?.name ?? '—'],
      ['Top contributor', s.contributors[0] ? `@${s.contributors[0].login}` : '—'],
      ['Persona', s.persona.title],
    ];
  }
  return [
    ['Contributions', fmt(s.total)],
    ['Longest streak', plural(s.longest, 'day')],
    ['Top language', s.languages[0]?.name ?? '—'],
    ['Top repo', s.repos[0] ? shortName(s.repos[0].nameWithOwner) : '—'],
    ['Persona', s.persona.title],
    ['Pull requests', fmt(s.prs)],
  ];
}

const CREDIT = () => `${typeof location === 'object' ? location.host : 'github-wrapped'} · made by @Jeccoman`;

function cardHeader(s) {
  return `<header>${avatar(s, 'card-avatar')}<div><b>${esc(s.name)}</b><span>GitHub Wrapped ${s.year}</span></div></header>`;
}

function cardStrip(s) {
  if (s.kind === 'user') return yearGrid(s.days, 'year-grid card-grid');
  if (s.kind === 'party') return stacks(s.members.map((m) => m.total), { max: 6, highlight: 0, cls: 'card-stacks' });
  return stacks(s.byMonth, { max: 6, highlight: argmax(s.byMonth), cls: 'card-stacks' });
}

export function shareCardHtml(s) {
  return `<div id="share-card" class="share-card">
    ${cardHeader(s)}
    <dl>${shareFacts(s).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    ${cardStrip(s)}
    <p class="card-credit">${esc(CREDIT())}</p>
  </div>`;
}

function finalSlide(s, opts) {
  const { canCopyLink } = opts;
  return {
    theme: 'l2',
    html: `
      <h2 class="say">${words("That's a wrap.")}</h2>
      <div class="card-drop">${shareCardHtml(s)}</div>
      ${opts.canVideo ? '<div class="share-actions rise" style="--i:3"><button class="solid video" data-action="save-video">Make a video</button></div>' : ''}
      <div class="share-actions rise" style="--i:4">
        <button class="solid" data-action="save-card">Save card</button>
        <button class="solid" data-action="save-story">Save for Stories</button>
      </div>
      <div class="share-actions rise" style="--i:5">
        ${canCopyLink ? '<button class="ghost" data-action="copy-link">Copy link</button>' : ''}
        <button class="ghost" data-action="replay">Replay</button>
      </div>
      <div class="share-actions rise" style="--i:6">
        <a class="ghost" href="https://github.com/Jeccoman/github-wrapped" target="_blank" rel="noopener">★ Star on GitHub</a>
      </div>
      <p class="share-status" role="status"></p>`,
  };
}

export function storyCardHtml(s) {
  const [headline, ...rest] = shareFacts(s);
  return `<div class="ig-card">
    ${cardHeader(s)}
    <p class="ig-label">${esc(headline[0])}</p>
    <p class="ig-huge">${esc(headline[1])}</p>
    <dl>${rest.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    ${cardStrip(s)}
    <p class="card-credit">${esc(CREDIT())}</p>
  </div>`;
}

function quietSlide(title, text) {
  return {
    theme: 'paper',
    html: `
      <h2 class="say">${words(title)}</h2>
      <p class="lead rise" style="--i:6">${esc(text)}</p>
      <div class="share-actions rise" style="--i:7"><button class="solid" data-action="close">Try again</button></div>`,
  };
}

export function buildUserSlides(s, opts) {
  const firstName = s.name.split(' ')[0];
  if (s.total === 0) {
    const yet = s.year === new Date().getFullYear() ? '… yet' : '';
    return [
      introSlide(s, `Hey ${firstName}.`),
      quietSlide(`No public contributions in ${s.year}${yet}.`, 'If your work lives in private repos, add a token to include it, or try a different year.'),
    ];
  }

  const slides = [introSlide(s, `Hey ${firstName}.`)];
  slides.push(totalSlide({
    total: s.total,
    noun: 'contributions',
    line: `About ${fmt(s.total / s.elapsedDays)} a day, across ${plural(s.activeDays, 'day')}.${s.privateCount ? ` ${fmt(s.privateCount)} were private.` : ''}`,
  }));
  if (s.change !== null) slides.push(changeSlide(s, { now: s.total, before: s.prevTotal, noun: 'contributions' }));

  slides.push({
    theme: 'night',
    html: `
      <h2 class="say"><span class="soft">${words('Your biggest day was')}</span><br>${words(formatDate(s.busiest.date), 4)}</h2>
      ${yearGrid(s.days)}
      <p class="lead rise" style="--i:7">${plural(s.busiest.contributionCount, 'contribution')} in one day. Whatever happened, it worked.</p>`,
  });

  const perCell = Math.max(1, Math.ceil(s.longest / 120));
  const streakCells = Array.from({ length: Math.ceil(s.longest / perCell) }, (_, i) => `<i style="--i:${i}"></i>`).join('');
  slides.push({
    theme: 'pumpkin',
    html: `
      <h2 class="say"><span class="soft">${words('Your longest streak')}</span></h2>
      <p class="num bounce" ${numLen(fmt(s.longest))}>${count(s.longest)}</p>
      <p class="say-sm rise" style="--i:4">${s.longest === 1 ? 'day' : 'days in a row'}${s.longest > 1 ? `, ending ${esc(formatDate(s.longestEnd))}` : ''}.</p>
      <div class="streak" aria-hidden="true">${streakCells}</div>
      <p class="note rise" style="--i:6">${s.longest >= 14 ? 'Discipline looks good on you.' : 'Rest days count too.'}</p>`,
  });

  if (s.languages.length) slides.push(languageSlide(s.languages, 'You'));
  if (s.repos.length) slides.push(reposSlide(s.repos, 'Where your commits went'));
  if (s.topStarred) slides.push(starredSlide(s.topStarred, 'Your'));
  slides.push(figuresSlide("You didn't just push code", [
    [s.commits, 'commits'],
    [s.prs, 'pull requests'],
    [s.reviews, 'reviews'],
    [s.issues, 'issues'],
    [s.newRepos, 'new repos'],
  ]));
  if (s.prs + s.reviews > 0) slides.push(reviewSlide(s.prs, s.reviews));
  slides.push(seasonSlide(s.byMonth));
  if (s.byWeekday.some(Boolean)) slides.push(weekdaySlide(s.byWeekday, 'Your'));
  if (s.info.topWords.length) slides.push(vocabularySlide(s.info, 'You'));
  slides.push(personaSlide(s));
  slides.push(finalSlide(s, opts));
  return slides;
}

export function buildOrgSlides(s, opts) {
  const intro = introSlide(s, s.name);
  if (s.totalCommits === 0) {
    return [intro, quietSlide(`No commits we could see in ${s.year}.`, 'Private repos only show up with a token from a member of the organization.')];
  }

  const slides = [intro];
  slides.push(totalSlide({
    total: s.totalCommits,
    noun: 'commits',
    line: `Across ${plural(s.activeRepos, 'active repo')}${s.contributorCount ? `, from at least ${plural(s.contributorCount, 'person', 'people')}` : ''}.`,
  }));
  slides.push(figuresSlide('More than commits', [
    [s.prs, 'PRs merged'],
    [s.issues, 'issues opened'],
    [s.activeRepos, 'active repos'],
    [s.newRepos, 'new repos'],
  ]));
  if (s.change !== null) slides.push(changeSlide(s, { now: s.prs, before: s.prevPrs, noun: 'merged PRs' }));
  slides.push(reposSlide(s.repos, 'Where the commits went'));

  if (s.contributors.length) {
    const sampled = s.coverage < 0.99 ? ` Based on the latest ${Math.round(s.coverage * 100)}% of commits in the busiest repos.` : '';
    const person = (p) => `${avatar({ avatarUrl: p.avatarUrl, name: p.login }, 'face')}<span class="repo">@${esc(p.login)}</span><span class="meta">${plural(p.count, 'commit')}</span>`;
    const [first, ...rest] = s.contributors;
    slides.push({
      theme: 'pumpkin',
      html: `
        <h2 class="say">${words('The people behind it')}</h2>
        <ol class="podium people">
          <li class="first slide-in" style="--i:3">${person(first)}</li>
          ${rest.map((p, i) => `<li class="slide-in" style="--i:${i + 4}">${person(p)}</li>`).join('')}
        </ol>
        <p class="note rise" style="--i:9">Commits to default branches, bots left out.${sampled}</p>`,
    });
  }

  if (s.languages.length) slides.push(languageSlide(s.languages, 'Your team'));
  if (s.topStarred?.stars > 0) slides.push(starredSlide(s.topStarred, 'Your'));
  if (s.byMonth.some(Boolean)) slides.push(seasonSlide(s.byMonth));
  if (s.info.byWeekday.some(Boolean)) slides.push(weekdaySlide(s.info.byWeekday, "The team's"));
  if (s.info.topWords.length) slides.push(vocabularySlide(s.info, 'Your team'));
  slides.push(personaSlide(s));
  slides.push(finalSlide(s, opts));
  return slides;
}

export function buildPartySlides(p, opts) {
  const at = (m) => `@${m.login}`;
  const n = p.members.length;
  const slides = [];

  slides.push({
    theme: 'deep',
    html: `
      <div class="party-faces">${p.members.map((m, i) => `<span class="pop" style="--i:${i}">${avatar(m, 'face')}</span>`).join('')}</div>
      <h2 class="say xl">${words(`${n} of you.`)}</h2>
      <p class="lead rise" style="--i:5">Your ${p.year} on GitHub, together. Tap to see who won what.</p>`,
  });

  slides.push(totalSlide({
    total: p.total,
    noun: 'contributions',
    line: `Between ${plural(n, 'person', 'people')}, about ${fmt(p.total / p.members[0].elapsedDays)} a day.`,
  }));

  slides.push({
    theme: 'l1',
    html: `
      <h2 class="say">${words('The leaderboard')}</h2>
      <ol class="podium people">
        ${p.members.map((m, i) => `<li class="${i === 0 ? 'first ' : ''}slide-in" style="--i:${i + 3}">${avatar(m, 'face')}<span class="repo">${esc(at(m))}</span><span class="meta">${plural(m.total, 'contribution')}</span></li>`).join('')}
      </ol>`,
  });

  if (p.streak) {
    const perCell = Math.max(1, Math.ceil(p.streak.value / 120));
    const cells = Array.from({ length: Math.ceil(p.streak.value / perCell) }, (_, i) => `<i style="--i:${i}"></i>`).join('');
    slides.push({
      theme: 'pumpkin',
      html: `
        <h2 class="say"><span class="soft">${words('The longest streak goes to')}</span><br>${words(at(p.streak.member), 5)}</h2>
        <p class="num bounce" ${numLen(fmt(p.streak.value))}>${count(p.streak.value)}</p>
        <p class="say-sm rise" style="--i:7">days in a row.</p>
        <div class="streak" aria-hidden="true">${cells}</div>`,
    });
  }

  if (p.nightOwl) {
    const bird = p.earlyBird && p.earlyBird.member !== p.nightOwl.member
      ? `<p class="lead rise" style="--i:8">And the early bird is ${esc(at(p.earlyBird.member))}, with ${Math.round(p.earlyBird.value * 100)}% of commits before 11am.</p>`
      : '';
    slides.push({
      theme: 'night',
      html: `
        <h2 class="say"><span class="soft">${words('The night owl is')}</span><br>${words(at(p.nightOwl.member), 4)}</h2>
        <p class="lead rise" style="--i:6">${Math.round(p.nightOwl.value * 100)}% of their commits landed between 10pm and 5am.</p>
        ${bird}`,
    });
  }

  if (p.languages.length) {
    const lang = languageSlide(p.languages, 'The party');
    lang.html += `<div class="stickers">${p.members.filter((m) => m.languages[0]).map((m, i) => `<span class="sticker" style="--i:${i};--r:${[-4, 3, -2, 5, -3][i % 5]}deg">${esc(at(m))} <b>${esc(m.languages[0].name)}</b></span>`).join('')}</div>`;
    slides.push(lang);
  }

  const awards = [
    p.biggestDay && ['Biggest day', at(p.biggestDay.member), plural(p.biggestDay.value, 'contribution')],
    p.prs?.value > 0 && ['Most pull requests', at(p.prs.member), fmt(p.prs.value)],
    p.fixer?.value > 0 && ['Fix-it person', at(p.fixer.member), plural(p.fixer.value, 'fix', 'fixes')],
    p.weekend?.value > 0 && ['Weekend warrior', at(p.weekend.member), `${Math.round(p.weekend.value * 100)}% on weekends`],
    p.starred && ['Most stars', `${at(p.starred)}/${p.starred.topStarred.name}`, plural(p.starred.topStarred.stargazerCount, 'star')],
    p.reviewer?.value > 0 && ['Top reviewer', at(p.reviewer.member), plural(p.reviewer.value, 'review')],
    p.sunday?.value >= 0.2 && ['Sunday panic', at(p.sunday.member), `${Math.round(p.sunday.value * 100)}% on Sundays`],
    p.topWord && ['Party word', `“${p.topWord[0]}”`, plural(p.topWord[1], 'time')],
  ].filter(Boolean);
  slides.push({
    theme: 'paper',
    html: `
      <h2 class="say">${words('The awards')}</h2>
      <ul class="awards">${awards.map(([title, who, detail], i) => `<li class="sticker" style="--i:${i};--r:${[-3, 2, -2, 3, -1, 2][i % 6]}deg"><span>${esc(title)}</span><b>${esc(who)}</b><em>${esc(detail)}</em></li>`).join('')}</ul>`,
  });

  slides.push(finalSlide(p, opts));
  return slides;
}
