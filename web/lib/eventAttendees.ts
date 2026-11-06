import type { EventRegistration, AttendeeProfile } from "./api";

export type { AttendeeProfile };

export type AggregatedTeam = {
  key: string;
  id: string;
  team_id?: string | null;
  team_name: string;
  spg_id?: string | null;
  status: string;
  roster_locked: boolean;
  registered_at: string;
  leader_uid: string;
  leader_profile?: AttendeeProfile | null;
  member_uids: string[];
  profileMap: Map<string, AttendeeProfile>;
};

export function aggregateEventAttendees(registrations: EventRegistration[]): {
  allTeams: AggregatedTeam[];
  soloRegistrations: EventRegistration[];
} {
  // Pass 1: Build canonical team key aliases across team_id, spg_id, and team_name
  const nameToKey = new Map<string, string>();
  const spgToKey = new Map<string, string>();
  const teamIdToKey = new Map<string, string>();

  for (const r of registrations) {
    const isTeam = Boolean(r.team_name || (r.member_uids && r.member_uids.length > 1) || r.spg_id);
    if (!isTeam) continue;
    const canonical = r.team_id
      ? `team_${r.team_id}`
      : r.spg_id
      ? `spg_${r.spg_id}`
      : r.team_name?.trim()
      ? `name_${r.team_name.trim().toLowerCase()}`
      : `reg_${r.id || r.user_id}`;

    if (r.team_id && !teamIdToKey.has(r.team_id)) teamIdToKey.set(r.team_id, canonical);
    if (r.spg_id && !spgToKey.has(r.spg_id)) spgToKey.set(r.spg_id, canonical);
    if (r.team_name?.trim()) {
      const norm = r.team_name.trim().toLowerCase();
      if (!nameToKey.has(norm)) nameToKey.set(norm, canonical);
    }
  }

  const teamsMap = new Map<string, EventRegistration[]>();
  const solos: EventRegistration[] = [];

  for (const r of registrations) {
    const isTeam = Boolean(r.team_name || (r.member_uids && r.member_uids.length > 1) || r.spg_id);
    if (!isTeam) {
      solos.push(r);
      continue;
    }

    const key =
      (r.team_id && teamIdToKey.get(r.team_id)) ||
      (r.spg_id && spgToKey.get(r.spg_id)) ||
      (r.team_name?.trim() && nameToKey.get(r.team_name.trim().toLowerCase())) ||
      `reg_${r.id || r.user_id}`;

    if (!teamsMap.has(key)) {
      teamsMap.set(key, []);
    }
    teamsMap.get(key)!.push(r);
  }

  const aggregated: AggregatedTeam[] = [];
  teamsMap.forEach((groupRegs, key) => {
    // Find true team leader
    const explicitLeaders = groupRegs.filter((r) => r.is_team_leader);
    let leaderUid = "";
    if (explicitLeaders.length === 1) {
      leaderUid = explicitLeaders[0].user_id;
    } else if (explicitLeaders.length > 1) {
      // If multiple claim leadership (legacy bug), prefer member_uids[0] or earliest registered_at
      const firstMember = groupRegs[0].member_uids?.[0];
      const matchFirst = explicitLeaders.find((r) => r.user_id === firstMember);
      if (matchFirst) {
        leaderUid = matchFirst.user_id;
      } else {
        const sorted = [...explicitLeaders].sort((a, b) =>
          (a.registered_at || "").localeCompare(b.registered_at || "")
        );
        leaderUid = sorted[0].user_id;
      }
    } else {
      leaderUid = groupRegs[0].member_uids?.[0] || groupRegs[0].user_id;
    }

    // Collect all attendee profiles known for this team
    const profileMap = new Map<string, AttendeeProfile>();
    for (const r of groupRegs) {
      if (r.user_profile && r.user_id) {
        profileMap.set(r.user_id, r.user_profile);
      }
      for (const p of r.member_profiles || []) {
        if (p?.id) profileMap.set(p.id, p);
      }
    }

    // Consolidated ordered member list: leader first, then other members
    const memberUidsSet = new Set<string>();
    if (leaderUid) memberUidsSet.add(leaderUid);
    for (const r of groupRegs) {
      for (const m of r.member_uids || []) {
        if (m) memberUidsSet.add(m);
      }
      if (r.user_id) memberUidsSet.add(r.user_id);
    }
    const memberUids = Array.from(memberUidsSet);

    const leaderReg = groupRegs.find((r) => r.user_id === leaderUid) || groupRegs[0];
    const leaderProfile = profileMap.get(leaderUid) || leaderReg.user_profile || null;
    const teamName = groupRegs.find((r) => r.team_name)?.team_name || "Unnamed Team";
    const spgId = groupRegs.find((r) => r.spg_id)?.spg_id || null;
    const teamId = groupRegs.find((r) => r.team_id)?.team_id || null;
    const status = leaderReg.status || groupRegs[0].status;
    const isLocked = groupRegs.some((r) => Boolean(r.roster_locked));

    const sortedByDate = [...groupRegs].sort((a, b) =>
      (a.registered_at || "").localeCompare(b.registered_at || "")
    );
    const registeredAt = sortedByDate[0]?.registered_at || new Date().toISOString();

    aggregated.push({
      key,
      id: leaderReg.id || key,
      team_id: teamId,
      team_name: teamName,
      spg_id: spgId,
      status,
      roster_locked: isLocked,
      registered_at: registeredAt,
      leader_uid: leaderUid,
      leader_profile: leaderProfile,
      member_uids: memberUids,
      profileMap,
    });
  });

  return { allTeams: aggregated, soloRegistrations: solos };
}
