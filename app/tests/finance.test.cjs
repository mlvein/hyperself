// Finance Path charts: pure grouping/series helpers (budget.ts) plus the
// D3 wiring in main.ts. Adapted from luism6n/finances-app's Overview
// (group by / then by, Others tail) and Evolution (multi-series lines).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  FINANCE_GROUP_KEYS,
  financeGroupKey,
  filterFinanceByCategories,
  groupFinance,
  financeBreakdown,
  monthlyCategorySeries,
  cumulativeNetByMonth,
} = require('../.test-compiled/budget.js');

const tx = [
  { date: '2024-01-05', description: 'Rent Payment', amount: -900, category: 'Housing' },
  { date: '2024-01-06', description: 'Salary', amount: 2500, category: 'Income' },
  { date: '2024-01-07', description: 'Tesco', amount: -50, category: 'Groceries' },
  { date: '2024-02-05', description: 'Rent Payment', amount: -900, category: 'Housing' },
  { date: '2024-02-06', description: 'Salary', amount: 2500, category: 'Income' },
  { date: '2024-02-07', description: 'Tesco', amount: -70, category: 'Groceries' },
  { date: '2024-02-08', description: 'Netflix', amount: -15, category: 'Subscriptions' },
];

assert.deepEqual(FINANCE_GROUP_KEYS, ['Month', 'Weekday', 'Category', 'Description']);
assert.equal(financeGroupKey(tx[0], 'Month'), '2024-01');
assert.equal(financeGroupKey(tx[0], 'Category'), 'Housing');
assert.equal(financeGroupKey(tx[0], 'Description'), 'Rent Payment');
assert.equal(financeGroupKey({ ...tx[0], date: '2024-01-01' }, 'Weekday'), 'Mon', '2024-01-01 was a Monday');

// Month groups stay chronological and carry spent/received/net together.
{
  const months = groupFinance(tx, 'Month');
  assert.deepEqual(months.map((g) => g.key), ['2024-01', '2024-02']);
  assert.equal(months[0].spent, 950);
  assert.equal(months[0].received, 2500);
  assert.equal(months[0].net, 1550);
  assert.equal(months[0].count, 3);
  console.log('finance overview OK: month groups carry spent/received/net');
}

// Category groups rank by money moved; Weekday groups stay Mon-first.
{
  const cats = groupFinance(tx, 'Category');
  assert.equal(cats[0].key, 'Income', 'largest money-moved category first');
  assert.ok(cats.findIndex((g) => g.key === 'Housing') < cats.findIndex((g) => g.key === 'Subscriptions'));
  const weekdays = groupFinance(tx, 'Weekday');
  const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  assert.deepEqual(weekdays.map((g) => g.key), [...weekdays.map((g) => g.key)].sort((a, b) => order.indexOf(a) - order.indexOf(b)), 'weekdays in Mon-Sun order');
  console.log('finance grouping OK: category ranking, weekday order');
}

// The tail folds into "Others", kept last, with sums preserved.
{
  const many = Array.from({ length: 10 }, (_, i) => ({
    date: '2024-01-05', description: `Shop ${i}`, amount: -(100 - i * 5), category: `Cat${i}`,
  }));
  const groups = groupFinance(many, 'Category', 4);
  assert.equal(groups.length, 4, 'top groups + Others');
  assert.equal(groups[groups.length - 1].key, 'Others', 'Others kept last');
  const totalSpent = many.reduce((s, t) => s + -t.amount, 0);
  assert.equal(groups.reduce((s, g) => s + g.spent, 0), totalSpent, 'Others preserves the total');
  assert.equal(financeBreakdown(many, 'Description', 3).at(-1).key, 'Others', 'tooltip breakdown folds the same way');
  console.log('finance others OK: tail folds into Others, totals preserved');
}

// Evolution series: top categories per month, aligned to the month axis.
{
  const { months, series } = monthlyCategorySeries(tx, 2);
  assert.deepEqual(months, ['2024-01', '2024-02']);
  const housing = series.find((s) => s.category === 'Housing');
  assert.deepEqual(housing.values, [900, 900]);
  assert.deepEqual(series.find((s) => s.category === 'Groceries').values, [50, 70]);
  assert.deepEqual(series.find((s) => s.category === 'Others').values, [0, 15], 'small categories fold into Others per month');
  console.log('finance evolution OK: per-month category series with Others');
}

// Category filter: empty selection keeps everything; otherwise only matches.
{
  assert.deepEqual(filterFinanceByCategories(tx, []), tx, 'empty filter keeps all');
  assert.ok(filterFinanceByCategories(tx, ['Housing']).every((t) => t.category === 'Housing'), 'only selected categories remain');
  assert.equal(filterFinanceByCategories(tx, ['Housing']).length, 2, 'filter preserves every matching transaction');
  assert.deepEqual(filterFinanceByCategories(tx, ['Nope']), [], 'unknown category matches nothing');
  const filtered = filterFinanceByCategories(tx, ['Housing', 'Groceries']);
  assert.deepEqual(cumulativeNetByMonth(filtered).map((p) => p.cumulative), [-950, -1920], 'charts downstream of the filter stay consistent');
  console.log('finance filter OK: category filter feeds every chart');
}

// Cumulative net: running received-minus-spent across months.
{
  const points = cumulativeNetByMonth(tx);
  assert.deepEqual(points.map((p) => p.net), [1550, 1515]);
  assert.deepEqual(points.map((p) => p.cumulative), [1550, 3065]);
  assert.deepEqual(cumulativeNetByMonth([]), [], 'empty input, empty series');
  console.log('finance cumulative OK: running net across months');
}

// Descriptive-only guard: no helper output prescribes action.
{
  const blob = JSON.stringify([groupFinance(tx, 'Category'), monthlyCategorySeries(tx), cumulativeNetByMonth(tx)]);
  assert.ok(!/you should|cut |stop spending|avoid /i.test(blob), 'chart data stays descriptive');
}

// D3 wiring: the Finance Path renders all three charts with group controls.
{
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main.ts'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
  for (const marker of [
    'drawFinanceOverview', 'drawFinanceEvolution', 'drawFinanceCumulative',
    'id="finOverview"', 'id="finEvolution"', 'id="finCumulative"',
    'id="finGroup1"', 'id="finGroup2"', 'finEvolutionLegend',
    'prefers-reduced-motion', 'Data as list',
  ]) {
    assert.ok(main.includes(marker), `finance chart wiring present: ${marker}`);
  }
  assert.ok(main.includes('financeBreakdown'), 'overview tooltip breaks down by the then-by key');
  for (const marker of [
    'finance-card', 'fin-scroll', 'data-fin-cat', 'data-fin-metric',
    'filterFinanceByCategories', 'finOverviewScroll',
  ]) {
    assert.ok(main.includes(marker) || css.includes(marker), `finance full-width/filter wiring present: ${marker}`);
  }
  console.log('finance layout OK: full-width scrollable view with filters');
  assert.ok(css.includes('.fin-tip') && css.includes('.fin-legend-chip') && css.includes('.fin-zero'), 'finance chart styles present');
  console.log('finance wiring OK: three D3 charts, group controls, tooltip, list fallback');
}
