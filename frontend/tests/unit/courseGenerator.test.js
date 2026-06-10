import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { generateLessonsFromFolder } from '../../server/utils/courseGenerator.js';

// Filesystem-driven tests for the lesson generator. Each test builds a
// throwaway course folder under os.tmpdir(), runs the real readdirSync code
// path, and asserts on the resulting lesson tree. Keeps the test honest:
// regressions in the extension filter or title-strip will fail here.
let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-cg-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const touch = (relPath) => {
  const full = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, '');
};

describe('generateLessonsFromFolder', () => {
  it('returns empty array for an empty folder', async () => {
    expect(await generateLessonsFromFolder(tmpDir)).toEqual([]);
  });

  it('groups root-level video files into a "Main Content" lesson', async () => {
    touch('01-intro.mp4');
    touch('02-second.mp4');
    const lessons = await generateLessonsFromFolder(tmpDir);
    expect(lessons).toHaveLength(1);
    expect(lessons[0]).toMatchObject({
      id: 'main-content',
      title: 'Main Content',
      folder: '',
    });
    expect(lessons[0].videos.map((v) => v.file)).toEqual(['01-intro.mp4', '02-second.mp4']);
  });

  it('surfaces .mkv files in lessons (regression guard for MKV support)', async () => {
    touch('Lesson 1/01-intro.mkv');
    const lessons = await generateLessonsFromFolder(tmpDir);
    const lesson1 = lessons.find((l) => l.title === 'Lesson 1');
    expect(lesson1).toBeDefined();
    expect(lesson1.videos).toEqual([{ title: '01-intro', file: '01-intro.mkv' }]);
  });

  it('surfaces .avi files in lessons', async () => {
    touch('Lesson 1/old-clip.avi');
    const lessons = await generateLessonsFromFolder(tmpDir);
    expect(lessons[0].videos).toEqual([{ title: 'old-clip', file: 'old-clip.avi' }]);
  });

  it('mixes .mp4 and .mkv siblings in the same lesson', async () => {
    touch('Lesson 1/01-intro.mp4');
    touch('Lesson 1/02-followup.mkv');
    const lessons = await generateLessonsFromFolder(tmpDir);
    const titles = lessons[0].videos.map((v) => v.file);
    expect(titles.sort()).toEqual(['01-intro.mp4', '02-followup.mkv']);
  });

  it('ignores extensions outside the supported set (.mov, .webm, .flv, .wmv, .srt, .pdf)', async () => {
    touch('Lesson 1/clip.mov');
    touch('Lesson 1/clip.webm');
    touch('Lesson 1/clip.flv');
    touch('Lesson 1/clip.wmv');
    touch('Lesson 1/clip.srt');
    touch('Lesson 1/notes.pdf');
    expect(await generateLessonsFromFolder(tmpDir)).toEqual([]);
  });

  it('strips any video extension from the title (not just .mp4)', async () => {
    touch('01-intro.mkv');
    touch('Lesson 1/02-followup.avi');
    const lessons = await generateLessonsFromFolder(tmpDir);
    const main = lessons.find((l) => l.id === 'main-content');
    const lesson1 = lessons.find((l) => l.title === 'Lesson 1');
    expect(main.videos[0].title).toBe('01-intro');
    expect(lesson1.videos[0].title).toBe('02-followup');
  });

  it('attaches a .vtt subtitle hint when a sibling .srt is present', async () => {
    touch('Lesson 1/01-intro.mkv');
    touch('Lesson 1/01-intro.srt');
    const lessons = await generateLessonsFromFolder(tmpDir);
    expect(lessons[0].videos[0]).toEqual({
      title: '01-intro',
      file: '01-intro.mkv',
      subtitle: '01-intro.vtt',
    });
  });

  it('skips empty lesson directories (no videos = no lesson row)', async () => {
    fs.mkdirSync(path.join(tmpDir, 'Lesson Empty'));
    touch('Lesson 1/01.mp4');
    const lessons = await generateLessonsFromFolder(tmpDir);
    expect(lessons.map((l) => l.title)).toEqual(['Lesson 1']);
  });

  it('replaces underscores with spaces in titles', async () => {
    touch('my_intro_clip.mp4');
    const lessons = await generateLessonsFromFolder(tmpDir);
    expect(lessons[0].videos[0].title).toBe('my intro clip');
  });
});
