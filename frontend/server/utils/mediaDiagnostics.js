import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { resolveCourseDir, resolvePathInCourse, assertResolvedInside } from './courseHelpers.js';

export function probeMedia(file, timeout = 10000) {
  return new Promise(resolve => {
    execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=format_name,duration:stream=codec_type,codec_name', '-of', 'json', file],
      { timeout, killSignal: 'SIGKILL', maxBuffer: 128 * 1024, windowsHide: true }, (error, stdout) => {
        if (error) return resolve({ error: error.killed ? 'Media probe timed out.' : error.code === 'ENOENT' ? 'ffprobe is not installed.' : 'Media probe failed; the file may be damaged or unreadable.' });
        try { resolve(JSON.parse(stdout)); } catch { resolve({ error: 'Invalid ffprobe output.' }); }
      });
  });
}

export function mediaWarnings(probe) {
  if (probe.error) return [probe.error];
  const warnings = [];
  const streams = probe.streams || [];
  const video = streams.filter(stream => stream.codec_type === 'video');
  const audio = streams.filter(stream => stream.codec_type === 'audio');
  if (!video.length) warnings.push('No video stream was detected. Check that the selected file is a playable lesson video.');
  for (const stream of video) {
    const codec = stream.codec_name;
    if (['hevc', 'h265', 'av1', 'vp9'].includes(codec)) warnings.push(codec.toUpperCase() + ' playback depends on your browser, operating system, and device decoder. Try another supported browser or prepare an H.264 MP4 copy if playback fails.');
    else if (!['h264', 'vp8'].includes(codec)) warnings.push('Video codec ' + (codec || 'unknown') + ' is outside the broadly supported browser baseline. Prepare an H.264 MP4 copy if it does not play.');
  }
  for (const stream of audio) {
    if (!['aac', 'mp3', 'opus', 'vorbis', 'flac'].includes(stream.codec_name)) warnings.push('Audio codec ' + (stream.codec_name || 'unknown') + ' may not play in browsers. An AAC audio track is a more compatible option.');
  }
  const formats = (probe.format?.format_name || '').split(',');
  if (!formats.some(format => ['mp4', 'webm'].includes(format))) warnings.push('Container ' + (probe.format?.format_name || 'unknown') + ' may not be accepted by the browser. MP4 with H.264/AAC is a more compatible option.');
  // A silent video is valid; absent audio is not a playback error.
  return warnings;
}

// One bounded probe per request; file paths come exclusively from the indexed tree.
export async function diagnoseCourse(course, videoIndex = 0) {
  let data;
  try { data = JSON.parse(course.data); }
  catch { return { courseId: course.id, error: 'Indexed metadata is invalid. Rescan the course after checking its folder.' }; }
  const videos = (data.lessons || []).flatMap(lesson => (lesson.videos || []).map(video => ({ folder: lesson.folder || '', file: video.file })));
  let root;
  try { root = resolveCourseDir(course.folder_name); }
  catch { return { courseId: course.id, error: 'Indexed course folder is invalid.' }; }
  const missing = [], fileErrors = [];
  function inspectPath(video) {
    const label = [video.folder, video.file].filter(Boolean).join('/');
    try {
      const file = resolvePathInCourse(root, video.folder, video.file);
      if (!assertResolvedInside(root, file)) { missing.push(label); return null; }
      if (!fs.statSync(file).isFile()) { fileErrors.push({ file: label, message: 'Path is not a regular file.' }); return null; }
      fs.accessSync(file, fs.constants.R_OK);
      return file;
    } catch (error) {
      if (error.code === 'ENOENT') missing.push(label);
      else fileErrors.push({ file: label, message: error.code === 'EACCES' || error.code === 'EPERM' ? 'Permission denied. Check content mount ownership and read permissions.' : 'File cannot be inspected. Check its path and mount availability.' });
      return null;
    }
  }
  try { fs.accessSync(root, fs.constants.R_OK); }
  catch (error) { return { courseId: course.id, error: error.code === 'ENOENT' ? 'Course directory is missing. Check the content mount.' : 'Course directory is unreadable. Check mount permissions.', totalVideos: videos.length }; }
  const checkedPaths = videos.slice(0, 100).map(inspectPath);
  const selected = videos[videoIndex];
  const result = { courseId: course.id, totalVideos: videos.length, checkedFiles: Math.min(videos.length, 100), missing, fileErrors, videoIndex, advice: 'H.264 video with AAC audio in MP4 has broad browser support. No transcoding is performed.' };
  if (!selected) return result;
  const file = videoIndex < 100 ? checkedPaths[videoIndex] : inspectPath(selected);
  if (!file) return { ...result, error: 'Selected video is missing or unreadable. See the file results.' };
  const probe = await probeMedia(file);
  return { ...result, file: [selected.folder, selected.file].filter(Boolean).join('/'), probe, warnings: mediaWarnings(probe) };
}
