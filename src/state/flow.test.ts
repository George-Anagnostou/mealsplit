import { describe, expect, test } from 'vitest';
import { nextStep, prevStep, STEPS, stepIndex, stepsDone, titleOf, unassignedItems } from './flow';
import { friend, item, makeState } from './testing';

describe('steps', () => {
  test('run Receipt → People → Assign → Split', () => {
    expect(STEPS.map((s) => s.id)).toEqual(['receipt', 'people', 'assign', 'split']);
  });

  test('next and back stop at the ends, and History is not a step', () => {
    expect(prevStep('receipt')).toBeNull();
    expect(nextStep('receipt')).toBe('people');
    expect(prevStep('assign')).toBe('people');
    expect(nextStep('assign')).toBe('split');
    expect(nextStep('split')).toBeNull();
    expect(prevStep('split')).toBe('assign');
    expect(stepIndex('history')).toBe(-1);
    expect(nextStep('history')).toBeNull();
    expect(prevStep('history')).toBeNull();
  });

  test('every tab has a heading', () => {
    for (const t of ['receipt', 'people', 'assign', 'split', 'history'] as const) {
      expect(titleOf(t)).not.toBe('');
    }
  });
});

describe('what is left to do', () => {
  const s = makeState({
    people: [friend('sam'), friend('gone')],
    bill: {
      here: ['sam'],
      items: [item('a', 100, ['sam']), item('b', 100), item('c', 100, ['gone'])],
    },
  });

  test('unassigned items are those nobody at the meal is paying for', () => {
    // c is only assigned to someone who isn't here, so it counts as unassigned
    expect(unassignedItems(s).map((i) => i.id)).toEqual(['b', 'c']);
  });

  test('steps look done as the bill fills in', () => {
    expect(stepsDone(makeState())).toEqual({
      receipt: false,
      people: false,
      assign: false,
      split: false,
    });
    expect(stepsDone(s)).toEqual({ receipt: true, people: true, assign: false, split: false });
    const all = makeState({ bill: { here: [], items: [item('a', 100, ['me'])] } });
    expect(stepsDone(all)).toMatchObject({ people: false, assign: true });
  });
});
