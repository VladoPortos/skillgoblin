function readTrackList(textTracks) {
  if (!textTracks) return [];
  return Array.from({ length: textTracks.length }, (_, index) => textTracks[index]);
}

function normalize(value) {
  return String(value || '').trim();
}

function isSubtitleTrack(track) {
  const kind = normalize(track?.kind).toLowerCase();
  return kind === 'subtitles' || kind === 'captions';
}

function usePhysicalTrack(option, position) {
  if (!option || position < 0 || position >= option.indices.length) return;
  option.index = option.indices[position];
  option.preference = option.preferences[position];
  option.id = `${option.index}:${option.preference}`;
}

export function textTrackPreference(track) {
  return JSON.stringify([
    normalize(track?.language).toLowerCase(),
    normalize(track?.label),
    normalize(track?.kind).toLowerCase(),
  ]);
}

function languageDisplayName(language, locale) {
  if (!language || typeof Intl === 'undefined' || typeof Intl.DisplayNames !== 'function') return '';
  try {
    return new Intl.DisplayNames([locale || 'en'], { type: 'language' }).of(language) || '';
  } catch {
    return '';
  }
}

export function listTextTrackOptions(textTracks, locale, representativeIndex = -1) {
  const options = [];
  const byLanguage = new Map();
  readTrackList(textTracks).forEach((track, index) => {
    if (!isSubtitleTrack(track)) return;
    const language = normalize(track?.language).toLowerCase();
    const rawLabel = normalize(track?.label);
    const generatedLabel = languageDisplayName(language, locale);
    const label = rawLabel && rawLabel.toLowerCase() !== language
      ? rawLabel
      : generatedLabel || rawLabel || language.toUpperCase() || `Track ${index + 1}`;
    const preference = textTrackPreference(track);
    // Browsers can expose one embedded stream more than once (for example as
    // both captions and subtitles). Present one choice per declared language,
    // while keeping untagged tracks distinct by label/kind.
    const groupKey = language
      ? `language:${language}`
      : `untagged:${rawLabel.toLowerCase()}:${normalize(track?.kind).toLowerCase()}`;
    const existing = byLanguage.get(groupKey);
    if (existing) {
      existing.indices.push(index);
      existing.preferences.push(preference);
      if (index === representativeIndex) {
        usePhysicalTrack(existing, existing.indices.length - 1);
      }
      return;
    }
    const option = {
      id: `${index}:${preference}`,
      index,
      indices: [index],
      label,
      language,
      preference,
      preferences: [preference],
    };
    byLanguage.set(groupKey, option);
    options.push(option);
  });
  return options;
}

export function chooseTextTrack(options, preferred, fallbackIndex = -1) {
  if (!Array.isArray(options) || options.length === 0) return '';
  const preferredOption = preferred
    ? options.find((option) => option.preferences.includes(preferred))
    : null;
  if (preferredOption) {
    usePhysicalTrack(preferredOption, preferredOption.preferences.indexOf(preferred));
    return preferredOption.id;
  }
  const fallback = options.find((option) => option.indices.includes(fallbackIndex));
  if (fallback) {
    usePhysicalTrack(fallback, fallback.indices.indexOf(fallbackIndex));
  }
  return (fallback || options[0]).id;
}

export function applyTextTrackSelection(textTracks, selectedId) {
  const selectedIndex = Number.parseInt(String(selectedId).split(':', 1)[0], 10);
  for (let index = 0; index < textTracks.length; index += 1) {
    const track = textTracks[index];
    if (!isSubtitleTrack(track)) continue;
    const desiredMode = Number.isInteger(selectedIndex) && index === selectedIndex
      ? 'showing'
      : 'hidden';
    if (track.mode !== desiredMode) {
      track.mode = desiredMode;
    }
  }
}
