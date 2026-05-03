// Operator branding values read from env at server startup. Defaults are
// chosen to preserve the current SkillGoblin look exactly when no env is
// set, so existing installs upgrade with no behavior change.
//
// Color validation is strict #RRGGBB or #RGB hex. Anything else (CSS
// named colors, rgb(), typos) falls back to the default and a one-line
// warning is logged at startup via warnInvalidColors().

const DEFAULT_NAME = 'SkillGoblin';
const DEFAULT_DESCRIPTION = 'A streamlined, self-hosted learning platform';
const DEFAULT_COLOR = '#111827'; // Tailwind gray-900 — matches the dark-by-default app

export function readBranding(env = process.env) {
  const name = trimToString(env.APP_NAME) || DEFAULT_NAME;
  const shortName = trimToString(env.APP_SHORT_NAME) || name;
  const description = trimToString(env.APP_DESCRIPTION) || DEFAULT_DESCRIPTION;
  const themeColor = validHex(env.APP_THEME_COLOR) || DEFAULT_COLOR;
  const backgroundColor = validHex(env.APP_BACKGROUND_COLOR) || DEFAULT_COLOR;
  return { name, shortName, description, themeColor, backgroundColor };
}

export function validHex(v) {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed) || /^#[0-9a-fA-F]{3}$/.test(trimmed)) return trimmed;
  return null;
}

export function warnInvalidColors(env = process.env, log = console.warn) {
  for (const key of ['APP_THEME_COLOR', 'APP_BACKGROUND_COLOR']) {
    const raw = env[key];
    if (typeof raw === 'string' && raw.trim() !== '' && !validHex(raw)) {
      log(`[branding] ignoring invalid ${key}=${JSON.stringify(raw)}; using default ${DEFAULT_COLOR}`);
    }
  }
}

function trimToString(v) {
  if (typeof v !== 'string') return '';
  return v.trim();
}
