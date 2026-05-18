// lib/classifier.ts

import type { ClassifyResult } from './types'

const PATTERNS: Array<{ regex: RegExp; message: string }> = [
  {
    regex: /\b\d{10,}\b/,
    message: 'Possible account number detected (10+ digit sequence)',
  },
  {
    regex: /\b\d{13}\b/,
    message: 'Possible Thai national ID detected (13-digit number)',
  },
  {
    regex: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/,
    message: 'Bearer token detected — remove before submitting',
  },
  {
    regex: /sk-[A-Za-z0-9]{20,}/,
    message: 'API secret key detected (sk- prefix)',
  },
  {
    regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/,
    message: 'Credit card number pattern detected',
  },
  {
    regex: /@[\w.-]+\.internal\b/i,
    message: 'Internal email domain detected',
  },
]

export function classify(text: string): ClassifyResult {
  const warnings: string[] = []

  for (const { regex, message } of PATTERNS) {
    if (regex.test(text)) {
      warnings.push(message)
    }
  }

  if (warnings.length > 0) {
    console.warn('[DataClassifier] Blocked:', warnings)
  }

  return { safe: warnings.length === 0, warnings }
}
