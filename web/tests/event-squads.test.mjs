import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateEventAttendees } from "../.test-build/lib/eventAttendees.js";

const makeProfile = (id, name) => ({
  id,
  full_name: name,
  email: `${id}@example.com`,
  batch_year: 2028,
});

test("deduplicates multi-member team registrations into a single aggregated team", () => {
  const registrations = [
    {
      id: "reg-1",
      event_id: "evt-hackathon",
      user_id: "leader-1",
      team_id: "team-alpha",
      team_name: "Alpha Squad",
      spg_id: "spg-alpha",
      status: "registered",
      is_team_leader: true,
      registered_at: "2026-11-01T10:00:00Z",
      member_uids: ["leader-1", "teammate-2"],
      user_profile: makeProfile("leader-1", "Leader One"),
      member_profiles: [makeProfile("teammate-2", "Teammate Two")],
    },
    {
      id: "reg-2",
      event_id: "evt-hackathon",
      user_id: "teammate-2",
      team_id: "team-alpha",
      team_name: "Alpha Squad",
      spg_id: "spg-alpha",
      status: "registered",
      is_team_leader: false,
      registered_at: "2026-11-01T11:00:00Z",
      member_uids: ["leader-1", "teammate-2"],
      user_profile: makeProfile("teammate-2", "Teammate Two"),
      member_profiles: [makeProfile("leader-1", "Leader One")],
    },
  ];

  const { allTeams, soloRegistrations } = aggregateEventAttendees(registrations);

  assert.equal(allTeams.length, 1);
  assert.equal(soloRegistrations.length, 0);

  const team = allTeams[0];
  assert.equal(team.team_id, "team-alpha");
  assert.equal(team.team_name, "Alpha Squad");
  assert.equal(team.spg_id, "spg-alpha");
  assert.equal(team.leader_uid, "leader-1");
  assert.deepEqual(team.member_uids, ["leader-1", "teammate-2"]);
  assert.equal(team.roster_locked, false);
});

test("resolves true leader when multiple members claim leadership (Bug 3 prevention)", () => {
  // Legacy bug scenario: both member registrations claim is_team_leader: true
  const registrations = [
    {
      id: "reg-lead",
      event_id: "evt-hackathon",
      user_id: "alice",
      team_id: "team-duo",
      team_name: "Dynamic Duo",
      status: "registered",
      is_team_leader: true,
      registered_at: "2026-11-01T08:00:00Z",
      member_uids: ["alice", "bob"],
      user_profile: makeProfile("alice", "Alice Rao"),
    },
    {
      id: "reg-joiner",
      event_id: "evt-hackathon",
      user_id: "bob",
      team_id: "team-duo",
      team_name: "Dynamic Duo",
      status: "registered",
      is_team_leader: true, // Erroneously true in bugged join
      registered_at: "2026-11-01T09:30:00Z",
      member_uids: ["alice", "bob"],
      user_profile: makeProfile("bob", "Bob Iyer"),
    },
  ];

  const { allTeams } = aggregateEventAttendees(registrations);
  assert.equal(allTeams.length, 1);
  assert.equal(allTeams[0].leader_uid, "alice");
  assert.equal(allTeams[0].leader_profile?.full_name, "Alice Rao");
  assert.equal(allTeams[0].member_uids[0], "alice");
});

test("propagates roster_locked state when any squad member is locked", () => {
  const registrations = [
    {
      id: "reg-1",
      user_id: "leader-1",
      team_id: "team-locked",
      team_name: "Locked Squad",
      status: "registered",
      roster_locked: false,
      member_uids: ["leader-1", "member-2"],
    },
    {
      id: "reg-2",
      user_id: "member-2",
      team_id: "team-locked",
      team_name: "Locked Squad",
      status: "registered",
      roster_locked: true,
      member_uids: ["leader-1", "member-2"],
    },
  ];

  const { allTeams } = aggregateEventAttendees(registrations);
  assert.equal(allTeams.length, 1);
  assert.equal(allTeams[0].roster_locked, true);
});

test("keeps individual solo attendees strictly separate from squads", () => {
  const registrations = [
    {
      id: "reg-solo-1",
      user_id: "solo-sam",
      status: "registered",
      user_profile: makeProfile("solo-sam", "Solo Sam"),
      member_uids: ["solo-sam"],
    },
    {
      id: "reg-team-1",
      user_id: "team-lead",
      team_name: "Trio",
      status: "registered",
      is_team_leader: true,
      member_uids: ["team-lead", "peer-1", "peer-2"],
    },
    {
      id: "reg-solo-2",
      user_id: "solo-sara",
      status: "waitlisted",
      user_profile: makeProfile("solo-sara", "Solo Sara"),
    },
  ];

  const { allTeams, soloRegistrations } = aggregateEventAttendees(registrations);
  assert.equal(allTeams.length, 1);
  assert.equal(allTeams[0].team_name, "Trio");
  assert.equal(soloRegistrations.length, 2);
  assert.deepEqual(soloRegistrations.map((r) => r.user_id), ["solo-sam", "solo-sara"]);
});
