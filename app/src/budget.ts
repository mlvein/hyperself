// Bank statement parsing (CSV): tolerant column detection, honest stats.
// Every bank exports differently, so headers are matched by pattern and
// unparsable rows are counted, never silently dropped. Local-only.
export interface Transaction {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // negative = money out, positive = money in
  category: string;
}

export interface StatementParse {
  transactions: Transaction[];
  totalRows: number;
  parsedRows: number;
  unparsedRows: number;
  columns: { date: string; description: string; amount: string };
}

/** Minimal CSV reader: quoted fields, embedded commas/newlines, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

const DATE_HEADERS = ['date', 'transaction date', 'posted', 'posting date', 'booking date'];
const DESC_HEADERS = ['description', 'details', 'narrative', 'merchant', 'payee', 'name', 'memo', 'transaction'];
const AMOUNT_HEADERS = ['amount', 'value', 'sum', 'total'];
const DEBIT_HEADERS = ['debit', 'money out', 'paid out', 'withdrawal', 'out'];
const CREDIT_HEADERS = ['credit', 'money in', 'paid in', 'deposit', 'in'];

function findColumn(headers: string[], candidates: string[]): number {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const candidate of candidates) {
    const idx = lower.findIndex((h) => h === candidate || h.includes(candidate));
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[$£€,\s]/g, '').replace(/^\((.+)\)$/, '-$1');
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function parseDate(raw: string): string | null {
  const text = raw.trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (slash) {
    let [, a, b, y] = slash;
    if (y.length === 2) y = `20${y}`;
    // Assume month-first unless the first field cannot be a month.
    const monthFirst = Number(a) <= 12;
    const month = monthFirst ? a : b;
    const day = monthFirst ? b : a;
    return `${y}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) {
    // Local components: toISOString would shift the calendar day by timezone.
    const d = new Date(parsed);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return null;
}

const CATEGORY_RULES: Array<{ category: string; pattern: RegExp }> = [
  { category: 'Income', pattern: /salary|payroll|wages|direct deposit|refund|interest paid/i },
  { category: 'Housing', pattern: /rent|mortgage|landlord|property/i },
  { category: 'Groceries', pattern: /grocery|groceries|supermarket|market|tesco|sainsbury|walmart|aldi|lidl|trader joe|whole foods/i },
  { category: 'Dining', pattern: /restaurant|cafe|coffee|starbucks|mcdonald|burger|pizza|bakery|diner|bar\b|pub\b/i },
  { category: 'Transport', pattern: /uber|lyft|taxi|train|rail|bus|fuel|petrol|shell|bp\b|parking|tfl|transit/i },
  { category: 'Utilities', pattern: /electric|water|gas bill|internet|broadband|phone|mobile|utility|utilities|council tax/i },
  { category: 'Health', pattern: /pharmacy|chemist|doctor|dental|clinic|hospital|gym|fitness/i },
  { category: 'Subscriptions', pattern: /netflix|spotify|apple\.com|google|amazon prime|subscription|membership/i },
  { category: 'Shopping', pattern: /amazon|ebay|etsy|store|shop|retail|ikea|target|costco/i },
  { category: 'Transfers', pattern: /transfer|payment to|standing order|direct debit/i },
];

export function categorize(description: string, amount: number): string {
  if (amount > 0) {
    const income = CATEGORY_RULES.find((r) => r.category === 'Income' && r.pattern.test(description));
    if (income) return 'Income';
  }
  for (const rule of CATEGORY_RULES) {
    if (rule.category !== 'Income' && rule.pattern.test(description)) return rule.category;
  }
  return amount > 0 ? 'Income' : 'Other';
}

export function parseStatement(text: string): StatementParse {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return { transactions: [], totalRows: 0, parsedRows: 0, unparsedRows: 0, columns: { date: '', description: '', amount: '' } };
  }
  const headers = rows[0];
  const dateCol = findColumn(headers, DATE_HEADERS);
  const descCol = findColumn(headers, DESC_HEADERS);
  const amountCol = findColumn(headers, AMOUNT_HEADERS);
  const debitCol = findColumn(headers, DEBIT_HEADERS);
  const creditCol = findColumn(headers, CREDIT_HEADERS);
  const columns = {
    date: dateCol >= 0 ? headers[dateCol] : '',
    description: descCol >= 0 ? headers[descCol] : '',
    amount:
      amountCol >= 0
        ? headers[amountCol]
        : [debitCol >= 0 ? headers[debitCol] : '', creditCol >= 0 ? headers[creditCol] : '']
            .filter(Boolean)
            .join(' / '),
  };
  const usable = dateCol >= 0 && descCol >= 0 && (amountCol >= 0 || debitCol >= 0 || creditCol >= 0);
  const transactions: Transaction[] = [];
  let unparsed = 0;
  if (usable) {
    for (const row of rows.slice(1)) {
      const date = parseDate(row[dateCol] ?? '');
      const description = (row[descCol] ?? '').trim();
      let amount: number | null = null;
      if (amountCol >= 0) amount = parseAmount(row[amountCol] ?? '');
      if (amount === null && (debitCol >= 0 || creditCol >= 0)) {
        const debit = debitCol >= 0 ? parseAmount(row[debitCol] ?? '') : null;
        const credit = creditCol >= 0 ? parseAmount(row[creditCol] ?? '') : null;
        if (debit !== null && debit !== 0) amount = -Math.abs(debit);
        else if (credit !== null && credit !== 0) amount = Math.abs(credit);
      }
      if (!date || !description || amount === null || amount === 0) {
        unparsed += 1;
        continue;
      }
      transactions.push({ date, description, amount, category: categorize(description, amount) });
    }
  } else {
    unparsed = rows.length - 1;
  }
  transactions.sort((a, b) => (a.date < b.date ? -1 : 1));
  return {
    transactions,
    totalRows: rows.length - 1,
    parsedRows: transactions.length,
    unparsedRows: unparsed,
    columns,
  };
}

// --- PDF statements: pdf.js gives space-joined page text, so transactions
// are recovered from date-anchored segments ("01 Mar 2025 DESC -4.50 1,200.00").

const PDF_DATE =
  /(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})/gi;
const MONEY = /\(?-?\$?[\d,]+\.\d{2}\)?\s*(?:CR|DR)?/gi;

/** Segments of PDF text, each starting at a date (pdf text has few newlines). */
export function pdfStatementSegments(text: string): string[] {
  const flat = text.replace(/\s+/g, ' ');
  const starts: number[] = [];
  for (const match of flat.matchAll(PDF_DATE)) {
    if (match.index !== undefined) starts.push(match.index);
  }
  return starts.map((at, i) => flat.slice(at, starts[i + 1] ?? flat.length).trim()).filter(Boolean);
}

