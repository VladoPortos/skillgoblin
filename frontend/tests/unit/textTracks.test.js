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
