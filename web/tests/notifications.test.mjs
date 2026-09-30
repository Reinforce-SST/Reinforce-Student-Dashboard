import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memberUpdates, upcomingEventNotices } from '../.test-build/lib/notifications.js';

test('member updates link to actual reviewed contributions and changed tickets', () => {
  const tickets = [
    { id: 'open', title: 'Open request', status: 'open', created_at: '2026-09-28T00:00:00Z' },
    { id: 'reply', title: 'Support request', status: 'open', created_at: '2026-09-27T00:00:00Z', updated_at: '2026-09-29T07:00:00Z' },
    { id: 'resolved', title: 'Access request', status: 'resolved', updated_at: '2026-09-29T08:00:00Z' },
  ];
  const contributions = [
    { id: 'pending', title: 'Workshop', status: 'pending', created_at: '2026-09-28T00:00:00Z' },
    { id: 'approved', title: 'Kaggle medal', status: 'approved', reviewed_at: '2026-09-29T09:00:00Z' },
  ];
  const updates = memberUpdates(tickets, contributions);
  assert.deepEqual(updates.map(item => item.title), ['Contribution approved', 'Ticket updated', 'Ticket updated']);
  assert.equal(updates[0].href, '/profile#contribution-history');
  assert.equal(updates[1].href, '/dashboard/tickets/resolved');
  assert.equal(updates[2].description, 'Support request · Open');
});

test('upcoming notices use only real, public, non-banner events in the next week', () => {
  const event = (id, start, status = 'published', event_type = 'workshop') => ({
    id, slug: id, title: id, status, event_type, schedule: { start_time: start },
  });
  const now = new Date('2026-09-29T00:00:00Z');
  const notices = upcomingEventNotices([
    event('tomorrow', '2026-09-30T00:00:00Z'),
    event('draft', '2026-09-30T00:00:00Z', 'draft'),
    event('banner', '2026-09-30T00:00:00Z', 'published', 'featured_banner'),
    event('later', '2026-10-09T00:00:00Z'),
    event('past', '2026-09-20T00:00:00Z'),
  ], now);
  assert.deepEqual(notices.map(item => item.title), ['tomorrow']);
});
