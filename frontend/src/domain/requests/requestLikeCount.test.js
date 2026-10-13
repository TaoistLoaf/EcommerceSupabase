import { describe, expect, it } from 'vitest';
import {
  isMissingLikeCountColumnError,
  normalizeRequestLikeCount,
} from './requestLikeCount';

describe('request like count compatibility', () => {
  it('recognizes PostgreSQL missing-column errors', () => {
    expect(
      isMissingLikeCountColumnError({
        code: '42703',
        message: 'column requests.like_count does not exist',
      })
    ).toBe(true);
  });

  it('does not hide unrelated request errors', () => {
    expect(
      isMissingLikeCountColumnError({
        code: '42501',
        message: 'permission denied for table requests',
      })
    ).toBe(false);
  });

  it('normalizes legacy likes into the canonical field', () => {
    expect(normalizeRequestLikeCount({ id: 'request-1', likes: 4 })).toEqual({
      id: 'request-1',
      likes: 4,
      like_count: 4,
    });
  });

  it('prefers the canonical count after the migration', () => {
    expect(
      normalizeRequestLikeCount({
        id: 'request-1',
        like_count: 6,
        likes: 4,
      }).like_count
    ).toBe(6);
  });
});
