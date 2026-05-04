// Pure category-matching helpers used by the Edit Course modal to suggest
// existing categories whose name appears (as a word) in the course title.
// No Vue imports — keeps this unit-testable in a plain Node environment.

export const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'with',
  'on', 'at', 'by', 'from', 'into', 'your', 'my', 'our', 'this', 'that',
  'is', 'are'
]);

export function tokenize(text) {
  // Short-circuit non-strings and empty input — split+filter would handle '' correctly,
  // but the early return avoids the allocation.
  if (typeof text !== 'string' || text.length === 0) return [];
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 0 && !STOPWORDS.has(token));
}

export function findMatchingCategories(title, categories, options = {}) {
  if (typeof title !== 'string' || !Array.isArray(categories) || categories.length === 0) {
    return [];
  }

  const titleTokens = new Set(tokenize(title));
  if (titleTokens.size === 0) return [];

  const currentNormalized = typeof options.currentCategory === 'string'
    ? options.currentCategory.trim().toLowerCase()
    : '';

  const matches = [];
  for (const category of categories) {
    if (typeof category !== 'string') continue;

    // normalized is used only for exclusion checks; catTokens drives the actual match.
    // The length===0 guard cheaply skips whitespace-only categories before tokenize() runs.
    const normalized = category.trim().toLowerCase();
    if (normalized.length === 0) continue;
    if (normalized === 'uncategorized') continue;
    if (currentNormalized && normalized === currentNormalized) continue;

    const catTokens = tokenize(category);
    if (catTokens.length === 0) continue;

    if (catTokens.every(token => titleTokens.has(token))) matches.push(category);
  }

  return matches;
}
