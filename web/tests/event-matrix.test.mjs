import { test } from "node:test";
import assert from "node:assert/strict";
import { api } from "../.test-build/lib/api.js";

test("event matrix API fetches hydrated matrix data", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      json: async () => ({
        event_id: "evt-matrix-1",
        event_title: "Sprint Hackathon",
        is_admin: true,
        has_edit_access: true,
        volunteer_uids: ["vol-1"],
        volunteer_profiles: [],
        columns: [
          { column_id: "col-1", title: "Project Score", column_type: "object", object_schema_type: "submission" },
        ],
        rows: [
          {
            user_id: "user-1",
            user_name: "Alice Rao",
            email: "alice@sst.scaler.com",
            rsvp_status: "registered",
            attendance: "checked_in",
            cells: { "col-1": { schema_type: "submission", repo_url: "https://github.com/alice/demo", score: 90 } },
          },
        ],
      }),
    };
  };

  try {
    const res = await api.getEventMatrix("auth-token", "evt-matrix-1");
    assert.equal(res.event_id, "evt-matrix-1");
    assert.equal(res.rows.length, 1);
    assert.equal(res.rows[0].user_name, "Alice Rao");
    assert.match(calls[0].url, /\/events\/evt-matrix-1\/matrix$/);
    assert.equal(calls[0].init.headers.Authorization, "Bearer auth-token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("event matrix column creation and deletion use server routes", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      json: async () => ({
        column_id: "col-new-1",
        title: "Mentor Feedback",
        column_type: "object",
        object_schema_type: "feedback",
      }),
    };
  };

  try {
    await api.createMatrixColumn("admin-token", "evt-matrix-1", {
      title: "Mentor Feedback",
      column_type: "object",
      object_schema_type: "feedback",
    });
    assert.equal(calls[0].init.method, "POST");
    assert.match(calls[0].url, /\/events\/evt-matrix-1\/matrix\/columns$/);
    assert.equal(JSON.parse(calls[0].init.body).title, "Mentor Feedback");

    await api.deleteMatrixColumn("admin-token", "evt-matrix-1", "col-new-1");
    assert.equal(calls[1].init.method, "DELETE");
    assert.match(calls[1].url, /\/events\/evt-matrix-1\/matrix\/columns\/col-new-1$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("event matrix cell upsert, attendance, and volunteer access updates", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      json: async () => ({ success: true }),
    };
  };

  try {
    // 1. Cell update with feedback object
    await api.updateMatrixCell("auth-token", "evt-matrix-1", {
      user_id: "user-1",
      column_id: "col-fb",
      value: { schema_type: "feedback", rating: 5, notes: "Great presentation" },
    });
    assert.equal(calls[0].init.method, "PATCH");
    assert.match(calls[0].url, /\/events\/evt-matrix-1\/matrix\/cell$/);
    assert.equal(JSON.parse(calls[0].init.body).value.rating, 5);

    // 2. Cell reset with null (Refinement 4)
    await api.updateMatrixCell("auth-token", "evt-matrix-1", {
      user_id: "user-1",
      column_id: "col-fb",
      value: null,
    });
    assert.equal(calls[1].init.method, "PATCH");
    assert.equal(JSON.parse(calls[1].init.body).value, null);

    // 3. Attendance mutation
    await api.updateMatrixAttendance("auth-token", "evt-matrix-1", {
      user_id: "user-1",
      status: "checked_in",
    });
    assert.equal(calls[2].init.method, "PATCH");
    assert.match(calls[2].url, /\/events\/evt-matrix-1\/matrix\/attendance$/);

    // 4. Volunteer access mutation
    await api.updateMatrixAccess("admin-token", "evt-matrix-1", ["vol-1", "vol-2"]);
    assert.equal(calls[3].init.method, "PUT");
    assert.match(calls[3].url, /\/events\/evt-matrix-1\/matrix\/access$/);
    assert.deepEqual(JSON.parse(calls[3].init.body).volunteer_uids, ["vol-1", "vol-2"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("event matrix batch update and assign-all routes", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      json: async () => ({
        success: true,
        updated_cells: 2,
        updated_attendance: 1,
        updated_count: 5,
      }),
    };
  };

  try {
    // 1. Batch update
    await api.batchUpdateMatrix("auth-token", "evt-matrix-1", {
      cells: [
        { user_id: "user-1", column_id: "col-num", value: 95 },
        {
          user_id: "user-2",
          column_id: "col-contrib",
          value: {
            schema_type: "contribution_assignment",
            category: "participation",
            track: "general",
            points: 20,
          },
        },
      ],
      attendance: [{ user_id: "user-1", status: "checked_in" }],
    });
    assert.equal(calls[0].init.method, "POST");
    assert.match(calls[0].url, /\/events\/evt-matrix-1\/matrix\/batch$/);
    const batchBody = JSON.parse(calls[0].init.body);
    assert.equal(batchBody.cells.length, 2);
    assert.equal(batchBody.attendance.length, 1);
    assert.equal(batchBody.cells[0].value, 95);

    // 2. Assign All
    await api.assignAllToColumn("admin-token", "evt-matrix-1", "col-num", 100);
    assert.equal(calls[1].init.method, "POST");
    assert.match(calls[1].url, /\/events\/evt-matrix-1\/matrix\/columns\/col-num\/assign-all$/);
    const assignBody = JSON.parse(calls[1].init.body);
    assert.equal(assignBody.value, 100);

    // 3. Assign SPG Object and Idea Jar Object
    await api.updateMatrixCell("auth-token", "evt-matrix-1", {
      user_id: "user-1",
      column_id: "col-spg",
      value: {
        schema_type: "spg_assignment",
        spg_id: "spg-1",
        spg_name: "Alpha Squad",
        spg_status: "active",
        role: "lead",
      },
    });
    assert.equal(calls[2].init.method, "PATCH");
    assert.equal(JSON.parse(calls[2].init.body).value.spg_name, "Alpha Squad");

    await api.updateMatrixCell("auth-token", "evt-matrix-1", {
      user_id: "user-1",
      column_id: "col-idea",
      value: {
        schema_type: "idea_jar_assignment",
        idea_id: "idea-1",
        idea_title: "AI Reviewer",
        track: "technical",
        spg_id: "spg-1",
        spg_name: "Alpha Squad",
      },
    });
    assert.equal(calls[3].init.method, "PATCH");
    assert.equal(JSON.parse(calls[3].init.body).value.idea_title, "AI Reviewer");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("admin event registrations fetch delivers team and solo submission deliverables", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      json: async () => [
        {
          id: "reg-1",
          event_id: "evt-hack-1",
          user_id: "lead-1",
          team_id: "team-squad-1",
          team_name: "Code Crafters",
          is_team_leader: true,
          member_uids: ["lead-1", "teammate-1"],
          status: "registered",
          registered_at: "2026-11-05T10:00:00Z",
          submission: {
            repo_url: "https://github.com/code-crafters/project",
            demo_url: "https://crafters.demo.app",
            slides_url: "https://docs.google.com/presentation/d/deck",
            paper_link: "https://arxiv.org/abs/example",
            notes: "Final hackathon submission deliverable",
            submitted_at: "2026-11-05T11:45:00Z",
            submitted_by: "lead-1",
          },
          user_profile: { id: "lead-1", full_name: "Lead Member", email: "lead@sst.scaler.com" },
          member_profiles: [
            { id: "lead-1", full_name: "Lead Member", email: "lead@sst.scaler.com" },
            { id: "teammate-1", full_name: "Teammate One", email: "teammate@sst.scaler.com" },
          ],
        },
      ],
    };
  };

  try {
    const regs = await api.getEventRegistrations("admin-token", "evt-hack-1");
    assert.equal(regs.length, 1);
    const first = regs[0];
    assert.equal(first.team_name, "Code Crafters");
    assert.equal(first.is_team_leader, true);
    assert.ok(first.submission);
    assert.equal(first.submission.repo_url, "https://github.com/code-crafters/project");
    assert.equal(first.submission.demo_url, "https://crafters.demo.app");
    assert.equal(first.submission.slides_url, "https://docs.google.com/presentation/d/deck");
    assert.equal(first.submission.notes, "Final hackathon submission deliverable");
    assert.match(calls[0].url, /\/events\/evt-hack-1\/registrations$/);
    assert.equal(calls[0].init.headers.Authorization, "Bearer admin-token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
