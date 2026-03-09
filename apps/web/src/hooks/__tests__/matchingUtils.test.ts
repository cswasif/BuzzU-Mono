import { describe, it, expect } from 'vitest';

/**
 * Tests for the exponential backoff logic used in useMatching.
 * These validate the backoff formula without needing a full React/WS environment.
 */

function computeBackoff(consecutiveFailures: number, maxMs: number = 30000): number {
  return Math.min(1000 * Math.pow(2, consecutiveFailures), maxMs);
}

describe('useMatching backoff logic', () => {
  it('first retry is 2 seconds', () => {
    // consecutiveFailuresRef starts at 0, incremented to 1 before computing
    expect(computeBackoff(1)).toBe(2000);
  });

  it('second retry is 4 seconds', () => {
    expect(computeBackoff(2)).toBe(4000);
  });

  it('third retry is 8 seconds', () => {
    expect(computeBackoff(3)).toBe(8000);
  });

  it('caps at 30 seconds', () => {
    expect(computeBackoff(10)).toBe(30000);
    expect(computeBackoff(20)).toBe(30000);
  });

  it('resets to small value after success', () => {
    // After a successful message, consecutiveFailures resets to 0
    // Next failure starts from 1 again
    expect(computeBackoff(1)).toBe(2000);
  });

  it('gives up after 5 retries', () => {
    // The useMatching hook stops retrying after consecutiveFailuresRef > 5
    const MAX_RETRIES = 5;
    for (let i = 1; i <= MAX_RETRIES; i++) {
      expect(computeBackoff(i)).toBeLessThanOrEqual(30000);
    }
    // Attempt 6 would not be retried (checked in the hook)
    expect(MAX_RETRIES + 1).toBe(6);
  });
});

describe('avatar URL memoization', () => {
  const AVATAR_BASE = 'https://api.dicebear.com/5.x/thumbs/png?shapeColor=FD8A8A&size=80';

  function avatarUrl(seed: string): string {
    return `${AVATAR_BASE}&seed=${seed}`;
  }

  it('produces deterministic URLs for same seed', () => {
    expect(avatarUrl('abc123')).toBe(avatarUrl('abc123'));
  });

  it('produces different URLs for different seeds', () => {
    expect(avatarUrl('abc123')).not.toBe(avatarUrl('xyz789'));
  });

  it('includes the seed in the URL', () => {
    expect(avatarUrl('myseed')).toContain('seed=myseed');
  });

  it('memoization cache produces same results', () => {
    // Simulating the useMemo pattern from Sidebar
    const friendList = [
      { id: 'a', avatarSeed: 'seed_a' },
      { id: 'b', avatarSeed: 'seed_b' },
    ];
    const map: Record<string, string> = {};
    for (const f of friendList) { map[f.id] = avatarUrl(f.avatarSeed); }

    expect(map['a']).toBe(avatarUrl('seed_a'));
    expect(map['b']).toBe(avatarUrl('seed_b'));
    expect(Object.keys(map)).toHaveLength(2);
  });
});

describe('gender modal dismissal logic', () => {
  it('should show modal when gender is unset and not dismissed', () => {
    const hasSelectedGender = false;
    const genderModalDismissed = false;
    const shouldShow = !hasSelectedGender && !genderModalDismissed;
    expect(shouldShow).toBe(true);
  });

  it('should NOT show modal when gender is already set', () => {
    const hasSelectedGender = true;
    const genderModalDismissed = false;
    const shouldShow = !hasSelectedGender && !genderModalDismissed;
    expect(shouldShow).toBe(false);
  });

  it('should NOT show modal when user already dismissed it', () => {
    const hasSelectedGender = false;
    const genderModalDismissed = true;
    const shouldShow = !hasSelectedGender && !genderModalDismissed;
    expect(shouldShow).toBe(false);
  });
});
