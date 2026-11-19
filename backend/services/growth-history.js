const db = require('../db');
const { siteLaunchedAtMs } = require('../config');
const { historicalVisitDays } = require('../repositories/stats-repository');

const DAY = 86400000;
const dayOf = (t) => new Date(t + 8 * 3600000).toISOString().slice(0, 10);
const startOf = (day) => Date.parse(day + 'T00:00:00+08:00');

function history(now) {
  const through = dayOf(now);
  const launched = Number.isFinite(siteLaunchedAtMs) ? dayOf(siteLaunchedAtMs) : null;
  const lowerBound = launched ?? '0001-01-01';
  const visits = historicalVisitDays(lowerBound, through);
  const accounts = db.prepare(`
    SELECT date(created_at,'+8 hours') day, COUNT(*) accounts FROM users
    WHERE role='user' AND date(created_at,'+8 hours') BETWEEN ? AND ? GROUP BY day ORDER BY day
  `).all(lowerBound, through);
  const articles = db.prepare(`
    SELECT id, title, COALESCE(view_count,0) views, date(COALESCE(published_at,created_at),'+8 hours') day
    FROM articles WHERE COALESCE(status,'published')='published' AND date(COALESCE(published_at,created_at),'+8 hours')<=?
    ORDER BY views DESC, id
  `).all(through);
  const byPublicationDay = new Map();
  let articleViews = 0;
  for (const article of articles) {
    if (article.day >= lowerBound) byPublicationDay.set(article.day, (byPublicationDay.get(article.day) ?? 0) + 1);
    articleViews += article.views;
  }
  const publications = [...byPublicationDay.keys()].sort().map((day) => ({ day, publications: byPublicationDay.get(day) }));
  const discovery = db.prepare(`
    SELECT day, SUM(impressions) impressions, SUM(reads) reads, SUM(likes) likes, SUM(bookmarks) bookmarks
    FROM article_discovery_daily WHERE day BETWEEN ? AND ? GROUP BY day ORDER BY day
  `).all(lowerBound, through);
  const coverage = {
    visits: visits[0]?.day ?? null,
    accounts: accounts[0]?.day ?? null,
    publications: publications[0]?.day ?? null,
    discovery: discovery[0]?.day ?? null
  };
  const from = [launched, ...Object.values(coverage), through].filter(Boolean).sort()[0];
  const daily = new Map();
  for (let t = startOf(from); t <= now; t += DAY) {
    const day = dayOf(t);
    daily.set(day, {
      day, visits: null,
      accounts: coverage.accounts && day >= coverage.accounts ? 0 : null,
      publications: coverage.publications && day >= coverage.publications ? 0 : null,
      impressions: null, reads: null, likes: null, bookmarks: null
    });
  }
  for (const series of [visits, accounts, publications, discovery]) {
    for (const row of series) Object.assign(daily.get(row.day), row);
  }
  const totals = { visits: null, accounts: null, publications: null, impressions: null, reads: null, likes: null, bookmarks: null };
  for (const row of daily.values()) {
    for (const key of Object.keys(totals)) {
      if (row[key] !== null) totals[key] = (totals[key] ?? 0) + row[key];
    }
  }
  return { launched, from, through, coverage, recordedVisitDays: visits.length, totals, articles, articleViews, daily: [...daily.values()] };
}

module.exports = { DAY, dayOf, startOf, history };
