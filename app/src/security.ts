// Local-only sensitivity scan. Heuristic pattern matching over entry text —
// findings never leave the browser. Advisory, not a guarantee: patterns can
// miss secrets and can flag innocent text. Review, don't trust blindly.
import { isImageFilename } from './image';
import type { Entry } from './types';

export type FindingLevel = 'info' | 'warn' | 'high';

export interface Finding {
  level: FindingLevel;
  message: string;
  suggestion: string;
}

interface Check {
  pattern: RegExp;
  message: string;
  suggestion: string;
}

// NOTE: no /g flags — .test() with global flag is stateful and would skip.
const HIGH_CHECKS: Check[] = [
  {
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    message: 'Possible private key',
    suggestion: 'Remove the key material; reference where it is stored instead.',
  },
  {
    pattern: /(api[_-]?key|api[_-]?secret|secret[_-]?key|password|passwd|pwd)\s*[:=]\s*\S+/i,
    message: 'Possible embedded secret or password',
    suggestion: 'Delete the value from the entry and rotate it if it was real.',
  },
  {
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
    message: 'Possible AWS access key',
    suggestion: 'Remove it and rotate the key in AWS immediately.',
  },
  {
    pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/,
    message: 'Possible card number',
    suggestion: 'Remove the number; keep only the last four digits if needed.',
  },
  {
    pattern: /\b\d{3}-\d{2}-\d{4}\b/,
    message: 'Possible SSN',
    suggestion: 'Remove it; this format is high-risk if shared.',
  },
  {
    pattern: /\b(passport|driver'?s?\s*license|national\s*id)\s*(no|number|#)\s*[:.]?\s*[A-Z0-9][A-Z0-9-]+/i,
    message: 'Possible ID number',
    suggestion: 'Remove the number; keep only a reminder of where the document is.',
  },
  {
    pattern: /\bgh[pousr]_[A-Za-z0-9]{10,}/,
    message: 'Possible GitHub token',
    suggestion: 'Revoke it on GitHub, purge it from history, then delete it here.',
  },
  {
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{6,}/,
    message: 'Possible Slack token',
    suggestion: 'Revoke it in Slack admin, delete the message, then delete it here.',
  },
  {
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    message: 'Possible JWT / bearer token',
    suggestion: 'Treat it as compromised: expire the session and delete the value.',
  },
];

// Simulated breach corpus. Local-only demo data: no network lookup, no real
// breach verdict. Matches flag for review; the user confirms or dismisses.
const BREACH_CORPUS: Array<{ email: string; breach: string }> = [
  { email: 'maya@gmail.com', breach: 'Adobe breach (2013, simulated)' },
  { email: 'dana@example.com', breach: 'Collection #1 (2019, simulated)' },
  { email: 'elena@example.com', breach: 'LinkedIn scrape (2021, simulated)' },
];

const WARN_CHECKS: Check[] = [
  {
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
    message: 'Contains an email address',
    suggestion: 'Confirm it belongs here; prefer entries without contact details.',
  },
  {
    pattern: /(\+\d{1,3}[- ]?)?\b\d{3}[- .]?\d{3}[- .]?\d{4}\b/,
    message: 'Possible phone number',
    suggestion: 'Confirm it belongs here; prefer entries without contact details.',
  },
];

const STALE_DAYS = 90;

interface ImageCheck {
  pattern: RegExp;
  level: FindingLevel;
  message: string;
  suggestion: string;
}

/** Extra heuristics for imported images, over OCR text + filename. Advisory only. */
const IMAGE_CHECKS: ImageCheck[] = [
  {
    pattern: /\b(passport|driver'?s\s*licen[cs]e|national\s+id|id\s+card|birth\s+certificate|visa\s+document)\b/i,
    level: 'high',
    message: 'Image may contain an ID document',
    suggestion: 'Keep this personal, never share it, and consider deleting the image entry.',
  },
  {
    pattern: /\b(bank\s+statement|account\s+number|routing\s+number|iban|credit\s+card|debit\s+card|tax\s+return)\b/i,
    level: 'high',
    message: 'Image may contain financial information',
    suggestion: 'Keep this personal; crop or delete it before any export or share.',
  },
  {
    pattern: /\b(nude|naked|nsfw|explicit|intimate\s+photo|topless)\b/i,
    level: 'high',
    message: 'Image flagged as potentially inappropriate',
    suggestion: 'Review this image yourself; if it is intimate content, keep it off shared devices and never export it.',
  },
  {
    pattern: /\b(screenshot|chat\s+history|text\s+message|imessage|whatsapp|direct\s+message|\bdm\b)\b/i,
    level: 'warn',
    message: 'Image may contain a private conversation',
    suggestion: 'Check everyone in the conversation is comfortable with this being kept; names may be tagged.',
  },
  {
    pattern: /\b(school\s+report|report\s+card|pediatric|minor'?s|child'?s\s+(medical|school|record))\b/i,
    level: 'warn',
    message: 'Image may contain information about a minor',
    suggestion: 'Keep this personal and review who can access this device.',
  },
];

export function isImageEntry(entry: Entry): boolean {
  return (
    isImageFilename(entry.source_label ?? '') ||
    entry.body.includes('[Image transcript]') ||
    entry.body.includes('[Image:')
  );
}

export function scanEntry(entry: Entry): Finding[] {
  const findings: Finding[] = [];
  const text = `${entry.title}\n${entry.body}`;
  if (isImageEntry(entry)) {
    for (const check of IMAGE_CHECKS) {
      if (check.pattern.test(text)) {
        findings.push({ level: check.level, message: check.message, suggestion: check.suggestion });
      }
    }
  }
  for (const check of HIGH_CHECKS) {
    if (check.pattern.test(text)) {
      findings.push({ level: 'high', message: check.message, suggestion: check.suggestion });
    }
  }
  for (const check of WARN_CHECKS) {
    if (check.pattern.test(text)) {
      // Contact details in shared content are exposure: escalate.
      findings.push({
        level: entry.tag === 'shareable' ? 'high' : 'warn',
        message: check.message,
        suggestion: check.suggestion,
      });
    }
  }
  const lower = text.toLowerCase();
  for (const hit of BREACH_CORPUS) {
    if (lower.includes(hit.email.toLowerCase())) {
      findings.push({
        level: 'high',
        message: `Address appears in simulated breach corpus (${hit.breach})`,
        suggestion: 'Rotate the password, enable 2FA, and remove the address if unneeded.',
      });
    }
  }
  const ageDays = (Date.now() - Date.parse(entry.updated_at)) / 86400000;
  if (Number.isFinite(ageDays) && ageDays > STALE_DAYS) {
    findings.push({
      level: 'info',
      message: `Last updated ${Math.floor(ageDays)} days ago`,
      suggestion: 'Review for accuracy; update or archive it.',
    });
  }
  if (entry.tag === 'shareable' && findings.length === 0) {
    findings.push({
      level: 'info',
      message: 'Shared externally',
      suggestion: 'Re-read before each export; packs include this entry.',
    });
  }
  return findings;
}

export function worstLevel(findings: Finding[]): FindingLevel | null {
  if (findings.some((f) => f.level === 'high')) return 'high';
  if (findings.some((f) => f.level === 'warn')) return 'warn';
  if (findings.length > 0) return 'info';
  return null;
}
