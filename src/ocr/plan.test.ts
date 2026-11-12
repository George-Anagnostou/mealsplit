import { describe, expect, it } from 'vitest';
import {
  describeOcrError,
  describeProgress,
  MAX_SIDE,
  MIN_SIDE,
  ocrUrls,
  ScanCancelled,
  targetSize,
} from './plan';

describe('targetSize', () => {
  it('shrinks big photos to the max, keeping the aspect ratio', () => {
    expect(targetSize(4032, 3024)).toEqual({ width: MAX_SIDE, height: 1650 });
    expect(targetSize(3024, 4032)).toEqual({ width: 1650, height: MAX_SIDE });
  });

  it('leaves images already in range alone', () => {
    expect(targetSize(1600, 900)).toEqual({ width: 1600, height: 900 });
    expect(targetSize(MAX_SIDE, 500)).toEqual({ width: MAX_SIDE, height: 500 });
  });

  it('scales small images up to the minimum', () => {
    expect(targetSize(700, 350)).toEqual({ width: MIN_SIDE, height: 700 });
  });

  it('never returns an empty canvas, and rejects a missing size', () => {
    expect(targetSize(10000, 1)).toEqual({ width: MAX_SIDE, height: 1 });
    expect(() => targetSize(0, 100)).toThrow(RangeError);
    expect(() => targetSize(100, Number.NaN)).toThrow(RangeError);
  });
});

describe('ocrUrls', () => {
  it('builds absolute same-origin URLs from a relative base', () => {
    expect(ocrUrls('./', 'https://example.com/')).toEqual({
      workerPath: 'https://example.com/ocr/worker.min.js',
      corePath: 'https://example.com/ocr/core',
      langPath: 'https://example.com/ocr/lang',
    });
  });

  it('follows the page when the app is served from a sub-path', () => {
    expect(ocrUrls('./', 'https://me.github.io/mealsplit/index.html').workerPath).toBe(
      'https://me.github.io/mealsplit/ocr/worker.min.js',
    );
    expect(ocrUrls('/mealsplit/', 'https://me.github.io/mealsplit/').langPath).toBe(
      'https://me.github.io/mealsplit/ocr/lang',
    );
    expect(ocrUrls('/mealsplit', 'https://me.github.io/mealsplit/').corePath).toBe(
      'https://me.github.io/mealsplit/ocr/core',
    );
  });
});

describe('describeProgress', () => {
  it('moves forward through the stages, from loading to reading', () => {
    const at = (s: string, p: number) => describeProgress(s, p)?.progress ?? Number.NaN;
    const steps = [
      at('loading tesseract core', 0),
      at('loading tesseract core', 1),
      at('initializing tesseract', 0),
      at('loading language traineddata', 0),
      at('loading language traineddata', 1),
      at('initializing api', 0.5),
      at('recognizing text', 0),
      at('recognizing text', 0.5),
      at('recognizing text', 1),
    ];
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
    expect(steps[0]).toBeGreaterThan(0.05);
    expect(steps.at(-1)).toBeLessThan(1);
  });

  it('says what is happening', () => {
    expect(describeProgress('recognizing text', 0.2)?.message).toBe('Reading receipt…');
    expect(describeProgress('loading language traineddata', 0.2)?.message).toBe(
      'Loading English data…',
    );
  });

  it('clamps odd values and ignores unknown statuses', () => {
    expect(describeProgress('recognizing text', 7)?.progress).toBe(
      describeProgress('recognizing text', 1)?.progress,
    );
    expect(describeProgress('recognizing text', -1)?.progress).toBe(
      describeProgress('recognizing text', 0)?.progress,
    );
    expect(describeProgress('recognizing text', Number.NaN)?.progress).toBe(
      describeProgress('recognizing text', 0)?.progress,
    );
    expect(describeProgress('initialized api', 1)).toBeNull();
  });
});

describe('describeOcrError', () => {
  it('turns loading failures into one plain message', () => {
    for (const e of [
      new Error("Failed to execute 'importScripts' on 'WorkerGlobalScope'"),
      'NetworkError: A network error occurred.',
      new TypeError('Load failed'),
      new Error('Failed to fetch'),
      'Error: 404',
    ]) {
      expect(describeOcrError(e)).toMatch(/^Could not load the text recognition files/);
    }
  });

  it('explains memory problems', () => {
    expect(describeOcrError(new Error('Out of memory'))).toMatch(/too large/);
  });

  it('passes other messages through, and never returns nothing', () => {
    expect(describeOcrError(new Error('Could not read that image. Try a JPEG or PNG photo.'))).toBe(
      'Could not read that image. Try a JPEG or PNG photo.',
    );
    expect(describeOcrError('')).toBe('Something went wrong reading the photo.');
    expect(describeOcrError(undefined)).toBe('Something went wrong reading the photo.');
    expect(describeOcrError(42)).toBe('Something went wrong reading the photo.');
  });
});

describe('ScanCancelled', () => {
  it('is its own kind of error', () => {
    const e = new ScanCancelled();
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('ScanCancelled');
  });
});