/** True when the text carries at least 3 dated money segments. */
export function looksLikePdfStatement(text: string, filename = ''): boolean {
  if (/\b(bank|statement|account summary|current account|savings account)\b/i.test(filename)) return true;
  const segments = pdfStatementSegments(text);
  const withMoney = segments.filter((s) => (s.match(MONEY) ?? []).length >= 1).length;
  return withMoney >= 3 && /\b(balance|statement|account)\b/i.test(text);
}

export function parsePdfStatement(text: string): StatementParse {
  const segments = pdfStatementSegments(text);
  const transactions: Transaction[] = [];
  let unparsed = 0;
  for (const segment of segments) {
    const dateMatch = segment.match(PDF_DATE);
    const date = dateMatch ? parseDate(dateMatch[0]) : null;
    const money = [...segment.matchAll(MONEY)];
    if (!date || money.length === 0) {
      unparsed += 1;
      continue;
    }
    // Layout is DATE DESCRIPTION AMOUNT [BALANCE]: the amount comes first.
    const amountToken = money[0][0];
    let amount = parseAmount(amountToken.replace(/\s*(CR|DR)$/i, ''));
    if (amount === null) {
      unparsed += 1;
      continue;
    }
    const afterDate = segment.slice((dateMatch?.[0].length ?? 0));
    const descEnd = afterDate.indexOf(money[0][0]);
    const description = (descEnd >= 0 ? afterDate.slice(0, descEnd) : afterDate)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    if (!description) {
      unparsed += 1;
      continue;
    }
    if (amount > 0) {
      // Unsigned PDF amounts: credits say so, everything else is money out.
      const credit = /\b(CR|credit|deposit|salary|payroll|refund|interest)\b/i.test(segment);
      amount = credit ? amount : -amount;
    }
    transactions.push({ date, description, amount, category: categorize(description, amount) });
  }
  transactions.sort((a, b) => (a.date < b.date ? -1 : 1));
  return {
    transactions,
    totalRows: segments.length,
    parsedRows: transactions.length,
    unparsedRows: unparsed,
    columns: { date: 'PDF statement', description: 'PDF statement', amount: 'PDF statement' },
  };
}

export interface MonthlyTotal {
  month: string; // YYYY-MM
  spent: number;
  received: number;
}

