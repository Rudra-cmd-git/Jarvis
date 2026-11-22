import { describe, expect, it } from 'vitest';
import { NAVIGATION_ITEMS, getNavigationItem } from '../../src/renderer/navigation';

const expectedViews = [
  'dashboard',
  'chat',
  'pc-control',
  'automation',
  'developer-hub',
  'knowledge',
  'productivity',
  'settings',
] as const;

describe('navigation', () => {
  it('defines exactly the eight required views', () => {
    expect(NAVIGATION_ITEMS).toHaveLength(8);
    expect(NAVIGATION_ITEMS.map((item) => item.id)).toEqual(expectedViews);
  });

  it('has unique labels and metadata for every view', () => {
    const labels = NAVIGATION_ITEMS.map((item) => item.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const item of NAVIGATION_ITEMS) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.subtitle.length).toBeGreaterThan(0);
    }
  });

  it('resolves every known view', () => {
    for (const id of expectedViews) {
      expect(getNavigationItem(id).id).toBe(id);
    }
  });
});
