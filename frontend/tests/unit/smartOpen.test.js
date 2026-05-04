import { describe, it, expect } from 'vitest';
import { pickNextNotCompleted } from '../../utils/smartOpen.js';

const lessons = [
  {
    id: 'l1',
    title: 'Lesson 1',
    folder: 'Lesson 1',
    videos: [
      { title: 'V1', file: 'v1.mp4' },
      { title: 'V2', file: 'v2.mp4' },
    ],
  },
  {
    id: 'l2',
    title: 'Lesson 2',
    folder: 'Lesson 2',
    videos: [
      { title: 'V3', file: 'v3.mp4' },
      { title: 'V4', file: 'v4.mp4' },
    ],
  },
];

describe('pickNextNotCompleted', () => {
  it('picks lesson 1 video 1 with seekRatio 0 when there is no progress', () => {
    const r = pickNextNotCompleted(lessons, { completed: {}, progress: {} });
    expect(r.lessonId).toBe('l1');
    expect(r.videoIndex).toBe(0);
    expect(r.seekRatio).toBe(0);
  });

  it('skips completed videos and resumes the first non-completed', () => {
    const r = pickNextNotCompleted(lessons, {
      completed: { 'l1-0': true, 'l1-1': true, 'l2-0': true },
      progress: {},
    });
    expect(r.lessonId).toBe('l2');
    expect(r.videoIndex).toBe(1);
    expect(r.seekRatio).toBe(0);
  });

  it('returns the seekRatio for a partially-watched first non-completed video', () => {
    const r = pickNextNotCompleted(lessons, {
      completed: { 'l1-0': true },
      progress: { 'l1-1': 30 },
    });
    expect(r.lessonId).toBe('l1');
    expect(r.videoIndex).toBe(1);
    expect(r.seekRatio).toBeCloseTo(0.3);
  });

  it('falls back to the last video when every video is completed', () => {
    const r = pickNextNotCompleted(lessons, {
      completed: {
        'l1-0': true, 'l1-1': true, 'l2-0': true, 'l2-1': true,
      },
      progress: {},
    });
    expect(r.lessonId).toBe('l2');
    expect(r.videoIndex).toBe(1);
    expect(r.seekRatio).toBe(0);
  });

  it('clamps seekRatio to the [0, 1) range when progress is malformed', () => {
    const r = pickNextNotCompleted(lessons, {
      completed: {},
      progress: { 'l1-0': 250 },
    });
    expect(r.lessonId).toBe('l1');
    expect(r.videoIndex).toBe(0);
    expect(r.seekRatio).toBeLessThan(1);
    expect(r.seekRatio).toBeGreaterThanOrEqual(0);
  });

  it('returns null for empty courses', () => {
    expect(pickNextNotCompleted([], { completed: {}, progress: {} })).toBeNull();
  });
});
