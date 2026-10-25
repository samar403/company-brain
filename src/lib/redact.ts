/**
 * Strips secrets before anything is stored or sent to a model. Company chat and
 * email are full of pasted credentials; a knowledge base for agents must never
 * repeat them.
 */
type Rule = { re: RegExp; replace: (match: string, ...groups: string[]) => string };

const fixed = (label: string) => () => label;

const RULES: Rule[] = [
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, replace: fixed("[private-key]") },
  { re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, replace: fixed("[slack-token]") },
  { re: /\bsk-ant-[A-Za-z0-9_-]{10,}/g, replace: fixed("[anthropic-key]") },
  { re: /\bsk-[A-Za-z0-9]{20,}/g, replace: fixed("[api-key]") },
  { re: /\bcb_live_[A-Za-z0-9_-]{16,}/g, replace: fixed("[company-brain-key]") },
  { re: /\bgh[pousr]_[A-Za-z0-9]{20,}/g, replace: fixed("[github-token]") },
  { re: /\bAKIA[0-9A-Z]{16}\b/g, replace: fixed("[aws-key]") },
  { re: /\bbearer\s+[A-Za-z0-9._~+/-]{20,}=*/gi, replace: fixed("Bearer [token]") },
  {
    re: /\b(password|passwd|pwd|secret|api[_ -]?key|token)(\s*[:=]\s*|\s+is\s+)([^\s,;]+)/gi,
    replace: (_m, key, sep) => `${key}${sep}[redacted]`,
  },
  {
    re: /\b(?:\d[ -]?){12,15}\d\b/g,
    replace: (m) => (luhn(m.replace(/\D/g, "")) ? "[card-number]" : m),
  },
];

function luhn(digits: string): boolean {
  if (digits.length < 13) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function redact(text: string): { text: string; count: number } {
  let count = 0;
  let out = text;
  for (const rule of RULES) {
    out = out.replace(rule.re, (match: string, ...rest: unknown[]) => {
      // rest = [...captureGroups, offset, input]
      const groups = rest.slice(0, -2).map((g) => (typeof g === "string" ? g : ""));
      const replaced = rule.replace(match, ...groups);
      if (replaced !== match) count++;
      return replaced;
    });
  }
  return { text: out, count };
}
