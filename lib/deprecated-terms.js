const DEPRECATED_TERMS = [
  { label: 'AppMon', pattern: /\bapp\s*mon\b|\bappmon\b/i },
  { label: 'Ruxit', pattern: /\bruxit\b/i },
  { label: 'dynaTrace 6', pattern: /\bdyna[tT]race\s*6(\.\d+)?\b/ },
  { label: 'dynaTrace 7', pattern: /\bdyna[tT]race\s*7(\.\d+)?\b/ },
  { label: 'classic UI', pattern: /\bclassic\s+UI\b|\bclassic\s+environment\b/i },
  { label: 'ActiveGate classic', pattern: /\bclassic\s+ActiveGate\b/i },
  { label: 'OneAgent classic injection', pattern: /\bclassic\s+full[\s-]?stack\b/i },
  { label: 'Synthetic classic', pattern: /\bclassic\s+synthetic\b/i },
  { label: 'PurePath classic', pattern: /\bpurepath\s+classic\b/i },
  { label: 'Managed cluster (legacy)', pattern: /\bdynatrace\s+managed\s+(classic|legacy)\b/i },
];

const findDeprecatedMentions = (text) => {
  if (!text) return [];
  const hits = new Set();
  for (const { label, pattern } of DEPRECATED_TERMS) {
    if (pattern.test(text)) hits.add(label);
  }
  return [...hits];
};

module.exports = { DEPRECATED_TERMS, findDeprecatedMentions };
