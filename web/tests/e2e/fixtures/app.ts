/**
 * Browser-boundary fixtures for the end-to-end suite.
 *
 * Every Reinforce API call and every Firebase network call is fulfilled here.
 * Nothing in `app/`, `components/` or `lib/` is aware of this file, so the
 * build under test is the build that ships.
 *
 * The API base URL must match NEXT_PUBLIC_API_BASE_URL at build time, and
 * FIREBASE_API_KEY must match NEXT_PUBLIC_FIREBASE_API_KEY, because Next
 * inlines both into the client bundle.
 */
import { test as base, expect, type Page, type Route } from "@playwright/test";
import * as fixture from "./data";

export const API_BASE = "http://localhost:8080/api/v1";
export const FIREBASE_API_KEY = "e2e-api-key";

type Json = Record<string, unknown> | unknown[];

/** Per-test mutable world. Specs flip these to drive the UI into a state. */
export type World = {
  profile: Record<string, unknown>;
  token: string;
  /** Endpoints forced to fail, keyed by the suffix the router matches on. */
  fail: Set<string>;
  /** Collections the router serves. Specs may empty them. */
  tickets: Record<string, unknown>[];
  ideas: Record<string, unknown>[];
  articles: Record<string, unknown>[];
  events: Record<string, unknown>[];
  spgs: Record<string, unknown>[];
  /** Requests the browser actually made, for contract assertions. */
  calls: { method: string; path: string; body?: unknown; auth?: string }[];
  /** Bodies posted to /users/verify-discord. */
  links: Record<string, unknown>[];
  /** Whether the member currently holds an event registration. */
  registered: boolean;
};

function freshWorld(): World {
  return {
    profile: { ...fixture.memberProfile },
    token: fixture.MEMBER_TOKEN,
    fail: new Set<string>(),
    tickets: [{ ...fixture.ticket }],
    ideas: [{ ...fixture.idea }],
    articles: [{ ...fixture.article }],
    events: [{ ...fixture.upcomingEvent }, { ...fixture.pastEvent }],
    spgs: [{ ...fixture.spg }],
    calls: [],
    links: [],
    registered: false,
  };
}

const page1 = (items: unknown[]) => ({ items, total: items.length, has_more: false, page: 1, page_size: 20 });

/**
 * Fulfils one API request.
 *
 * Matching is on the path suffix after /api/v1, so it stays readable next to
 * the paths in lib/api.ts. Anything unmatched returns 404 with a loud detail —
 * an unmatched call is a test bug, not a silent pass.
 */
