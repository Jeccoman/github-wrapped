import { MONTH_NAMES, WEEKDAYS, argmax } from './stats.js';

const MONTH_INITIALS = 'JFMAMJJASOND';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const fmt = (n) => Math.round(n).toLocaleString('en-US');
const counter = (n) => `<span data-count="${n}">${fmt(n)}</span>`;
const plural = (n, one, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
const shortName = (nameWithOwner) => nameWithOwner.split('/')[1];

function formatDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function heatmapSvg(days) {
  const cell = 7, gap = 2, step = cell + gap;
  const max = Math.max(1, ...days.map((d) => d.contributionCount));
  const opacity = [0.12, 0.35, 0.55, 0.78, 1];
  const first = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
  const rects = days.map((d, i) => {
    const idx = i + first;
    const level = d.contributionCount === 0 ? 0 : Math.min(4, Math.ceil((d.contributionCount / max) * 4));
    return `<rect x="${Math.floor(idx / 7) * step}" y="${(idx % 7) * step}" width="${cell}" height="${cell}" rx="1.5" fill="#fff" fill-opacity="${opacity[level]}"/>`;
  }).join('');
  const width = Math.ceil((days.length + first) / 7) * step;
  return `<svg class="heatmap in" style="--d:2" viewBox="0 0 ${width} ${7 * step}" role="img" aria-label="Contribution calendar">${rects}</svg>`;
}

function rankedList(items) {
  return `<ol class="list">${items.map((item, i) => `
    <li class="in" style="--d:${i + 2}">
      <span class="rank">${String(i + 1).padStart(2, '0')}</span>
      <span class="name">${item.avatarUrl ? `<img src="${esc(item.avatarUrl)}" alt="" crossorigin="anonymous">` : ''}${esc(item.title)}
        ${item.sub ? `<small>${esc(item.sub)}</small>` : ''}</span>
      <span class="val">${fmt(item.value)}</span>
    </li>`).join('')}</ol>`;
}

function introSlide(s, line) {
  return {
    theme: 'ink',
    html: `
      <img class="avatar in" src="${esc(s.avatarUrl)}" alt="" crossorigin="anonymous">
      <p class="kicker in" style="--d:1">@${esc(s.login)}</p>
      <h2 class="big in" style="--d:2">${line}</h2>
      <p class="muted in" style="--d:3">${s.year} was a year of code. Let's unwrap it.</p>`,
  };
}

function changeSlide(s, { now, before, noun }) {
  const up = s.change >= 0;
  return {
    theme: up ? 'lime' : 'orange',
    html: `
      <p class="kicker in">Compared to ${s.year - 1}</p>
      <p class="huge in" style="--d:1">${up ? '+' : '−'}${counter(Math.abs(s.change))}%</p>
      <h2 class="in" style="--d:2">${up ? 'more' : 'fewer'} ${noun}</h2>
      <p class="muted in" style="--d:3">${fmt(now)} this year vs ${fmt(before)} by this point in ${s.year - 1}.
      ${up ? 'Up and to the right.' : 'Quality over quantity, right?'}</p>`,
  };
}

function languageSlide(languages, who) {
  return {
    theme: 'blue',
    html: `
      <p class="kicker in">${who} spoke ${languages.length > 1 ? 'mostly' : ''}</p>
      <h2 class="big in" style="--d:1">${esc(languages[0].name)}</h2>
      <div class="bars">
        ${languages.map((l, i) => `
          <div class="bar-row in" style="--d:${i + 2}">
            <div class="bar-label"><span>${esc(l.name)}</span><span>${Math.round(l.pct)}%</span></div>
            <div class="bar-track"><div class="bar-fill grow" style="--d:${i};width:${l.pct}%;background:${esc(l.color)}"></div></div>
          </div>`).join('')}
      </div>`,
  };
}

function seasonSlide(byMonth, byWeekday, note = '') {
  const topMonth = argmax(byMonth);
  const max = Math.max(1, ...byMonth);
  return {
    theme: 'blue',
    html: `
      <p class="kicker in">Peak season</p>
      <h2 class="big in" style="--d:1">${MONTH_NAMES[topMonth]}</h2>
      <p class="muted in" style="--d:2">was the busiest month, and ${WEEKDAYS[argmax(byWeekday)]}s were the power day.${note}</p>
      <div class="months">
        ${byMonth.map((v, i) => `
          <div><i class="grow-y ${i === topMonth ? 'top' : ''}" style="--d:${i};height:${Math.max(2, (v / max) * 100)}%"></i><span>${MONTH_INITIALS[i]}</span></div>`).join('')}
      </div>`,
  };
}

function vocabularySlide(info, who) {
  const [top, ...rest] = info.topWords;
  const conventional = info.types.length && info.types[0].count >= 5
    ? ` Favourite prefix: <b>${esc(info.types[0].name)}:</b>`
    : '';
  return {
    theme: 'orange',
    html: `
      <p class="kicker in">${who} commit vocabulary</p>
      <h2 class="big in" style="--d:1">“${esc(top.name)}”</h2>
      <p class="muted in" style="--d:2">The word that showed up most, ${plural(top.count, 'time')}.</p>
      <div class="chips in" style="--d:3">${rest.map((w) => `<span>${esc(w.name)} <em>${fmt(w.count)}</em></span>`).join('')}</div>
      <p class="muted in" style="--d:4">“fix” appeared in ${plural(info.fixes, 'commit')}.${conventional}</p>`,
  };
}

function starredSlide(repo, who) {
  return {
    theme: 'green',
    html: `
      <p class="kicker in">${who} most-starred repo</p>
      <h2 class="big in" style="--d:1">${esc(repo.name)}</h2>
      <p class="huge in" style="--d:2">★ ${counter(repo.stargazerCount ?? repo.stars)}</p>
      ${repo.description ? `<p class="muted in" style="--d:3">${esc(repo.description)}</p>` : ''}`,
  };
}

function personaSlide(s) {
  const { info, persona } = s;
  const max = Math.max(1, ...info.hours);
  const peak = argmax(info.hours);
  const showClock = info.sample >= 15;
  return {
    theme: 'purple',
    html: `
      <p class="kicker in">${s.kind === 'org' ? 'Team' : 'Coding'} personality</p>
      <h2 class="big in" style="--d:1">${esc(persona.title)}</h2>
      <p class="muted in" style="--d:2">${esc(persona.blurb)}</p>
      ${showClock ? `
        <div class="clock">${info.hours.map((v, i) => `<i class="grow-y ${i === peak ? 'top' : ''}" style="--d:${i};height:${Math.max(3, (v / max) * 100)}%"></i>`).join('')}</div>
        <div class="clock-axis in" style="--d:3"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span></div>` : ''}`,
  };
}

function shareFacts(s) {
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

function cardHeader(s) {
  return `<header>
    <img src="${esc(s.avatarUrl)}" alt="" crossorigin="anonymous">
    <div><b>${esc(s.name)}</b><span>GitHub Wrapped ${s.year}</span></div>
  </header>`;
}

function finalSlide(s, { canCopyLink }) {
  return {
    theme: 'ink',
    html: `
      <p class="kicker in">That's a wrap</p>
      <div id="share-card" class="share-card in" style="--d:1">
        ${cardHeader(s)}
        <dl>${shareFacts(s).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      </div>
      <div class="share-actions in" style="--d:2">
        <button class="solid" data-action="save-card">Save card</button>
        <button class="solid" data-action="save-story">Save for Stories</button>
      </div>
      <div class="share-actions in" style="--d:3">
        ${canCopyLink ? '<button class="ghost" data-action="copy-link">Copy link</button>' : ''}
        <button class="ghost" data-action="replay">Replay</button>
      </div>
      <p class="share-status" role="status"></p>`,
  };
}

export function storyCardHtml(s) {
  const facts = shareFacts(s);
  const [headline, ...rest] = facts;
  return `<div class="ig-card">
    ${cardHeader(s)}
    <p class="ig-label">${esc(headline[0])}</p>
    <p class="ig-huge">${esc(headline[1])}</p>
    <dl>${rest.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    <footer>github-wrapped · ${s.year}</footer>
  </div>`;
}

export function buildUserSlides(s, opts) {
  const firstName = s.name.split(' ')[0];
  if (s.total === 0) {
    return [
      introSlide(s, `Hey ${esc(firstName)}.`),
      {
        theme: 'blue',
        html: `
          <p class="kicker in">A quiet year</p>
          <h2 class="big in" style="--d:1">No public contributions in ${s.year}${s.year === new Date().getFullYear() ? '… yet' : ''}.</h2>
          <p class="muted in" style="--d:2">If your work lives in private repos, add a token to include it,
          or try a different year.</p>
          <div class="share-actions in" style="--d:3"><button class="solid" data-action="close">Try again</button></div>`,
      },
    ];
  }

  const slides = [introSlide(s, `Hey ${esc(firstName)}.`)];

  slides.push({
    theme: 'green',
    html: `
      <p class="kicker in">This year you made</p>
      <p class="huge in" style="--d:1">${counter(s.total)}</p>
      <h2 class="in" style="--d:2">contributions</h2>
      <p class="muted in" style="--d:3">That's about ${fmt(s.total / s.elapsedDays)} a day, across ${plural(s.activeDays, 'active day')}.
      ${s.privateCount ? `<br>${fmt(s.privateCount)} of them were in private repos.` : ''}</p>`,
  });

  if (s.change !== null) slides.push(changeSlide(s, { now: s.total, before: s.prevTotal, noun: 'contributions' }));

  slides.push({
    theme: 'purple',
    html: `
      <p class="kicker in">Your biggest day</p>
      <h2 class="big in" style="--d:1">${esc(formatDate(s.busiest.date))}</h2>
      ${heatmapSvg(s.days)}
      <p class="muted in" style="--d:3">${plural(s.busiest.contributionCount, 'contribution')} in a single day. Whatever happened, it worked.</p>`,
  });

  slides.push({
    theme: 'orange',
    html: `
      <p class="kicker in">Longest streak</p>
      <p class="huge in" style="--d:1">${counter(s.longest)}</p>
      <h2 class="in" style="--d:2">${s.longest === 1 ? 'day' : 'days in a row'}</h2>
      <p class="muted in" style="--d:3">${s.longest > 1 ? `Ending ${esc(formatDate(s.longestEnd))}. ` : ''}${s.longest >= 14 ? 'Discipline looks good on you.' : 'Rest days count too.'}</p>`,
  });

  if (s.languages.length) slides.push(languageSlide(s.languages, 'You'));

  if (s.repos.length) {
    slides.push({
      theme: 'pink',
      html: `
        <p class="kicker in">Your top repos</p>
        <h2 class="in" style="--d:1">Where your commits went</h2>
        ${rankedList(s.repos.map((r) => ({
          title: shortName(r.nameWithOwner),
          sub: [r.nameWithOwner.split('/')[0], r.language].filter(Boolean).join(' · '),
          value: r.count,
        })))}`,
    });
  }

  if (s.topStarred) slides.push(starredSlide(s.topStarred, 'Your'));

  slides.push({
    theme: 'lime',
    html: `
      <p class="kicker in">Beyond commits</p>
      <h2 class="in" style="--d:1">You didn't just push code</h2>
      <div class="stat-grid">
        <div class="stat in" style="--d:2"><b>${counter(s.commits)}</b><span>commits</span></div>
        <div class="stat in" style="--d:3"><b>${counter(s.prs)}</b><span>pull requests</span></div>
        <div class="stat in" style="--d:4"><b>${counter(s.reviews)}</b><span>reviews</span></div>
        <div class="stat in" style="--d:5"><b>${counter(s.issues)}</b><span>issues</span></div>
      </div>
      <p class="muted in" style="--d:6">Plus ${plural(s.newRepos, 'new repo')} created.</p>`,
  });

  slides.push(seasonSlide(s.byMonth, s.byWeekday));
  if (s.info.topWords.length) slides.push(vocabularySlide(s.info, 'Your'));
  slides.push(personaSlide(s));
  slides.push(finalSlide(s, opts));
  return slides;
}

export function buildOrgSlides(s, opts) {
  const intro = introSlide(s, esc(s.name));
  if (s.totalCommits === 0) {
    return [intro, {
      theme: 'blue',
      html: `
        <p class="kicker in">A quiet year</p>
        <h2 class="big in" style="--d:1">No commits we could see in ${s.year}.</h2>
        <p class="muted in" style="--d:2">Private repos only show up with a token from a member of the organization.</p>
        <div class="share-actions in" style="--d:3"><button class="solid" data-action="close">Try again</button></div>`,
    }];
  }

  const slides = [intro];
  slides.push({
    theme: 'green',
    html: `
      <p class="kicker in">Together you shipped</p>
      <p class="huge in" style="--d:1">${counter(s.totalCommits)}</p>
      <h2 class="in" style="--d:2">commits</h2>
      <p class="muted in" style="--d:3">Across ${plural(s.activeRepos, 'active repo')}${s.contributorCount ? `, from at least ${plural(s.contributorCount, 'person', 'people')}` : ''}.</p>`,
  });

  slides.push({
    theme: 'lime',
    html: `
      <p class="kicker in">The full picture</p>
      <h2 class="in" style="--d:1">More than commits</h2>
      <div class="stat-grid">
        <div class="stat in" style="--d:2"><b>${counter(s.prs)}</b><span>PRs merged</span></div>
        <div class="stat in" style="--d:3"><b>${counter(s.issues)}</b><span>issues opened</span></div>
        <div class="stat in" style="--d:4"><b>${counter(s.activeRepos)}</b><span>active repos</span></div>
        <div class="stat in" style="--d:5"><b>${counter(s.newRepos)}</b><span>new repos</span></div>
      </div>`,
  });

  if (s.change !== null) slides.push(changeSlide(s, { now: s.prs, before: s.prevPrs, noun: 'merged PRs' }));

  slides.push({
    theme: 'pink',
    html: `
      <p class="kicker in">Top repos</p>
      <h2 class="in" style="--d:1">Where the commits went</h2>
      ${rankedList(s.repos.map((r) => ({ title: shortName(r.nameWithOwner), sub: r.language, value: r.count })))}`,
  });

  if (s.contributors.length) {
    const sampled = s.coverage < 0.99 ? ` Based on the latest ${Math.round(s.coverage * 100)}% of commits in the busiest repos.` : '';
    slides.push({
      theme: 'orange',
      html: `
        <p class="kicker in">Top contributors</p>
        <h2 class="in" style="--d:1">The people behind it</h2>
        ${rankedList(s.contributors.map((p) => ({ title: `@${p.login}`, avatarUrl: p.avatarUrl, value: p.count })))}
        <p class="muted small in" style="--d:7">Commits to default branches, bots excluded.${sampled}</p>`,
    });
  }

  if (s.languages.length) slides.push(languageSlide(s.languages, 'Your team'));
  if (s.topStarred?.stars > 0) slides.push(starredSlide(s.topStarred, 'Your'));
  if (s.byMonth.some(Boolean)) slides.push(seasonSlide(s.byMonth, s.info.byWeekday));
  if (s.info.topWords.length) slides.push(vocabularySlide(s.info, 'Team'));
  slides.push(personaSlide(s));
  slides.push(finalSlide(s, opts));
  return slides;
}
