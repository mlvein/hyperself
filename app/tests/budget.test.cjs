// Focused test: statement CSV parsing — flexible headers, honest stats.
const assert = require('node:assert/strict');
const { parseCsv, parseStatement, categorize, summarizeTransactions } = require('../.test-compiled/budget.js');

const quoted = parseCsv('a,"b, with comma",c\r\n1,"say ""hi""",3');
assert.equal(quoted[0][1], 'b, with comma', 'quoted commas survive');
assert.equal(quoted[1][1], 'say "hi"', 'escaped quotes survive');

const csv = [
  'Date,Description,Amount',
  '2024-01-05,"Tesco Supermarket, London",-54.20',
  '2024-01-06,Monthly Salary,2500.00',
  '2024-01-07,Uber Trip,-12.50',
  'not-a-date,Broken row,-9.99',
  '2024-01-08,Netflix Subscription,-15.99',
].join('\n');
const parsed = parseStatement(csv);
assert.equal(parsed.totalRows, 5);
assert.equal(parsed.parsedRows, 4, 'four rows parse');
assert.equal(parsed.unparsedRows, 1, 'broken row counted, not dropped silently');
assert.equal(parsed.columns.date, 'Date');
const tesco = parsed.transactions.find((t) => t.description.includes('Tesco'));
assert.equal(tesco.category, 'Groceries');
assert.equal(tesco.amount, -54.2);
assert.equal(parsed.transactions.find((t) => t.description.includes('Salary')).category, 'Income');

const split = parseStatement(
  ['Posted,Details,Debit,Credit', '01/05/2024,Rent Payment,900.00,', '01/06/2024,Refund,,25.00'].join('\n'),
);
assert.equal(split.parsedRows, 2, 'debit/credit columns parse');
assert.equal(split.transactions[0].amount, -900, 'debit becomes negative');
assert.equal(split.transactions[0].date, '2024-01-05', 'month-first slash dates');
assert.equal(split.transactions[1].amount, 25, 'credit stays positive');

const summary = summarizeTransactions(parsed.transactions);
assert.equal(summary.spent, 82.69);
assert.equal(summary.received, 2500);
assert.equal(summary.byCategory[0].category, 'Groceries', 'largest spend first');
assert.equal(categorize('Starbucks Coffee', -6), 'Dining');

console.log('budget OK: CSV quoting, flexible columns, honest unparsed count, categories');

// --- Day 5 analytics: monthly trend, recurring, descriptive insights ---
{
  const { monthlyTotals: mt, recurringCosts: rc, budgetInsights: bi } = require('../.test-compiled/budget.js');
  const txs = [
    { date: '2024-01-05', description: 'Rent Payment', amount: -900, category: 'Housing' },
    { date: '2024-01-06', description: 'Netflix Subscription', amount: -15, category: 'Subscriptions' },
    { date: '2024-02-05', description: 'Rent Payment', amount: -900, category: 'Housing' },
    { date: '2024-02-06', description: 'Netflix Subscription', amount: -15, category: 'Subscriptions' },
    { date: '2024-02-07', description: 'Tesco', amount: -50, category: 'Groceries' },
  ];
  assert.equal(mt(txs).length, 2, 'two monthly buckets');
  assert.equal(mt(txs)[1].spent, 965, 'monthly spend totals');
  assert.equal(rc(txs)[0].description, 'Rent Payment', 'recurring cost detected');
  assert.equal(rc(txs)[0].count, 2);
  const notes = bi(txs);
  assert.ok(notes.some((n) => /largest spending category/.test(n)), 'largest category insight');
  assert.ok(notes.some((n) => /rose|fell|steady/.test(n)), 'month trend insight');
  assert.ok(notes.every((n) => !/you should|cut |stop |avoid /i.test(n)), 'descriptive only, never prescriptive');
  console.log('budget analytics OK: monthly trend, recurring costs, descriptive insights');
}
