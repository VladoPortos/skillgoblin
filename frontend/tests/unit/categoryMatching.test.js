import { describe, it, expect } from 'vitest';
import { tokenize, STOPWORDS, findMatchingCategories } from '../../utils/categoryMatching.js';

describe('STOPWORDS', () => {
  it('contains common English fillers', () => {
    expect(STOPWORDS).toBeInstanceOf(Set);
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

describe('findMatchingCategories', () => {
  it('returns [] when title is empty', () => {
    expect(findMatchingCategories('', ['Unreal', 'Godot'])).toEqual([]);
  });

  it('returns [] when categories list is empty', () => {
    expect(findMatchingCategories('Some unreal title', [])).toEqual([]);
  });

  it('returns [] when title is not a string', () => {
    expect(findMatchingCategories(null, ['Unreal'])).toEqual([]);
    expect(findMatchingCategories(undefined, ['Unreal'])).toEqual([]);
  });

  it('matches a single-word category found in the title', () => {
    expect(
      findMatchingCategories('Create a game in Unreal Engine 5', ['Unreal', 'Godot'])
    ).toEqual(['Unreal']);
  });

  it('matches case-insensitively but preserves the original category casing', () => {
    expect(
      findMatchingCategories('learn UNREAL today', ['Unreal'])
    ).toEqual(['Unreal']);
  });

  it('returns multiple matches in original input order', () => {
    expect(
      findMatchingCategories(
        'Create a SciFi Action Third Person Game in Unreal Engine 5',
        ['Unreal', 'Game', 'Godot', '3D']
      )
    ).toEqual(['Unreal', 'Game']);
  });

  it('matches alphanumeric categories like 3D against alphanumeric tokens in title', () => {
    expect(
      findMatchingCategories('Intro to 3D modeling', ['3D', 'Unreal'])
    ).toEqual(['3D']);
  });

  it('excludes the currently-selected category (case-insensitive)', () => {
    expect(
      findMatchingCategories(
        'Unreal Engine basics',
        ['Unreal', 'Godot'],
        { currentCategory: 'unreal' }
      )
    ).toEqual([]);
  });

  it('excludes "Uncategorized" (case-insensitive) even when it would match', () => {
    expect(
      findMatchingCategories(
        'uncategorized stuff',
        ['Uncategorized', 'Stuff']
      )
    ).toEqual(['Stuff']);
  });

  it('requires every token of a multi-word category to appear in the title', () => {
    expect(
      findMatchingCategories('Unreal tutorial', ['Unreal Engine'])
    ).toEqual([]);
    expect(
      findMatchingCategories('build a game in unreal engine 5', ['Unreal Engine'])
    ).toEqual(['Unreal Engine']);
  });

  it('skips a category whose only tokens are stopwords', () => {
    expect(
      findMatchingCategories('the and stuff', ['The And', 'Stuff'])
    ).toEqual(['Stuff']);
  });

  it('treats whitespace-only currentCategory as no current category', () => {
    expect(
      findMatchingCategories(
        'Unreal stuff',
        ['Unreal'],
        { currentCategory: '   ' }
      )
    ).toEqual(['Unreal']);
  });

  it('returns [] without throwing when categories contains non-strings', () => {
    expect(
      findMatchingCategories('Unreal stuff', ['Unreal', null, undefined, 42])
    ).toEqual(['Unreal']);
  });

  it('skips empty-string and whitespace-only category entries', () => {
    expect(
      findMatchingCategories('Unreal stuff', ['', '   ', 'Unreal'])
    ).toEqual(['Unreal']);
  });
});
