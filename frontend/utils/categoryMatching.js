// Pure category-matching helpers used by the Edit Course modal to suggest
// existing categories whose name appears (as a word) in the course title.
// No Vue imports — keeps this unit-testable in a plain Node environment.

export const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'with',
  'on', 'at', 'by', 'from', 'into', 'your', 'my', 'our', 'this', 'that',
  'is', 'are'
]);

export function tokenize(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 0 && !STOPWORDS.has(token));
}
