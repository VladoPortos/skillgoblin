import fs from 'fs';
import path from 'path';

// Allowed keys in course.json. Anything else is rejected with a warning.
export const ALLOWED = ['title', 'description', 'category', 'releaseDate'];

// Each allowed key must be a string (releaseDate is a YYYY-MM-DD-ish string,
// kept loose because the rest of the app treats it as an opaque string).
function isString(v) {
  return typeof v === 'string';
}

// Returns true iff the course folder contains a course.json file.
// O(1) — single existsSync. Used by the has-json endpoint.
export function hasCourseJson(courseFolderPath) {
  try {
    return fs.existsSync(path.join(courseFolderPath, 'course.json'));
  } catch {
    return false;
  }
}

// Read and parse course.json from a course folder. Strips a leading BOM and
// validates that the top level is a plain object. Returns null on any
// failure (missing file, bad JSON, wrong shape) after logging a warning so
// an operator can debug without crashing the scan.
export function readCourseJson(courseFolderPath) {
  const filePath = path.join(courseFolderPath, 'course.json');
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[courseJsonOverride] cannot read ${filePath}: ${err.message}`);
    }
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/^﻿/, ''));
  } catch (err) {
    console.warn(`[courseJsonOverride] malformed JSON in ${filePath}: ${err.message}`);
    return null;
  }

  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.warn(`[courseJsonOverride] ${filePath} top-level must be an object`);
    return null;
  }

  return parsed;
}

// Build the course.json object that gets written to disk on export. Limited
// to the four allowed fields — id, lessons, thumbnail are *not* exported
// because they are derived from folder structure and the thumbnail.png
// convention.
export function buildCourseJsonPayload(row) {
  return {
    title: row.title || '',
    description: row.description || '',
    category: row.category || '',
    releaseDate: row.release_date || '',
  };
}

// Read course.json from the course folder (if present), validate, and return
// a new auto-detected object with the valid overrides applied. The input
// `autoDetected` object is not mutated.
//
// On any error (missing file, bad JSON, type mismatch on a field), fall back
// to the auto-detected value for that field. Console warnings explain why so
// an operator can debug without crashing the scan.
export function applyCourseJsonOverride(courseFolderPath, autoDetected) {
  const filePath = path.join(courseFolderPath, 'course.json');
  const parsed = readCourseJson(courseFolderPath);
  if (parsed == null) {
    return { ...autoDetected };
  }

  const merged = { ...autoDetected };

  // Warn on disallowed keys before applying allowed ones.
  for (const key of Object.keys(parsed)) {
    if (!ALLOWED.includes(key)) {
      console.warn(
        `[courseJsonOverride] ${filePath}: ignoring disallowed key "${key}". ` +
        `Allowed: ${ALLOWED.join(', ')}.`,
      );
    }
  }

  for (const key of ALLOWED) {
    if (!(key in parsed)) continue;
    const value = parsed[key];
    if (!isString(value)) {
      console.warn(
        `[courseJsonOverride] ${filePath}: "${key}" must be a string, ` +
        `got ${typeof value}; ignoring.`,
      );
      continue;
    }
    merged[key] = value;
  }

  return merged;
}
