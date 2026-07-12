import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { getContentDir } from '../../server/utils/courseHelpers.js';

const savedDir = process.env.CONTENT_DIR;
const savedPath = process.env.CONTENT_PATH;

afterEach(() => {
  if (savedDir === undefined) delete process.env.CONTENT_DIR;
  else process.env.CONTENT_DIR = savedDir;
  if (savedPath === undefined) delete process.env.CONTENT_PATH;
  else process.env.CONTENT_PATH = savedPath;
});

describe('content directory configuration aliases', () => {
  it('prefers documented CONTENT_DIR', () => {
    process.env.CONTENT_DIR = './documented-content';
    process.env.CONTENT_PATH = './legacy-content';
    expect(getContentDir()).toBe(path.resolve('./documented-content'));
  });

  it('keeps CONTENT_PATH as a compatibility alias', () => {
    delete process.env.CONTENT_DIR;
    process.env.CONTENT_PATH = './legacy-content';
    expect(getContentDir()).toBe(path.resolve('./legacy-content'));
  });
});
