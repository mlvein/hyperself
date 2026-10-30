// Psychology-informed handling of personal data (original implementation,
// informed by open-source mental-health skill principles: CosmicStack
// Mercury mental-health and the OpenClaw psychologist skill).
// Hyperself is a synthesis tool, not therapy: validate, describe rather
// than diagnose, and surface support when distress signals appear.
// Everything here is local pattern-matching — nothing is sent anywhere.
export const PSYCH_PRINCIPLES =
  'Handle personal material with care: reflect and validate feelings before offering perspective. ' +
  'Describe patterns, never diagnose conditions or label the person. You are a private assistant, not a therapist; ' +
  'do not promise confidentiality beyond this device. If the material suggests self-harm or crisis, respond supportively ' +
  'and point to professional help (US: call or text 988; Crisis Text Line: text HOME to 741741). ' +
  'Encourage real-world support alongside anything you offer.';

export const CRISIS_RESOURCES =
  'If you are struggling, you deserve support: US Suicide & Crisis Lifeline — call or text 988 (24/7). Crisis Text Line — text HOME to 741741. Outside the US, find local lines at findahelpline.org.';

export type CrisisLevel = 'high' | 'warn';

export interface CrisisSignal {
  level: CrisisLevel;
  message: string;
  suggestion: string;
}

const HIGH_PATTERNS: RegExp[] = [
  /\b(kill myself|end my life|want to die|wish i (was|were) dead|suicid(e|al|ality)|self[-\s]?harm|hurt(ing)? myself|cutting myself|no reason to live|better off dead|plan to (die|kill))\b/i,
];

const WARN_PATTERNS: RegExp[] = [
  /\b(hopeless|worthless|can't go on|cannot go on|no way out|give up on everything|nobody would care|burden to everyone)\b/i,
];

export function detectCrisisSignals(text: string): CrisisSignal[] {
  const signals: CrisisSignal[] = [];
  if (HIGH_PATTERNS.some((p) => p.test(text))) {
    signals.push({
      level: 'high',
      message: 'This entry may signal serious distress',
      suggestion: `You matter, and support exists beyond this app. ${CRISIS_RESOURCES} Consider telling someone you trust today.`,
    });
    return signals;
  }
  if (WARN_PATTERNS.some((p) => p.test(text))) {
    signals.push({
      level: 'warn',
      message: 'This entry sounds like a hopeless stretch',
      suggestion: `Be gentle with yourself, and consider reaching out to a person or professional. ${CRISIS_RESOURCES}`,
    });
  }
  return signals;
}

/** Assert generated copy stays descriptive: no diagnosis, no therapy claims. */
export function isDiagnosticLanguage(text: string): boolean {
  return /\b(you (have|are suffering from|are diagnosed)|diagnos(is|ed|tic)|depression disorder|anxiety disorder|mentally ill|your therapist|as your therapist)\b/i.test(
    text,
  );
}
