import { describe, expect, it } from 'vitest';
import {
  applyTextTrackSelection,
  chooseTextTrack,
  listTextTrackOptions,
} from '../../utils/textTracks.js';

function tracks(...items) {
  return items.map((item) => ({ kind: 'subtitles', mode: 'disabled', ...item }));
}

describe('text track selection', () => {
  it('builds buttons from the tracks exposed by the browser', () => {
    const options = listTextTrackOptions(tracks(
      { language: 'en', label: '' },
      { language: 'ru', label: 'Русский' },
    ), 'en');
    expect(options.map(({ label, language }) => ({ label, language }))).toEqual([
      { label: 'English', language: 'en' },
      { label: 'Русский', language: 'ru' },
    ]);
  });

  it('shows exactly the selected track and hides every other track', () => {
    const list = tracks(
      { language: 'en', label: 'English', mode: 'showing' },
      { language: 'ru', label: 'Русский', mode: 'showing' },
    );
    const options = listTextTrackOptions(list, 'en');
    applyTextTrackSelection(list, options[1].id);
    expect(list.map((track) => track.mode)).toEqual(['hidden', 'showing']);
  });

  it('collapses duplicate browser entries for the same language', () => {
    const list = tracks(
      { language: 'en', label: '', kind: 'subtitles', mode: 'showing' },
      { language: 'en', label: 'English', kind: 'captions', mode: 'showing' },
      { language: 'ru', label: 'Русский', mode: 'showing' },
    );
    const options = listTextTrackOptions(list, 'en');
    expect(options.map(({ label, language }) => ({ label, language }))).toEqual([
      { label: 'English', language: 'en' },
      { label: 'Русский', language: 'ru' },
    ]);
    expect(options[0].indices).toEqual([0, 1]);

    applyTextTrackSelection(list, options[0].id);
    expect(list.map((track) => track.mode)).toEqual(['showing', 'hidden', 'hidden']);
  });

  it('does not offer chapter or metadata tracks as subtitle choices', () => {
    const options = listTextTrackOptions(tracks(
      { language: 'en', label: 'English', kind: 'subtitles' },
      { language: 'en', label: 'Chapters', kind: 'chapters' },
      { language: '', label: 'Telemetry', kind: 'metadata' },
    ), 'en');

    expect(options.map(({ label }) => label)).toEqual(['English']);
  });

  it('leaves non-subtitle track modes untouched when applying a selection', () => {
    const list = tracks(
      { language: 'en', label: 'English', kind: 'subtitles' },
      { language: '', label: 'Telemetry', kind: 'metadata', mode: 'disabled' },
    );
    const options = listTextTrackOptions(list, 'en');

    applyTextTrackSelection(list, options[0].id);

    expect(list.map((track) => track.mode)).toEqual(['showing', 'disabled']);
  });

  it('prefers the authored sidecar inside a duplicate-language group', () => {
    const list = tracks(
      { language: 'en', label: 'Embedded English', kind: 'subtitles' },
      { language: 'en', label: 'English sidecar', kind: 'subtitles' },
    );
    const authoredTrackIndex = 1;
    const options = listTextTrackOptions(list, 'en', authoredTrackIndex);
    const selectedId = chooseTextTrack(options, '', authoredTrackIndex);

    applyTextTrackSelection(list, selectedId);

    expect(list.map((track) => track.mode)).toEqual(['hidden', 'showing']);
  });

  it('restores the exact preferred track inside a duplicate-language group', () => {
    const list = tracks(
      { language: 'en', label: 'Embedded English', kind: 'subtitles' },
      { language: 'en', label: 'English sidecar', kind: 'subtitles' },
    );
    const options = listTextTrackOptions(list, 'en');
    const selectedId = chooseTextTrack(options, options[0].preferences[1]);

    applyTextTrackSelection(list, selectedId);

    expect(options[0].id).toBe(selectedId);
    expect(list.map((track) => track.mode)).toEqual(['hidden', 'showing']);
  });

  it('hides every track when the selection is empty', () => {
    const list = tracks(
      { language: 'en', label: 'English', mode: 'showing' },
      { language: 'ru', label: 'Русский', mode: 'showing' },
    );
    applyTextTrackSelection(list, '');
    expect(list.map((track) => track.mode)).toEqual(['hidden', 'hidden']);
  });

  it('restores a preferred language or falls back to the authored track', () => {
    const options = listTextTrackOptions(tracks(
      { language: 'en', label: 'English' },
      { language: 'ru', label: 'Русский' },
    ), 'en');
    expect(chooseTextTrack(options, options[0].preference, 1)).toBe(options[0].id);
    expect(chooseTextTrack(options, '', 1)).toBe(options[1].id);
  });
});
