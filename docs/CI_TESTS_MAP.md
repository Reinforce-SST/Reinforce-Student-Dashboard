# CI/CD Test Suite & Coverage Map

This document provides a single-source-of-truth inventory of the test suites running in CI/CD, mapping every test file to the subsystems, endpoints, and architectural guarantees it verifies.

---

## 1. Running the Test Suites

### Backend Unit & Regression Suite
```bash
cd server
uv run python -m unittest discover -s tests -t .
# Or via pytest:
uv run pytest -q
```

### Frontend Typecheck, Lint & Build
```bash
cd web
npm test
npm run lint
npm run build
```

### Frontend End-to-End Suite (Playwright)
```bash
cd web
npm run e2e
```

---

## 2. Dashboard Backend Test Suite Map (`server/tests/`)

The backend test suite runs 41 test files against in-memory Firestore fakes (`NestedFirestore` and `FirestoreFake`) with 0 external network dependencies.

### A. Events & Hackathons (`app/api/v1/endpoints/events.py`)
| Test File | Focus & Scenarios Verified |
| :--- | :--- |
| **`test_event_squad_operations.py`** | Roster early locking (`POST /events/{id}/team/lock`), automatic SPG minting upon lock, leader-only permissions, min team size enforcement, leaving prevention while roster is locked, roster unlocking (`POST /events/{id}/team/unlock`), deadline enforcement with admin override, admin squad roster override (`PATCH /teams/{id}/roster`), team pool solo query (`GET /events/{id}/team-pool`), idea attachment sync across teammates, and SPG 2-way sync with capacity limits. |
| **`test_event_team_merging.py`** | 7-step Register-First flow: individual registration, squad creation by code, merge-by-code host leadership preservation, leaving squad resetting to solo registered, and deliverable submission synchronization. |
| **`test_event_hardening.py`** | Deadline parsing, graduation batch eligibility, teammate existence validation, waitlist transaction handling, solo vs team SPG formation rules, roll-call attendance idempotency, and winner award verification. |
| **`test_event_advanced_ops.py`** | Custom intake fields, track capacity limits, project submission matrix sync, CSV export sanitization, draft mode admin-only access, track switching, and intake response updating. |
| **`test_event_matrix.py`** | Hackathon matrix columns CRUD, batch cell updates, assignment of all columns, volunteer/admin access control, attendance toggling, and cell value validation. |
| **`test_event_schema.py`** | Event Pydantic schemas, timeline validation, participation constraints, and graduation batch calculations without initializing Firebase. |

---

### B. Special Project Groups (SPGs) (`app/api/v1/endpoints/spg.py` & `app/services/spgs.py`)
| Test File | Focus & Scenarios Verified |
| :--- | :--- |
| **`test_spg_api.py`** | SPG privacy boundaries (private vs public), admin permissions, adding and removing members, lead transfer, pause/resume/disband state transitions, and PDF report uploads. |
| **`test_spg_service.py`** | Service-layer domain rules for SPG creation, proposition PDFs, member limits, status transitions, and disbandment immutability. |
| **`test_spg_approval.py`** | Admin approving SPG registration tickets (`POST /tickets/{id}/approve-spg`), idempotent creation, and member assignment. |
| **`test_spg_milestones.py`** | Milestone CRUD, submilestone completion toggling, ordering, and milestone deletion. |
| **`test_spg_reports.py`** | PDF vs structured form progress report submissions, chronological history indexing, sequence numbers, and admin report verification. |
| **`test_spg_schema.py`** | SPG Pydantic models, duration/frequency validation, and report schemas. |

---

### C. Hero Banners (`app/api/v1/endpoints/banners.py`)
| Test File | Focus & Scenarios Verified |
| :--- | :--- |
| **`test_banners.py`** | Full CRUD for dashboard hero banners (admin-only), visibility filtering (`draft` banners 404 for visitors and members, 200 for admins), schedule sorting (newest start time first), custom destination CTA URL preservation, and media upload storage mocking. |

---

### D. Ideas Jar (`app/api/v1/endpoints/ideas.py`)
| Test File | Focus & Scenarios Verified |
| :--- | :--- |
| **`test_ideas_student_lifecycle.py`** | Student submitting idea proposals (`POST /ideas`), listing own submitted ideas (`GET /ideas/my`), random approved idea draw (`GET /ideas/random`), upvote toggling with counter tracking (`POST /ideas/{id}/upvote`), admin approval/publishing, and deletion. |
| **`test_ideas_admin_edit.py`** | Admin modifying title, description, prerequisites, and roadmap for pending or published ideas. |
| **`test_idea_schema.py`** | Idea Jar Pydantic schemas, track enums, difficulty validation, and stats counters. |

---

