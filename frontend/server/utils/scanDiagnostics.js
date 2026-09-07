const history = [];
export function recordScanError(course, error) {
  history.push({ at: new Date().toISOString(), course: String(course).slice(0, 256), message: String(error?.message || error).slice(0, 1000) });
  if (history.length > 100) history.splice(0, history.length - 100);
}
export function getScanErrors() { return history.map(entry => ({ ...entry })); }
