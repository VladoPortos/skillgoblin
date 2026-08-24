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
  return readTrackList(textTracks).map((track, index) => {
    const language = normalize(track?.language).toLowerCase();
    const rawLabel = normalize(track?.label);
    const generatedLabel = languageDisplayName(language, locale);
    const label = rawLabel && rawLabel.toLowerCase() !== language
      ? rawLabel
      : generatedLabel || rawLabel || language.toUpperCase() || `Track ${index + 1}`;
    const preference = textTrackPreference(track);
    return {
      id: `${index}:${preference}`,
      index,
      label,
      language,
      preference,
    };
  });
}

export function chooseTextTrack(options, preferred, fallbackIndex = -1) {
  if (!Array.isArray(options) || options.length === 0) return '';
  const preferredOption = preferred
    ? options.find((option) => option.preference === preferred)
    : null;
  if (preferredOption) return preferredOption.id;
  const fallback = options.find((option) => option.index === fallbackIndex);
  return (fallback || options[0]).id;
}

export function applyTextTrackSelection(textTracks, selectedId) {
  const options = listTextTrackOptions(textTracks);
  for (const option of options) {
    const desiredMode = option.id === selectedId ? 'showing' : 'hidden';
    if (textTracks[option.index].mode !== desiredMode) {
      textTracks[option.index].mode = desiredMode;
    }
  }
}
