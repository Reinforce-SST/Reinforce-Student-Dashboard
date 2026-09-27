import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDashboardEvents, indiaDateKey } from '../.test-build/lib/dashboardData.js';

const event = (id, start, status = 'published', event_type = 'workshop') => ({
  id, slug: id, title: id, description: '', status, event_type,
  schedule: { start_time: start },
});

test('dashboard excludes private and past events, and keeps all public event dates', () => {
  const now = new Date('2026-09-27T08:00:00Z');
  const input = [
    event('later', '2026-10-04T08:00:00Z'),
    event('draft', '2026-10-01T08:00:00Z', 'draft'),
    event('past', '2026-09-20T08:00:00Z'),
    event('banner', '2026-10-03T08:00:00Z', 'published', 'featured_banner'),
    event('first', '2026-09-28T08:00:00Z'),
    event('second', '2026-09-29T08:00:00Z'),
    event('third', '2026-09-30T08:00:00Z'),
    event('fourth', '2026-10-01T08:00:00Z'),
    event('fifth', '2026-10-02T08:00:00Z'),
  ];
  const result = getDashboardEvents(input, now);
  assert.deepEqual(result.upcoming.map(({ id }) => id), ['first', 'second', 'third', 'fourth', 'fifth', 'later']);
  assert.deepEqual(result.banners.map(({ id }) => id), ['banner']);
});

test('calendar dates use India time across a UTC month boundary', () => {
  assert.equal(indiaDateKey(new Date('2026-09-30T20:00:00Z')), '2026-10-01');
  assert.equal(indiaDateKey(new Date('2026-09-30T17:00:00Z')), '2026-09-30');
});
