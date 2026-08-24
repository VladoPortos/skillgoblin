function readTrackList(textTracks) {
  if (!textTracks) return [];
  return Array.from({ length: textTracks.length }, (_, index) => textTracks[index]);
}

function normalize(value) {
  return String(value || '').trim();
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

export function listTextTrackOptions(textTracks, locale) {
  const options = [];
  const byLanguage = new Map();
  readTrackList(textTracks).forEach((track, index) => {
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
  if (preferredOption) return preferredOption.id;
  const fallback = options.find((option) => option.indices.includes(fallbackIndex));
  return (fallback || options[0]).id;
}

export function applyTextTrackSelection(textTracks, selectedId) {
  const options = listTextTrackOptions(textTracks);
  const selected = options.find((option) => option.id === selectedId);
  const selectedIndex = selected?.index ?? -1;
  for (let index = 0; index < textTracks.length; index += 1) {
    const desiredMode = index === selectedIndex ? 'showing' : 'hidden';
    if (textTracks[index].mode !== desiredMode) {
      textTracks[index].mode = desiredMode;
    }
  }
}
