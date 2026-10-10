"use client";

import Link from "next/link";
import { useMember } from "@/lib/useMember";
import MemberIcon from "@/components/dashboard/MemberIcon";
import AdminSpgManagementPanel from "../AdminSpgManagementPanel";

export default function ManageSpgsClient() {
  const { profile, token } = useMember();

  if (!profile.is_admin) {
    return (
      <div style={{ padding: "60px 20px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
        <MemberIcon name="alert-circle" size={32} />
        <h2 style={{ color: "#ffffff", margin: 0 }}>Administrator Access Required</h2>
        <p style={{ color: "#8c8c98", maxWidth: "420px", margin: 0 }}>
          This console is reserved for club administrators to manage SPGs, audit cluster health, and organize event groups.
        </p>
        <Link
          href="/dashboard"
          style={{
            background: "var(--brand, #E5B731)",
            color: "#0c0c0e",
            padding: "8px 18px",
            borderRadius: "8px",
            fontWeight: 800,
            textDecoration: "none",
            fontSize: "0.82rem",
          }}
        >
          Return to Member Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "1280px", margin: "0 auto", paddingBottom: "40px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Link
              href="/dashboard/admin"
              style={{
                color: "#8c8c98",
                fontSize: "0.78rem",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              ← Back to Admin Console
            </Link>
          </div>
          <h1 style={{ fontSize: "1.65rem", fontWeight: 850, color: "#ffffff", margin: "6px 0 0 0", letterSpacing: "-0.02em" }}>
            Special Project Groups (SPG) Console
          </h1>
          <p style={{ color: "#8c8c98", fontSize: "0.84rem", margin: "4px 0 0 0" }}>
            Monitor cluster activity, filter event hackathon teams, and manage student project lifecycles.
          </p>
        </div>

        <Link
          href="/dashboard/spg"
          style={{
            background: "transparent",
            border: "1px solid #33333e",
            color: "#e4e4e7",
            padding: "8px 14px",
            borderRadius: "8px",
            fontSize: "0.76rem",
            fontWeight: 700,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <MemberIcon name="spg" size={14} />
          View Member SPG Directory ↗
        </Link>
      </div>

      <AdminSpgManagementPanel token={token || ""} />
    </div>
  );
}
