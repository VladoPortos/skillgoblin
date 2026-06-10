// Extracts a human-readable message from a $fetch/h3 error, falling back
// to a caller-supplied default when the error carries no usable text.
export function extractApiError(error, fallback = 'An unexpected error occurred') {
  return error?.data?.statusMessage || error?.statusMessage || error?.message || fallback;
}