export function monthlyTotals(transactions: Transaction[]): MonthlyTotal[] {
  const byMonth = new Map<string, MonthlyTotal>();
  for (const t of transactions) {
    const month = t.date.slice(0, 7);
    const row = byMonth.get(month) ?? { month, spent: 0, received: 0 };
    if (t.amount < 0) row.spent += -t.amount;
    else row.received += t.amount;
    byMonth.set(month, row);
  }
  return [...byMonth.values()]
    .map((r) => ({
      month: r.month,
      spent: Math.round(r.spent * 100) / 100,
      received: Math.round(r.received * 100) / 100,
    }))
    .sort((a, b) => (a.month < b.month ? -1 : 1));
}

export interface RecurringCost {
  description: string;
  category: string;
  count: number;
  average: number;
  total: number;
}

export function recurringCosts(transactions: Transaction[], minCount = 2): RecurringCost[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    if (t.amount >= 0) continue;
    const key = t.description.toLowerCase().replace(/\s+/g, ' ').trim();
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .filter(([, list]) => list.length >= minCount)
    .map(([key, list]) => ({
      description: list[0].description,
      category: list[0].category,
      count: list.length,
      average: Math.round((list.reduce((s, t) => s + -t.amount, 0) / list.length) * 100) / 100,
      total: Math.round(list.reduce((s, t) => s + -t.amount, 0) * 100) / 100,
      key,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .map(({ description, category, count, average, total }) => ({ description, category, count, average, total }));
}

/** Descriptive insights only — patterns, never prescriptive advice. */
export function budgetInsights(transactions: Transaction[]): string[] {
  const insights: string[] = [];
  if (transactions.length === 0) return insights;
  const summary = summarizeTransactions(transactions);
  const top = summary.byCategory[0];
  if (top && summary.spent > 0) {
    insights.push(
      `${top.category} is your largest spending category at ${top.total.toFixed(2)} (${Math.round((top.total / summary.spent) * 100)}% of all spending).`,
    );
  }
  const months = monthlyTotals(transactions);
  if (months.length >= 2) {
    const prev = months[months.length - 2];
    const last = months[months.length - 1];
    if (prev.spent > 0) {
      const change = Math.round(((last.spent - prev.spent) / prev.spent) * 100);
      insights.push(
        change === 0
          ? `Spending held steady between ${prev.month} and ${last.month} (${last.spent.toFixed(2)}).`
          : `Spending ${change > 0 ? 'rose' : 'fell'} ${Math.abs(change)}% from ${prev.month} (${prev.spent.toFixed(2)}) to ${last.month} (${last.spent.toFixed(2)}).`,
      );
    }
  }
  const subs = summary.byCategory.find((c) => c.category === 'Subscriptions');
  if (subs) insights.push(`Subscriptions total ${subs.total.toFixed(2)} across the imported period.`);
  const recurring = recurringCosts(transactions);
  if (recurring.length > 0) {
    const r = recurring[0];
    insights.push(`"${r.description}" recurs ${r.count} times, averaging ${r.average.toFixed(2)} each time.`);
  }
  return insights.slice(0, 3);
}

/** Import parsed transactions through a callback (keeps budget.ts store-free). */
import type { Entry } from './types';

/** Rebuild transactions from imported finance entries (Day 3 import format). */
export function transactionsFromEntries(entries: Entry[]): Transaction[] {
  const out: Transaction[] = [];
  for (const e of entries) {
    if (e.deleted_at !== null || e.type !== 'finance') continue;
    const amountMatch = e.body.match(/Amount:\s*(-?[\d.]+)/);
    const categoryMatch = e.body.match(/Category:\s*([^·\n]+)/);
    if (!amountMatch) continue;
    out.push({
      date: e.created_at.slice(0, 10),
      description: e.title,
      amount: Number(amountMatch[1]),
      category: categoryMatch ? categoryMatch[1].trim() : 'Other',
    });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function summarizeTransactions(transactions: Transaction[]): {
  spent: number;
  received: number;
  byCategory: Array<{ category: string; total: number }>;
} {
  let spent = 0;
  let received = 0;
  const byCat = new Map<string, number>();
  for (const t of transactions) {
    if (t.amount < 0) {
      spent += -t.amount;
      byCat.set(t.category, (byCat.get(t.category) ?? 0) + -t.amount);
    } else received += t.amount;
  }
  return {
    spent: Math.round(spent * 100) / 100,
    received: Math.round(received * 100) / 100,
    byCategory: [...byCat.entries()]
      .map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total),
  };
}
