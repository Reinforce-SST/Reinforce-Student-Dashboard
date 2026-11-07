import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memberUpdates, upcomingEventNotices, invitationNotices } from '../.test-build/lib/notifications.js';

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

test('invitation notices generate action links for pending SPG and event invites', () => {
  const invitations = [
    {
      id: 'inv-1',
      type: 'spg',
      status: 'pending',
      inviter_name: 'Bob',
      target_name: 'Reinforcement Learning Study',
      target_id: 'spg-123',
      created_at: '2026-11-01T12:00:00Z',
    },
    {
      id: 'inv-2',
      type: 'event_team',
      status: 'pending',
      inviter_name: 'Alice',
      target_name: 'Fall Hackathon',
      team_name: 'Code Ninjas',
      event_id: 'evt-fall-hack',
      created_at: '2026-11-02T15:00:00Z',
    },
    {
      id: 'inv-3',
      type: 'spg',
      status: 'accepted', // Accepted should be ignored
      inviter_name: 'Carol',
      target_name: 'Vision Lab',
      target_id: 'spg-456',
      created_at: '2026-11-01T10:00:00Z',
    },
  ];

  const notices = invitationNotices(invitations);
  assert.equal(notices.length, 2);
  assert.equal(notices[0].title, 'SPG Invitation');
  assert.equal(notices[0].href, '/dashboard/spg/spg-123');
  assert.match(notices[0].description, /Bob invited you to join Reinforcement Learning Study/);

  assert.equal(notices[1].title, 'Event Team Invitation');
  assert.equal(notices[1].href, '/dashboard/events/evt-fall-hack');
  assert.match(notices[1].description, /Alice invited you to join Code Ninjas for Fall Hackathon/);
});

