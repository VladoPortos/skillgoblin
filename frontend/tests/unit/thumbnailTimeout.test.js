import { it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const child = vi.hoisted(() => { vi.resetModules(); return { execFile: vi.fn(), spawn: vi.fn() }; });
vi.mock('child_process', () => child);
import { extractFrameThumbnail } from '../../server/utils/thumbnailUtils.js';
afterEach(() => vi.useRealTimers());
it('kills a stuck ffmpeg and resolves even if close never arrives', async () => {
  vi.useFakeTimers();
  child.execFile.mockImplementation((command, args, options, callback) => callback(null, { stdout: '100' }));
  const proc = new EventEmitter(); proc.stdout = new EventEmitter(); proc.stderr = new EventEmitter(); proc.kill = vi.fn();
  child.spawn.mockReturnValue(proc);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-thumb-timeout-'));
  const file = path.join(dir, 'video.mp4'); fs.writeFileSync(file, 'video');
  try {
    const pending = extractFrameThumbnail(file);
    await vi.advanceTimersByTimeAsync(15001);
    expect(await pending).toBeNull();
    expect(proc.kill).toHaveBeenCalledWith('SIGKILL');
    expect(vi.getTimerCount()).toBe(0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
