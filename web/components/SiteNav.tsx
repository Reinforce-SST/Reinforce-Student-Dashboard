"use client";

import Link from "next/link";
import LandingNav from "./landing/LandingNav";
import { useEffect, useState } from "react";
import Pill from "./Pill";
import styles from "./SiteNav.module.css";

import Image from "next/image";
import logo from "@/public/brand/logo_main_trim.png";
import { useAuth } from "@/lib/useAuth";

// Only routes that exist and have real data behind them. Writing, Events,
// Research and Team are in the PRD but have no source yet — no collection, no
// admin entry path — so they are deliberately absent rather than linked to a
// 404 or filled with placeholder content. Add the link when the page is real.
const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tracks", label: "Tracks" },
  { href: "/projects", label: "Projects" },
];

export default function SiteNav(_props?: { landing?: boolean }) {
  return <LandingNav />;
}
