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
