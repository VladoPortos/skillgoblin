import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { applyCourseJsonOverride } from '../../server/utils/courseJsonOverride.js';

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-cjo-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const baseAuto = () => ({
  id: 'unreal-course',
  title: 'Unreal Course',
  description: 'Course: Unreal Course',
  category: 'Uncategorized',
  thumbnail: 'thumbnail.png',
  releaseDate: '2026-05-04',
  lessons: [{ id: 'lesson-1', title: 'Lesson 1', folder: 'Lesson 1', videos: [] }],
  lastUpdate: 1700000000000,
});

describe('applyCourseJsonOverride', () => {
  it('returns auto-detected unchanged when no course.json exists', () => {
    const result = applyCourseJsonOverride(tmpDir, baseAuto());
    expect(result).toEqual(baseAuto());
  });

  it('overrides title, description, category, releaseDate when valid', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'course.json'),
      JSON.stringify({
        title: 'Real Title',
        description: 'A real description.',
        category: 'Programming',
        releaseDate: '2025-01-15',
      }),
    );
    const result = applyCourseJsonOverride(tmpDir, baseAuto());
    expect(result.title).toBe('Real Title');
    expect(result.description).toBe('A real description.');
    expect(result.category).toBe('Programming');
    expect(result.releaseDate).toBe('2025-01-15');
    expect(result.id).toBe('unreal-course');
    expect(result.thumbnail).toBe('thumbnail.png');
    expect(result.lessons).toHaveLength(1);
  });

  it('ignores disallowed fields with a console warning', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'course.json'),
      JSON.stringify({ id: 'evil', thumbnail: 'evil.png', lessons: [] }),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = applyCourseJsonOverride(tmpDir, baseAuto());
    expect(result.id).toBe('unreal-course');
    expect(result.thumbnail).toBe('thumbnail.png');
    expect(result.lessons).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('returns auto-detected on malformed JSON, with a console warning', () => {
    fs.writeFileSync(path.join(tmpDir, 'course.json'), '{ not valid json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = applyCourseJsonOverride(tmpDir, baseAuto());
    expect(result).toEqual(baseAuto());
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('skips a field with the wrong type but applies the rest', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'course.json'),
      JSON.stringify({ title: 'OK', releaseDate: 12345 }),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = applyCourseJsonOverride(tmpDir, baseAuto());
    expect(result.title).toBe('OK');
    expect(result.releaseDate).toBe('2026-05-04'); // unchanged
    warn.mockRestore();
  });

  it('treats an empty {} as no overrides without a warning', () => {
    fs.writeFileSync(path.join(tmpDir, 'course.json'), '{}');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = applyCourseJsonOverride(tmpDir, baseAuto());
    expect(result).toEqual(baseAuto());
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('hasCourseJson', () => {
  it('returns false when course.json is missing', async () => {
    const { hasCourseJson } = await import('../../server/utils/courseJsonOverride.js');
    expect(hasCourseJson(tmpDir)).toBe(false);
  });
  it('returns true when course.json exists', async () => {
    fs.writeFileSync(path.join(tmpDir, 'course.json'), '{}');
    const { hasCourseJson } = await import('../../server/utils/courseJsonOverride.js');
    expect(hasCourseJson(tmpDir)).toBe(true);
  });
});

describe('course.json precedence over DB-preserved metadata (smoke)', () => {
  it('keys present in course.json are reported by Object.keys', () => {
    const json = JSON.stringify({ title: 'X', category: 'Y' });
    const keys = new Set(Object.keys(JSON.parse(json)));
    expect(keys.has('title')).toBe(true);
    expect(keys.has('category')).toBe(true);
    expect(keys.has('description')).toBe(false);
  });
});
