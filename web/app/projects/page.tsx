import type { Metadata } from "next";
import PageHero from "@/components/PageHero";
import SiteFooter from "@/components/SiteFooter";
import SiteNav from "@/components/SiteNav";
import styles from "./projects.module.css";

export const metadata: Metadata = {
  title: "Projects",
  description:
    "Everything the Reinforce club has built, read live from the club's GitHub organisation.",
};

// Re-fetched hourly. GitHub's unauthenticated rate limit is 60 requests per
// hour per IP; caching keeps us far below it regardless of traffic.
export const revalidate = 3600;

const ORG = "Reinforce-SST";

type Repo = {
  id: number;
  name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  pushed_at: string;
  fork: boolean;
  archived: boolean;
};

/**
 * Real repositories, read from the GitHub API at build and revalidated hourly.
 * Nothing on this page is hand-written, so it cannot drift from reality.
 */
async function getRepos(): Promise<Repo[] | null> {
  try {
    const res = await fetch(
      `https://api.github.com/orgs/${ORG}/repos?per_page=100&sort=updated`,
      {
        headers: { Accept: "application/vnd.github+json" },
        next: { revalidate },
      },
    );
    if (!res.ok) return null;
    const repos = (await res.json()) as Repo[];
    return repos
      // `.github` holds the org profile and shared templates — infrastructure,
      // not a project anyone built.
      .filter((r) => r.name !== ".github" && !r.fork)
      .sort((a, b) => Date.parse(b.pushed_at) - Date.parse(a.pushed_at));
  } catch {
    // Network failure must not take the page down.
    return null;
  }
}

function updated(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "updated today";
  if (days === 1) return "updated yesterday";
  if (days < 30) return `updated ${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `updated ${months}mo ago`;
  return `updated ${Math.floor(months / 12)}y ago`;
}

export default async function ProjectsPage() {
  const repos = await getRepos();

  return (
    <>
      <SiteNav />
      <main>
        <PageHero
          index="01"
          eyebrow="Open source"
          title={<>Everything we build, <em>in public.</em></>}
          lede="Every repository the club owns is public, and every contribution carries the name of the member who made it. This page reads the club's GitHub organisation directly, so it is never out of date."
        />

        <section className={`section-paper on-light ${styles.wrap}`}>
          <div className="page">
            {repos === null ? (
              <p className={styles.fallback}>
                GitHub couldn&rsquo;t be reached just now.{" "}
                <a
                  className={styles.inlineLink}
                  href={`https://github.com/${ORG}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Browse the organisation directly
                </a>
                .
              </p>
            ) : repos.length === 0 ? (
              <p className={styles.fallback}>No public repositories yet.</p>
            ) : (
              <ul className={styles.grid}>
                {repos.map((repo) => (
                  <li key={repo.id}>
                    <a
                      className={styles.card}
                      href={repo.html_url}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      <div className={`mono ${styles.head}`}>
                        <span>{repo.language ?? "Mixed"}</span>
                        {repo.archived ? <span>Archived</span> : null}
                      </div>

                      <h2 className={styles.name}>{repo.name}</h2>

                      {repo.description ? (
                        <p className={styles.desc}>{repo.description}</p>
                      ) : null}

                      <dl className={styles.stats}>
                        <div>
                          <dd className={styles.stat}>{repo.stargazers_count}</dd>
                          <dt className={`mono ${styles.statLabel}`}>stars</dt>
                        </div>
                        <div>
                          <dd className={styles.stat}>{repo.forks_count}</dd>
                          <dt className={`mono ${styles.statLabel}`}>forks</dt>
                        </div>
                      </dl>

                      <p className={`mono ${styles.updated}`}>{updated(repo.pushed_at)}</p>
                    </a>
                  </li>
                ))}
              </ul>
            )}

            <p className={styles.note}>
              Want your name on one of these? A fixed typo is a real contribution. Read the
              repository&rsquo;s <code>CONTRIBUTING.md</code> first — it says exactly when a change
              needs a pull request and when you can push straight to <code>main</code>.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