### E. Community Blogs & Research Papers (`app/api/v1/endpoints/blogs.py`)
| Test File | Focus & Scenarios Verified |
| :--- | :--- |
| **`test_blog_community.py`** | Blog upvote toggling (`POST /blogs/{id}/upvote`), top-level comment posting, nested 1-level thread replies (`parent_id`), comment tree retrieval (`GET /blogs/{id}/comments`), and soft-deletion with content masking. |
| **`test_blog_visibility.py`** | Public feed filtering (only published articles visible), author/admin draft access, and unlisted article direct link retrieval. |
| **`test_research_papers.py`** | Research paper article kind, paper metadata (authors, venue, paper_url), validation against web links, and converting articles to papers. |
| **`test_blog_schema.py`** | Blog schemas, slug formatting, and reading time estimation. |

---

### F. Unified Ticket System (`app/api/v1/endpoints/tickets.py`)
| Test File | Focus & Scenarios Verified |
| :--- | :--- |
| **`test_ticket_communication.py`** | Member filing support/reimbursement tickets (`POST /tickets`), posting thread messages (`POST /tickets/{id}/messages`), fetching thread history, closing tickets with reasons, admin status/priority updates, assignment to leads, and ticket metrics analytics. |
| **`test_tickets.py`** | Ticket thread chronological sorting, Discord link name verification, confidential report isolation, and SPG registration ticket validation. |
| **`test_ticket_schema.py`** | Ticket Pydantic schemas, category constraints, and priority enums. |

---

### G. Invitations System (`app/api/v1/endpoints/invitations.py`)
| Test File | Focus & Scenarios Verified |
| :--- | :--- |
| **`test_invitations.py`** | SPG invitations lifecycle, Event Team invitations lifecycle, target-based queries, invitee accept/decline, teammate unregistration preserving SPG and team registration, and lead unregistration disbanding SPG. |

---

### H. Users & Identity (`app/api/v1/endpoints/users.py`)
| Test File | Focus & Scenarios Verified |
| :--- | :--- |
| **`test_user_schema.py`** | UserDocument contract, social links, skill lists, and ISO timestamp formatting. |
| **`test_user_enumeration.py`** | Preventing member enumeration attacks on user endpoints. |
| **`test_profile_creation.py`** | User profile creation, default points dictionary, and graduation batch calculations. |
| **`test_profile_security.py`** | Rejection of whitespace names, excessive skills, and unverified college emails. |
| **`test_admin_workflows.py`** | Admin directory search, admin role assignment, and avatar/image upload validation. |
| **`test_discord_link.py`** | OAuth Discord verification, linking Discord ID, and unlinking. |

---

### I. Contributions & Ledger (`app/api/v1/endpoints/contributions.py` & `app/services/contributions.py`)
| Test File | Focus & Scenarios Verified |
| :--- | :--- |
| **`test_contribution_api.py`** | Awarding points to users, awarding points to SPGs, revoking points, and leaderboard retrieval. |
| **`test_contribution_service.py`** | Ledger recalculation, atomic transactions, idempotency, and balance integrity. |
| **`test_contribution_hooks.py`** | Automated hooks awarding points upon event attendance or idea approval. |
| **`test_contribution_pending.py`** | Pending contribution requests isolation from the active leaderboard. |
| **`test_contribution_schema.py`** | Contribution ledger schemas and category rules. |

---

### J. Infrastructure, Routers & Hardening
| Test File | Focus & Scenarios Verified |
| :--- | :--- |
| **`test_app_routes.py`** | Verifies that all 82 active routes across all 10 routers are mounted on `main.app`, CORS error middleware is functional, and no `/api/v1/api/v1` double prefix exists. |
| **`test_backend_hardening.py`** | Cross-service regression tests: forbidding Firestore profile privilege escalation, draft filtering, and idea ticket transitions. |
| **`test_learning_resources.py`** | Curated resource CRUD, saving event resources, and deduplication. |
| **`test_student_schema.py`** | Validates that legacy Student models are fully unified into User schemas without schema regressions. |

---

## 3. Dashboard Frontend Test Suite Map (`web/tests/`)

The frontend CI/CD pipeline runs unit tests via `node --test` (compiled through `tsconfig.test.json` to `.test-build/`) and full user journey specifications via Playwright with in-memory browser mocks (`web/tests/e2e/fixtures/`).