async function handleApi(route: Route, world: World) {
  const request = route.request();
  const method = request.method();
  const url = new URL(request.url());
  const path = url.pathname.replace(/^.*\/api\/v1/, "");
  const search = url.searchParams;

  if (method === "OPTIONS") {
    return route.fulfill({
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization,content-type",
        "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
      },
    });
  }

  let body: unknown;
  try {
    body = request.postDataJSON();
  } catch {
    body = undefined;
  }
  const auth = request.headers().authorization;
  world.calls.push({ method, path, body, auth });

  const ok = (json: Json) => route.fulfill({ json });
  const fail = (status: number, detail: string) => route.fulfill({ status, json: { detail } });

  for (const marker of world.fail) {
    if (path.endsWith(marker) || path === marker) return fail(503, `${marker} is unavailable`);
  }

  /* ------------------------------------------------------------- identity */
  if (path === "/users/sync") return ok(world.profile);
  if (path === "/users/me" && method === "GET") return ok(world.profile);
  if (path === "/users/me" && method === "PATCH") {
    world.profile = { ...world.profile, ...(body as object) };
    return ok(world.profile);
  }
  if (path === "/users/verify-discord") {
    const payload = body as Record<string, unknown>;
    // Recorded, not asserted. An assertion thrown here would abandon the route
    // without fulfilling it, so a real regression would surface as a page that
    // hangs until the test times out. auth.spec.ts asserts the contract against
    // world.links instead, where a failure names what actually went wrong.
    world.links.push(payload);
    return ok({
      success: true,
      user: world.profile,
      bot_response: {
        status: "bot_unreachable",
        detail: "The bot could not confirm your role. Run /auth in Discord again to retry.",
      },
    });
  }
  if (path === "/users/unlink-discord") {
    world.profile = { ...world.profile, discord_id: null, is_verified: false };
    return ok({ success: true, message: "Discord unlinked.", user: world.profile });
  }
  // Shape is { track, total, entries } — not an items list.
  if (path === "/users/leaderboard") {
    return ok({ track: search.get("track") ?? "total", total: fixture.leaderboardRows.length, entries: fixture.leaderboardRows });
  }
  if (path === "/users/admin-directory") return ok(page1(fixture.directoryRows));
  if (path === "/users" && method === "GET") return ok(page1(fixture.directoryRows));
  if (/^\/users\/[^/]+\/status$/.test(path)) return ok({ ...world.profile, is_member: true });
  if (/^\/users\/[^/]+$/.test(path)) return ok(world.profile);

  /* -------------------------------------------------------------- tickets */
  if (path === "/tickets/my") return ok({ total: world.tickets.length, items: world.tickets });
  if (path === "/tickets" && method === "GET") return ok({ total: world.tickets.length, items: world.tickets });
  if (path === "/tickets" && method === "POST") {
    const created = { ...fixture.ticketDetail, id: "ticket-new", ...(body as object) };
    world.tickets = [created, ...world.tickets];
    return ok(created);
  }
  if (/^\/tickets\/[^/]+\/messages$/.test(path)) {
    if (method === "POST") return ok({ id: "message-new", ...(body as object) });
    return ok(fixture.ticketMessages);
  }
  if (/^\/tickets\/[^/]+\/(status|assign|close|approve-spg)$/.test(path)) {
    return ok({ ...fixture.ticketDetail, status: (body as Record<string, unknown>)?.status ?? "resolved" });
  }
  if (/^\/tickets\/[^/]+$/.test(path)) return ok(fixture.ticketDetail);

  /* ---------------------------------------------------------------- ideas */
  if (path === "/ideas/my") return ok({ items: [{ ...fixture.pendingIdea }] });
  if (path === "/ideas/pending") return ok({ items: [{ ...fixture.pendingIdea }] });
  if (path === "/ideas/admin") return ok(page1([{ ...fixture.idea }, { ...fixture.pendingIdea }]));
  if (path === "/ideas" && method === "GET") {
    const term = (search.get("search") ?? "").toLowerCase();
    const matching = world.ideas.filter(item => !term || String(item.title).toLowerCase().includes(term));
    return ok(page1(matching));
  }
  if (path === "/ideas" && method === "POST") return ok({ ...fixture.ideaDetail, ...(body as object), is_verified: false });
  if (/^\/ideas\/[^/]+\/upvote$/.test(path)) return ok({ upvoted: true, upvote_count: 10 });
  if (/^\/ideas\/[^/]+\/approve$/.test(path)) return ok({ ...fixture.ideaDetail, is_verified: true });
  // rejectIdea is a DELETE on the idea itself and answers { message, id }.
  if (/^\/ideas\/[^/]+$/.test(path) && method === "DELETE") {
    return ok({ message: "Idea rejected.", id: path.split("/")[2] });
  }
  if (/^\/ideas\/[^/]+$/.test(path)) return ok(fixture.ideaDetail);

  /* ---------------------------------------------------------------- blogs */
  if (path === "/blogs" && method === "GET") {
    const term = (search.get("search") ?? "").toLowerCase();
    const matching = world.articles.filter(item => !term || String(item.title).toLowerCase().includes(term));
    return ok(page1(matching));
  }
  if (path === "/blogs" && method === "POST") return ok(fixture.articleDetail);
  if (/^\/blogs\/[^/]+$/.test(path)) return ok(fixture.articleDetail);

  /* --------------------------------------------------------------- events */
  // The list is keyed `events`, not `items`. Returning `items` here leaves the
  // dashboard filtering an undefined array.
  if (path === "/events" && method === "GET") {
    const timeline = search.get("timeline");
    const start = (item: Record<string, unknown>) =>
      Date.parse(String((item.schedule as { start_time: string }).start_time));
    const cutoff = Date.parse(fixture.NOW_ISO);
    const matching = world.events.filter(item =>
      timeline === "upcoming" ? start(item) >= cutoff : timeline === "past" ? start(item) < cutoff : true,
    );
    return ok({ events: matching, total: matching.length });
  }
  if (path === "/events" && method === "POST") return ok(fixture.upcomingEvent);
  if (/^\/events\/[^/]+\/my-registration$/.test(path)) {
    return ok(
      world.registered
        ? { is_registered: true, registration: { status: "registered" } }
        : { is_registered: false, registration: null },
    );
  }
  if (/^\/events\/[^/]+\/register$/.test(path)) {
    world.registered = method !== "DELETE";
    return ok({ status: world.registered ? "registered" : "cancelled" });
  }
  if (/^\/events\/[^/]+\/registrations\/manual$/.test(path)) return ok(fixture.eventRegistration);
  if (/^\/events\/[^/]+\/registrations\/[^/]+\/attendance$/.test(path)) {
    return ok({ ...fixture.eventRegistration, status: "checked_in" });
  }
  // Registrations come back as a bare array.
  if (/^\/events\/[^/]+\/registrations$/.test(path)) return ok([fixture.eventRegistration]);
  if (/^\/events\/[^/]+\/attendance\/roll-call$/.test(path)) return ok({ updated: 1 });
  if (/^\/events\/[^/]+\/feedback$/.test(path)) return ok({ success: true });
  if (/^\/events\/[^/]+\/status$/.test(path)) return ok({ ...fixture.upcomingEvent, status: "published" });
  if (/^\/events\/[^/]+$/.test(path)) {
    const slug = path.split("/")[2];
    const match = world.events.find(item => item.id === slug || item.slug === slug);
    return ok(match ? { ...fixture.eventDetail, ...match } : fixture.eventDetail);
  }

  /* ----------------------------------------------------------------- spgs */
  if (path === "/spgs" && method === "GET") return ok(page1(world.spgs));
  if (/^\/spgs\/[^/]+\/reports\/(form|pdf)$/.test(path)) return ok(fixture.spgReport);
  if (/^\/spgs\/[^/]+\/reports$/.test(path)) return ok(page1([fixture.spgReport]));
  if (/^\/spgs\/[^/]+$/.test(path)) return ok(fixture.spg);

  /* -------------------------------------------------------- contributions */
  // A bare array, unlike every other leaderboard response.
  if (path === "/contributions/leaderboard") {
    return ok(fixture.leaderboardRows.map(row => ({ user_id: row.id, points: row.points, contribution_count: 3 })));
  }
  if (path.startsWith("/contributions/me")) return ok(page1([fixture.contribution]));
  if (/^\/contributions\/public\/user\/[^/]+$/.test(path)) return ok(page1([fixture.contribution]));
  if (/^\/contributions\/user\/[^/]+$/.test(path)) return ok(page1([fixture.contribution]));
  if (/^\/contributions\/award\/user\/[^/]+$/.test(path)) return ok(fixture.contribution);
  if (/^\/contributions\/recalculate\/[^/]+$/.test(path)) return ok({ ...world.profile });
  if (/^\/contributions\/[^/]+\/review$/.test(path)) return ok({ ...fixture.contribution, status: "approved" });
  if (/^\/contributions\/[^/]+$/.test(path)) return ok(fixture.contribution);

  return fail(404, `Unmocked API route: ${method} ${path}`);
}

