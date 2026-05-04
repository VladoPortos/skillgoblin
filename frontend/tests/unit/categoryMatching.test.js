import { describe, it, expect } from 'vitest';
import { tokenize, STOPWORDS } from '../../utils/categoryMatching.js';

describe('STOPWORDS', () => {
  it('is a Set of lowercase strings', () => {
    expect(STOPWORDS).toBeInstanceOf(Set);
    for (const word of STOPWORDS) {
      expect(word).toBe(word.toLowerCase());
    }
  });

  it('contains common English fillers', () => {
    for (const word of ['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'with']) {
      expect(STOPWORDS.has(word)).toBe(true);
    }
  });
});

describe('tokenize', () => {
  it('returns [] for null, undefined, empty string, and non-string input', () => {
    expect(tokenize(null)).toEqual([]);
    expect(tokenize(undefined)).toEqual([]);
    expect(tokenize('')).toEqual([]);
    expect(tokenize(42)).toEqual([]);
    expect(tokenize({})).toEqual([]);
  });

  it('lowercases input', () => {
    expect(tokenize('Unreal')).toEqual(['unreal']);
  });

  it('splits on whitespace', () => {
    expect(tokenize('Godot Engine')).toEqual(['godot', 'engine']);
  });

  it('splits on punctuation (hyphens, slashes, dots, parens)', () => {
    expect(tokenize('sci-fi/action.game (3D)')).toEqual(['sci', 'fi', 'action', 'game', '3d']);
  });

  it('keeps alphanumeric tokens together', () => {
    expect(tokenize('3D')).toEqual(['3d']);
    expect(tokenize('Unreal5')).toEqual(['unreal5']);
  });

  it('drops stopwords', () => {
    expect(tokenize('a game in unreal')).toEqual(['game', 'unreal']);
    expect(tokenize('The quick brown fox')).toEqual(['quick', 'brown', 'fox']);
  });

  it('handles consecutive separators without producing empty tokens', () => {
    expect(tokenize('foo   ---  bar')).toEqual(['foo', 'bar']);
  });

  it('strips leading and trailing separators', () => {
    expect(tokenize('  unreal  ')).toEqual(['unreal']);
    expect(tokenize('---unreal---')).toEqual(['unreal']);
  });
});