### A. Frontend Unit Test Suite (`web/tests/*.test.mjs`)
| Test File | Focus & Architectural Guarantees |
| :--- | :--- |
| **`event-squads.test.mjs`** | Validates `aggregateEventAttendees` deduplication: canonical clustering across `team_id`, `spg_id`, and `team_name`; resolution of true team leader when multiple members claim leadership (Bug 3 prevention); propagation of `roster_locked` status across the entire squad; and strict isolation of solo registrants. |
| **`dashboard-data.test.mjs`** | Excludes past and draft events from dashboard upcoming feeds; computes India calendar date rollover across UTC boundaries; verifies hero banner presentation fallbacks; and validates destination URL security (`isBannerDestination`) against malicious protocols (`javascript:`, `data:`, `//`). |
| **`event-api.test.mjs`** | Verifies authenticated API client mutations: team registration, post-event feedback submission, admin contribution merit awards, squad roster locking (`POST /events/{id}/team/lock`), squad roster unlocking (`POST /events/{id}/team/unlock`), admin squad roster edits (`PATCH /events/{id}/teams/{id}/roster`), joining by code, leaving squads, and attaching ideas to registrations. |
| **`banner-api.test.mjs`** | Verifies banner API client queries with status/limit query parameters, admin creation (`POST /banners`), admin updates (`PUT /banners/{id}`), deletions (`DELETE /banners/{id}`), and media file multipart uploads. |
| **`invitation-api.test.mjs`** | Verifies invitation API client queries: listing received invitations (`GET /invitations/me`), target-based invitation queries, accepting invitations (`POST /invitations/{id}/accept`), declining, and revoking outgoing invitations. |
| **`notifications.test.mjs`** | Transforms ticket status updates and contribution approvals into member notification cards; filters upcoming events to published, public events within 7 days; and formats actionable notices for pending SPG and event team invitations (`invitationNotices`). |
| **`ticket-api.test.mjs`** | Validates authenticated ticket submission payloads, ticket detail field mapping, and admin ticket search/filter query parameter serialization (`assigned_to_uid`, `status`, `priority`). |
| **`discovery-api.test.mjs`** | Ensures public article reads and idea jar listings execute without requiring auth tokens; verifies authenticated idea submission; and validates random approved idea draw requests (`GET /ideas/random`). |
| **`contribution-api.test.mjs`** | Tests member contribution history requests, cursor-based pagination, and status filters. |
| **`cache.test.mjs`** | Validates client-side memory cache TTL expiration, cache hits, and tag-based invalidation across interrelated subsystems. |
| **`auth-flow.test.mjs`** | Tests Firebase token persistence and auth state synchronization. |
| **`batch-year.test.mjs`** | Parses student emails and batch years into graduation seasons and academic classifications. |
| **`event-matrix.test.mjs`** | Validates hackathon evaluation matrix column sorting, custom scores, and attendance cell updates. |
| **`event-batches.test.mjs`** | Tests batch-level event eligibility rules and restrictions. |
| **`member-data.test.mjs`** | Formats student tier badges, points tallies, and profile skill tag arrays. |

---

### B. Frontend End-to-End Suite (`web/tests/e2e/*.spec.ts`)
| Spec File | User Journey & Scenarios Verified |
| :--- | :--- |
| **`banners.spec.ts`** | Admin creating hero banners, modifying existing banners, and dashboard hero carousel slide rendering for students. |
| **`event-squad-lock.spec.ts`** | Squad leader locking team roster with modal confirmation, UI reflecting locked state tag, and admin override squad roster editing modal. |
| **`event-team-spg.spec.ts`** | Team event creation with automatic SPG formation enabled by default; admin opting out of SPG; and student team registration with teammate selection. |
| **`event-attendance.spec.ts`** | Admin attendance console restricted to admins; per-student combobox status adjustments; bulk roll-call check-in filtering; walk-in additions; and member attendee list rendering. |
| **`event-teammate-search.spec.ts`** | Searchable combobox for eligible teammates with debounce, excluding already registered peers. |
| **`events.spec.ts`** | Public event feed browsing, event detail navigation, and registration state reflection. |
| **`admin-ideas.spec.ts`** | Admin reviewing proposed ideas, approving, modifying difficulty/roadmap, and rejecting proposals. |
| **`idea-jar.spec.ts`** | Student submitting idea proposals, drawing random ideas from the jar, and toggling upvotes. |
| **`tickets.spec.ts`** | Student creating support tickets, viewing ticket detail fields, and replying in discussion threads. |
| **`admin-tickets.spec.ts`** | Admin filtering tickets by category/priority/status, assigning to team leads, and resolving tickets. |
| **`contribution-review.spec.ts`** | Admin reviewing submitted contributions, awarding points, or rejecting with required reason. |
| **`learning-resources.spec.ts`** | Browsing categorized learning resources, admin creating resources, and linking event recordings and slides. |
| **`article-markdown.spec.ts`** | Markdown rendering in community articles, fenced code blocks, and table formatting. |
| **`discovery.spec.ts`** | Filtering Article Hub by kind (`article` vs `research_paper`), query searching, and pagination. |
| **`research-papers.spec.ts`** | Research paper list presentation, metadata badges, and external PDF link validation. |
| **`spg.spec.ts`** | SPG project pages, progress report submission timelines, and member roster listings. |
| **`member.spec.ts`** | Member profile overview, verified Discord status, contribution points summary, and public ledger. |
| **`auth.spec.ts`** | Firebase authentication, Discord account linking/verification, and unlinking. |
| **`navigation.spec.ts`** | Header navigation links, sidebar active states, and mobile responsive navigation drawer. |
| **`public.spec.ts`** | Unauthenticated landing page and public event previews. |
| **`security-headers.spec.ts`** | Enforces strict CSP and security headers on all served responses. |