/** Fulfils Firebase's own network calls so no request leaves the machine. */
async function mockFirebase(page: Page, world: World) {
  await page.route("https://securetoken.googleapis.com/**", route =>
    route.fulfill({
      json: {
        access_token: world.token,
        id_token: world.token,
        refresh_token: "e2e-refresh",
        expires_in: "3600",
        token_type: "Bearer",
        user_id: world.profile.id,
        project_id: "e2e",
      },
    }),
  );
  await page.route("https://identitytoolkit.googleapis.com/**", route =>
    route.fulfill({
      json: {
        users: [
          {
            localId: String(world.profile.id),
            email: String(world.profile.email),
            emailVerified: true,
            displayName: String(world.profile.full_name),
            providerUserInfo: [
              { providerId: "google.com", rawId: String(world.profile.id), email: String(world.profile.email) },
            ],
            validSince: "0",
            lastLoginAt: String(Date.parse(fixture.NOW_ISO)),
            createdAt: String(Date.parse(fixture.NOW_ISO)),
          },
        ],
      },
    }),
  );
  await page.route("https://www.googleapis.com/**", route => route.fulfill({ json: {} }));
}

/**
 * Writes a Firebase session into IndexedDB.
 *
 * Firebase reads its persisted user from `firebaseLocalStorageDb` before it
 * makes any network call, so this is what makes the app believe a member is
 * signed in. The page must already be on the app origin.
 */
