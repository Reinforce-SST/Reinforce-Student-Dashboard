from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import re
from app.services.config import get_settings

from app.api.v1.endpoints import (
    tickets,
    blogs,
    users,
    contributions,
    spg,
    ideas,
    events,
)

settings = get_settings()
app = FastAPI()

# A browser Origin header is scheme://host[:port] with no path and no trailing
# slash, and Starlette matches these by exact string. An entry written with a
# trailing slash silently never matches, so CORS fails for that site.
origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://reinforce-student-dashboard-xi.vercel.app",
    "https://reinforce-student-dashboard.vercel.app",
    settings.frontend_url.rstrip("/"),
]

# Vercel gives every preview deployment its own hostname, so reviewers cannot be
# served by adding URLs to the list above one at a time. All of them are the
# project name, an optional per-deployment or per-branch segment, then the team
# slug:
#
#     reinforce-student-dashboard-reinforce3.vercel.app
#     reinforce-student-dashboard-<hash>-reinforce3.vercel.app
#     reinforce-student-dashboard-git-<branch>-reinforce3.vercel.app
#
# Starlette matches this with re.fullmatch, so the pattern is anchored at both
# ends and a hostname cannot be extended past it — ...vercel.app.attacker.com
# does not match. Both the project name and the team slug are required, so this
# widens access to our own previews and nothing else. If the project moves to a
# club-owned Vercel team the slug changes and this stops matching, which fails
# closed rather than open.
team_slugs = [
    re.escape(slug.strip())
    for slug in settings.vercel_team_slugs.split(",")
    if slug.strip()
]
preview_origin_regex = (
    rf"https://reinforce-student-dashboard(-[a-z0-9-]+)?-({'|'.join(team_slugs)})\.vercel\.app"
    if team_slugs
    else r"(?!)"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=preview_origin_regex,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"

app.include_router(users.router, prefix=API_PREFIX)
app.include_router(contributions.router, prefix=API_PREFIX)
app.include_router(spg.router, prefix=API_PREFIX)
app.include_router(tickets.router, prefix=API_PREFIX)
app.include_router(blogs.router, prefix=API_PREFIX)
app.include_router(ideas.router, prefix=API_PREFIX)
app.include_router(events.router, prefix=API_PREFIX)


@app.get("/")
@app.head("/")
async def root():
    return {"status": "ok", "service": "Reinforce Student Dashboard API"}


@app.get("/health")
@app.head("/health")
async def health():
    return {"status": "healthy"}