export async function signIn(page: Page, world: World) {
  const now = Date.parse(fixture.NOW_ISO);
  const user = {
    uid: String(world.profile.id),
    email: String(world.profile.email),
    emailVerified: true,
    displayName: String(world.profile.full_name),
    isAnonymous: false,
    providerData: [
      {
        providerId: "google.com",
        uid: String(world.profile.id),
        displayName: String(world.profile.full_name),
        email: String(world.profile.email),
        photoURL: null,
        phoneNumber: null,
      },
    ],
    stsTokenManager: {
      refreshToken: "e2e-refresh",
      accessToken: world.token,
      expirationTime: now + 3_600_000,
    },
    createdAt: String(now),
    lastLoginAt: String(now),
    apiKey: FIREBASE_API_KEY,
    appName: "[DEFAULT]",
  };

  await page.evaluate(
    async ({ user, key }) => {
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("firebaseLocalStorageDb", 1);
        open.onupgradeneeded = () =>
          open.result.createObjectStore("firebaseLocalStorage", { keyPath: "fbase_key" });
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("firebaseLocalStorage", "readwrite");
          tx.objectStore("firebaseLocalStorage").put({ fbase_key: key, value: user });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    },
    { user, key: `firebase:authUser:${FIREBASE_API_KEY}:[DEFAULT]` },
  );
}

/** Replaces the stored access token, which is how the app sees a refresh. */
export async function rotateToken(page: Page, world: World, next: string) {
  world.token = next;
  await page.evaluate(
    async ({ key, next }) => {
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("firebaseLocalStorageDb", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("firebaseLocalStorage", "readwrite");
          const store = tx.objectStore("firebaseLocalStorage");
          const read = store.get(key);
          read.onsuccess = () => {
            read.result.value.stsTokenManager.accessToken = next;
            read.result.value.stsTokenManager.expirationTime = Date.now() + 3_600_000;
            store.put(read.result);
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    },
    { key: `firebase:authUser:${FIREBASE_API_KEY}:[DEFAULT]`, next },
  );
}

export type AppFixture = {
  world: World;
  /** Page errors and failed console messages seen so far. */
  problems: string[];
  /** Signs a member in and lands on the given path. */
  enter: (path?: string) => Promise<void>;
};

export const test = base.extend<{ app: AppFixture }>({
  app: async ({ page }, use) => {
    const world = freshWorld();
    const problems: string[] = [];

    page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
    page.on("console", message => {
      if (message.type() !== "error") return;
      const text = message.text();
      // React's devtools notice is not a defect. Neither is the browser's own
      // log line for a response the test deliberately failed — the point of an
      // outage test is that the UI copes, and the console entry is unavoidable.
      if (/Download the React DevTools/.test(text)) return;
      if (/Failed to load resource/.test(text)) return;
      problems.push(`console: ${text}`);
    });

    await mockFirebase(page, world);
    await page.route(`${API_BASE}/**`, route => handleApi(route, world));

    const enter = async (path = "/dashboard") => {
      await page.goto("/");
      await signIn(page, world);
      await page.goto(path);
    };

    await use({ world, problems, enter });
  },
});

export { expect };
export const data = fixture;

/** Fails when the document scrolls sideways at the current viewport. */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, "horizontal overflow in pixels").toBeLessThanOrEqual(1);
}
