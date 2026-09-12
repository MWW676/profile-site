# Devlog

A running log of decisions, mistakes, and learnings made while building this project.
Format: one entry per notable event — what happened, what was decided/fixed, why.
This is separate from `project_proposal.md` (the plan) — this is the journal of what actually happened.

---

## 2026-07-16 — Planning session

**Decision: standalone game section, unrelated to resume content**
Initial instinct was a resume-themed gesture game ("catch the skill icons"). Reconsidered: a personal profile site works better with genuinely separate sections carrying equal weight — resume, chat agent, play, gallery — rather than every feature trying to double as a resume delivery mechanism. Landed on a simple hand-tracked dodge/catch game (Flappy-Bird-style single-axis control), unrelated to career content, plus a public leaderboard.

**Decision: LLM provider — Gemini over Claude for the backend agent**
Original plan used the Claude API. Checked current pricing and confirmed Anthropic does not offer a sustained free API tier — only one-time trial credits (~$5). Since the whole project needs to run on free tiers, switched the "ask me" agent to Google's Gemini API, which has a genuinely sustained free tier (rate-limited, no card required). Groq noted as a backup option if inference speed matters more than model choice.
*Learning: always verify current pricing/tier terms before locking in a provider — assumptions from general familiarity with a product can be stale.*

**Decision: meme-of-the-day reuses existing infrastructure instead of adding new services**
Added as a stretch feature. Rather than standing up new infra, it reuses: Upstash Redis (already provisioned for the leaderboard) for daily caching, and Gemini (already provisioned for the agent) for generating the short explanation text. Sourced from a meme-aggregator API rather than hosting/curating images directly, to sidestep licensing overhead.

**Decision: no separate admin app**
Considered building a full admin panel for managing gallery photos, resume content, and game config. Scoped this down: static content (photos, resume text, game tuning) is treated as content-as-code — edited locally, deployed via the existing CI/CD pipeline, no UI needed. Only the leaderboard (real runtime user data in Redis) genuinely needs a live management surface, handled by one password-gated `/admin` route with two actions (delete entry, clear leaderboard) — not a full auth/roles system.
*Learning: before building an admin UI, ask whether the underlying data is actually mutable-at-runtime-by-necessity, or just content that happens to live in a database — the latter often doesn't need a UI at all.*

---

## 2026-07-18 — Day 1-2: scaffold, deploy, and a lot of environment archaeology

**What happened:**
Scaffolded the Next.js frontend and FastAPI backend, then deployed both to Google
Cloud Run with a fully automated GitHub Actions pipeline. Took most of a session,
and the bulk of the time went to environment compatibility issues rather than
application code — see `learning_log_day1-2.md` for the clean concept writeup;
this entry is specifically about what went wrong and why.

**What I decided / how I fixed it:**

*macOS Big Sur (11.7.10) vs. modern tooling, three separate times:*
- Homebrew's `node` install got stuck compiling `cmake`/`llvm` from source
  ("Tier 2" — no precompiled binary exists for this OS version). Switched to
  `nvm`, pinned to Node 18 (the last major version supporting macOS 10.15+).
- The Node 18/Next.js `@latest` combo then failed too, since current Next.js
  requires Node 20.9+. Pinned `create-next-app@14` instead — Next 14 only needs
  Node 18.17+.
- Docker Desktop's current release requires macOS 13+. Parked Docker entirely —
  turned out to be unnecessary anyway, since Google Cloud Build can containerize
  source code in the cloud without any local Docker install.
- GitHub CLI (`gh`) failed three different ways in a row (Homebrew source build,
  `.pkg` installer, even the raw precompiled binary — all compiled against newer
  macOS security APIs). Stopped trying variations on the same tool and switched
  to a Personal Access Token instead.

*A genuinely misleading compiler error:*
- `layout.tsx` failed with "Unexpected token `html`" pointing at line 22, across
  a cache clear *and* a full from-scratch rewrite of the file. Root cause turned
  out to be an unrelated missing `<a` tag six lines later (line 27) — a malformed
  tag earlier in the JSX tree confused the parser badly enough that it reported
  the error at the wrong location entirely.

*Google Cloud IAM, three sequential permission walls on a brand-new project:*
- `storage.objects.get` denied → granted `roles/storage.objectViewer`
- `artifactregistry.repositories.uploadArtifacts` denied → granted
  `roles/artifactregistry.writer`
- Cloud Run deploy then failed for an unrelated reason: our Dockerfile hardcoded
  `--port 8000`, but Cloud Run injects its own `PORT` and expects the container
  to listen on that. Fixed with `${PORT:-8080}` in the CMD (shell form required
  for env var substitution to work at all).

*CI/CD credentials:*
- Attempted a static service-account key for GitHub Actions; blocked by an org
  policy (`disableServiceAccountKeyCreation`) that a personal account can't
  override. Pivoted to Workload Identity Federation instead — more setup, but
  no standing credential ever exists, and it's the currently recommended
  pattern anyway, not just a workaround.
- First WIF provider creation failed too — Google now requires an explicit
  `--attribute-condition` restricting which repo is trusted, rather than
  trusting anything with a valid GitHub token.
- First `git push` of the workflow file itself was rejected — PATs need a
  separate `workflow` scope beyond `repo` to push files inside
  `.github/workflows/`.

**Result:** both services live on Cloud Run; `git push` now auto-lints and
auto-deploys both frontend and backend via GitHub Actions, authenticated with
zero stored secrets.

**Why / what I'd do differently:**
Nearly every wall today traced back to one root cause (an old macOS version)
hitting several unrelated tools independently — worth recognizing that pattern
faster next time a "weird" install error shows up on this machine: check the
tool's minimum OS version before assuming the error is something else. Also
worth remembering, next time a compiler error doesn't budge after a fix at the
reported location: check the surrounding structure, not just that exact line —
the reported location isn't always the actual fault.

Known gaps, deliberately deferred rather than solved: the CI service account
uses a broad `roles/editor` grant rather than the specific handful of roles it
actually needs (least-privilege scoping planned as a later pass, not urgent);
and the pipeline currently has a frontend lint step but no backend tests at all,
since there's no agent logic yet to test.

---

## 2026-07-24 — Day 5-6: RAG pipeline, from embeddings to a working chat agent

**What happened:**
Built the full retrieval-augmented generation pipeline: chunked and embedded
resume content into Chroma (Day 5), then wrote the retrieval function, system
prompt, chat logic, and a `/api/chat` FastAPI endpoint that ties them together
with Gemini as the answering model (Day 6). Ended with a working, boundary-tested
chat agent — confirmed to answer resume questions correctly and to decline
off-topic ones per its system prompt.

**What I decided / how I fixed it:**

*Content structure, corrected mid-session:*
- Chunk IDs should describe *purpose* (`internship_experience`), not just
  *contents* (`dyson_panasonic`) — caught and renamed.
- A genuine content error was caught: the TikTok Spot Bonus had been
  miscategorized under `education` instead of `awards`. Fixed by splitting
  academic facts and recognition into separate chunks — a deliberate choice,
  not just a bug fix, since the two are different question types.

*Two separate model-availability failures, same underlying lesson:*
- `models/text-embedding-004` — deprecated by Google since these instructions
  were written; fixed by switching to `models/gemini-embedding-001`.
- `models/gemini-2.0-flash` — listed as an available model via `list_models()`,
  but had zero free-tier quota specifically for that version. Learned that
  "permitted to call" and "has non-zero free quota" are separate gates; fixed
  by switching to the `-latest` alias (`gemini-flash-latest`) instead of a
  pinned version, since Google maintains these aliases to track whichever
  model currently sits in the free tier — more durable against future
  quota reshuffling than a hardcoded version number.

*Gemini billing, a real tangle worth naming honestly:*
- Discovered Google Cloud Billing (the GCP trial) and Gemini API/AI Studio
  billing are entirely separate systems — the GCP trial credit does not fund
  Gemini API calls at all.
- Hit a "prepayment credits are depleted" error on a fresh key; verified via
  current forum reports that this is a known, currently-open Google-side
  billing-sync bug specific to projects with an active GCP trial attached —
  not something caused locally, and not reliably fixed by enabling billing.
  Resolved by switching to a different, older API key/project with no GCP
  trial attached.
- **Net result: the resume agent's Gemini calls now run under a different
  Google project than the Cloud Run infrastructure.** Deliberately left as-is
  for now — functional and free, just not tidy — flagged for a possible later
  cleanup (e.g. consolidating onto Vertex AI) rather than solved today.

*Architecture decision made explicit, not just implemented:*
- Named the distinction between what was built (a fixed pipeline — retrieval
  runs unconditionally, hardcoded) and a true "agent" (LLM decides whether/
  which tool to call, via function calling). Today's build is the former,
  correctly and deliberately — autonomous tool-calling is planned for a later
  day, not an oversight.

*Error handling added:*
- Endpoint now catches `ResourceExhausted` specifically (honest "try again"
  message for rate limits) and generic `Exception` as a fallback (vague,
  safe message — avoids leaking internals), logging the real error
  server-side either way rather than surfacing raw tracebacks to visitors.

**Known gap, deliberately deferred:**
Chroma's `PersistentClient` writes to local disk, which will not survive Cloud
Run's stateless container lifecycle (fresh filesystem on every restart/scale
event). Works fine locally; not yet fixed for deployment. Flagged now so it's
addressed as a planned step, not a surprise later.

**Why / what I'd do differently:**
Two separate "the model name I was given turned out to be stale" incidents in
one session is a real pattern worth remembering going forward: AI provider
APIs move fast enough that even confident-sounding instructions (mine
included) can be wrong by the time they're acted on — verifying against the
provider's current live behavior (a `list_models()` call, or a fresh search)
before trusting a hardcoded model name is now a standing habit, not a one-off
fix. Also worth remembering: distinguish "agent" from "fixed pipeline"
precisely rather than loosely — it changed how the next few days' scope
should be talked about and planned.

## 2026-07-22 — Day 5-6: RAG pipeline, three separate Google-side surprises, and a working chat endpoint

**What happened:**
Built the full retrieval-augmented generation pipeline: chunked resume content,
embedded and stored it in Chroma, wrote a system prompt, and wired retrieval +
generation together behind a real `/api/chat` FastAPI endpoint. Ended the
session with a working, grounded answer to a real question and a correctly
enforced off-topic refusal. Most of the friction today was Google's Gemini
API/billing landscape shifting under us mid-session, not application logic.

**What I decided / how I fixed it:**

*Deprecated embedding model:*
- `models/text-embedding-004` (the model name first used) turned out to
  already be deprecated by Google. Switched to `models/gemini-embedding-001`.
  A follow-up edit then introduced a typo (`text-embedding-001`, a name
  neither of us intended) — fixed by rewriting the line via `sed` directly in
  the terminal rather than trusting another manual editor edit.

*Two separate Google billing systems, tangled together:*
- Google Cloud Billing (the GCP trial credit funding Cloud Run) and Gemini
  API/AI Studio billing are entirely independent ledgers. An error reading
  "prepayment credits are depleted" turned out to be a known, currently-
  reported bug specific to Gemini API keys tied to a project that also has an
  active GCP trial. Fixed by switching to a plain "Free tier" API key with no
  GCP trial attached (a different, older personal project). Net effect: the
  Gemini calls for this project now run under a different Google project than
  the Cloud Run services — a bit tangled, flagged as something to potentially
  clean up later, not urgent.

*Per-model free-tier quota, independent of account-level status:*
- Even the working key hit a second, different error: `gemini-2.0-flash`
  specifically had a free-tier quota of 0, despite `list_models()` confirming
  the key had permission to call it. Switched to `models/gemini-flash-latest`
  — an alias Google keeps pointed at whichever model currently sits in the
  free tier, more durable than pinning an exact version.

*Missing error handling, surfaced by the quota error itself:*
- The quota exception initially surfaced to `curl` as a generic
  "500 Internal Server Error" with no useful detail, because `/api/chat` had
  no exception handling at all. Added a `try/except` in the endpoint:
  catching `ResourceExhausted` specifically for a clear "try again" message,
  and a broader `except Exception` as a safety net with a generic message —
  both logged in full server-side, neither ever shown raw to a visitor.

**Result:** working end-to-end RAG chat, verified against both a real resume
question (correctly grounded, cited real tools/projects) and an off-topic
question (correctly declined and redirected).

**Why / what I'd do differently:**
Three of today's four blockers were Google's Gemini ecosystem changing
underneath fixed instructions (deprecated model, billing-tier bug, zeroed
per-model quota) — a good reminder that "AI moves fast" is true of the
tooling and APIs themselves, not just model capabilities. Worth defaulting to
checking `list_models()` or current docs directly rather than trusting a
specific model name on faith, even from a source that sounds confident.

Also a good, concrete lesson on system design: the missing error handling
wasn't caught by writing the happy path carefully — it was caught by an
actual failure occurring naturally during testing. Worth remembering that
error-handling gaps are often invisible until something real breaks, which is
itself a decent argument for testing failure paths deliberately rather than
only ever testing the case expected to succeed.

## 2026-07-25 — Day 7: token logging, a dead SDK, and a chase worth stopping

**What happened:**
Added per-request token usage logging and a context-size safety cap to the
chat pipeline — straightforward, and confirmed working immediately. The rest
of the day went into two connected rabbit holes: discovering the SDK
underpinning the whole RAG pipeline was already deprecated, and an extended,
ultimately unsuccessful attempt to disable Gemini's "thinking" tokens to
save cost.

**What I decided / how I fixed it:**

*A genuinely dead dependency, not just an old one:*
- Investigating a `ThinkingConfig` `AttributeError` led to discovering
  `google-generativeai` — the package used since Day 5 — was deprecated by
  Google and reached full end-of-life on August 31, 2025. Migrated the whole
  backend (`ingest.py`, `retrieve.py`, `chat.py`, and `main.py`'s error
  handling around it) to the current `google-genai` SDK, which uses a
  different client pattern throughout. Re-ran ingestion from scratch under
  the new SDK to confirm the migration was clean end-to-end.

*A self-inflicted bug during that migration:*
- The migrated app crashed with `KeyError: 'GEMINI_API_KEY'` despite the key
  being present in `.env`. Root cause: `retrieve.py` read the environment
  variable at import time, but relied on `chat.py` calling `load_dotenv()`
  first — and Python's top-to-bottom import order meant `retrieve.py`'s
  import actually ran *before* `chat.py` reached that line. Fixed by having
  `retrieve.py` call `load_dotenv()` itself, rather than depending on import
  order for correctness.

*The thinking-disable chase, in full:*
- `thinking_budget=0` on `gemini-flash-latest` → `400 INVALID_ARGUMENT`
  (field not supported by this model generation)
- `thinking_level="low"` (the Gemini-3-appropriate alternative) →
  Pydantic validation error — the installed SDK version's `ThinkingConfig`
  schema doesn't define that field at all yet
- Switched to an explicit, older, documented-compatible model
  (`gemini-2.5-flash`) → `404`, no longer available to new users
- Wrote a probe script to test six more candidate models in one batch rather
  than continuing to guess one at a time → four failed on `429` quota
  exhaustion, one on `404` deprecation, one on the same `400` invalid-argument
  as before
- **Decision: stopped.** No model currently available to this API key
  supports disabling thinking. Reverted to `gemini-flash-latest` with no
  thinking config — the one configuration confirmed to work cleanly all
  session — and removed the probe script.

**Result:** token logging and context capping both working and confirmed;
thinking-disable investigated thoroughly and conclusively ruled out for now,
rather than left as a vague unresolved attempt.

**Why / what I'd do differently:**
The dead-SDK discovery is the more important finding of the two — worth
remembering to check a dependency's maintenance status occasionally, not
just pin a version once and assume it stays current. The thinking-token
chase is a good example of a different lesson: recognizing when to stop
optimizing is itself a real decision, not a failure. A few hundred tokens
per request, on a project making occasional test calls, was never going to
justify the time spent chasing it across seven models — worth noticing that
threshold earlier next time, rather than after exhausting the list.

## 2026-07-28 — Day 8: eval harness, a self-inflicted false failure, and first Langfuse trace

**What happened:**
Built a fixed eval set and harness for the resume agent, wired up Langfuse
tracing, and generated the first real trace in its dashboard. Along the way,
caught a real bug in the eval logic itself (not the agent), and a second
round of environment drift similar to the SDK-migration issue from Day 7.

**What I decided / how I fixed it:**

*Eval set logic bug, caught by an actual failing test:*
- The "where did she study" eval case used `must_contain: ["Nanyang",
  "NTU"]`, intending "either name counts" but written as AND logic (both
  required) rather than OR. The agent's answer was correct
  ("Nanyang Technological University") but failed the check anyway. Added
  an explicit `any_of` check type to the harness rather than just fixing
  this one case by hand, so the same "any of these counts" pattern is
  reusable for future cases.

*Local environment drift, again:*
- Installing `langfuse` surfaced a pip dependency-conflict warning
  (`protobuf` version mismatch) traced back to `google-ai-generativelanguage`
  — a leftover dependency from the `google-generativeai` package removed
  during the Day 7 SDK migration, but never actually uninstalled from the
  local `.venv`. Same underlying pattern as the deployment failure two
  sessions ago (drifted local environment silently differing from a fresh
  install). This time, rebuilt the `.venv` from scratch rather than patching
  around the warning, and verified via `pip list` that the old dependency
  was genuinely gone before moving on.

*Langfuse setup, using the current (v4) SDK confirmed via search first:*
- Checked current docs before writing any integration code this time,
  given how many stale-library issues came up on Day 5-7 — correctly found
  Langfuse had been rewritten into a new major version as recently as
  March 2026. Used the confirmed-current `@observe()` decorator pattern and
  environment variable names; got a real trace into the dashboard on the
  first attempt, no dead ends this time.

**Result:** eval harness at 6/6 after the fix; Langfuse dashboard showing a
real trace for `answer_question`, including latency and I/O — though not
token counts or cost, since the plain decorator creates a generic `SPAN`
rather than a `GENERATION` observation.

**Why / what I'd do differently:**
The eval bug is a good, concrete example of the Day 6-7 discipline paying
off directly: rather than assuming the agent was wrong when a test failed,
checking which layer actually failed (the test's logic, in this case) found
the real problem in under a minute. The venv-drift repeat is worth
internalizing as a pattern rather than a one-off: any time a dependency gets
removed from `requirements.txt`, the local `.venv` should be treated as
still potentially carrying it until proven otherwise — checking before
trusting is now the default assumption, not the exception. Checking current
docs *before* writing integration code (rather than after hitting an error)
finally paid off this time with a clean first attempt — worth continuing
deliberately rather than reverting to assuming a library's remembered API
surface is still accurate.

## 2026-07-30 — Day 9: agent tool-calling, the missing frontend page, and a genuinely tricky gcloud syntax bug

**What happened:**
Upgraded the resume agent from a fixed retrieve-then-generate pipeline to
real tool-calling (three tools: resume search, project details, a fun
fact), configured CORS, restructured the backend into routers, and built
the actual "Ask me" frontend page end to end — including session
persistence, a scroll-to-bottom fix, and a "new conversation" control. Also
caught and fixed a real gap in the original 15-day plan (no day had ever
been assigned to building the Ask-me frontend itself) by folding it into
Day 9 alongside the deeper agentic work.

**What I decided / how I fixed it:**

*Tool-calling, confirmed against current docs first:*
- Verified the `generate_content(tools=[python_functions])` automatic
  function-calling pattern was still current for `google-genai` before
  writing any code, given how many stale-API issues this project hit on
  Days 5-8. Paid off — worked cleanly on the first real test.

*Backend restructure:*
- Split `main.py` into `app/routers/health.py` and `app/routers/chat.py`,
  moved the CORS origin list out of hardcoded source into an environment
  variable (`CORS_ORIGINS`), and deduplicated a repeated `MAX_CONTEXT_CHARS`
  constant into a shared `app/config.py`.

*A genuine React race condition in session persistence:*
- Two `useEffect` hooks (load-from-storage, save-to-storage) both ran
  within the same initial render pass; the save effect saw stale (empty)
  state and immediately overwrote the just-loaded conversation before it
  ever rendered. Fixed with a `useRef` guard skipping the save effect's
  very first run. Caught specifically by testing in local dev, where React
  Strict Mode's effect double-invocation made the bug reliably reproducible
  — worth remembering that dev-mode behavior isn't always "extra" noise,
  sometimes it's surfacing a real bug production would have hidden.

*Storage type reconsidered mid-build:*
- Initially used `localStorage`; user's actual expectation ("clears when I
  start a fresh visit, persists during one") matched `sessionStorage`
  semantics much more closely once discussed precisely. Switched.

*Production build caught what dev mode didn't:*
- `next build` failed on unescaped quote/apostrophe characters in JSX text
  — a lint rule dev mode never enforces. Good concrete confirmation that
  testing against the actual production build matters, not just `next dev`.

*A multi-attempt gcloud syntax bug:*
- `--set-env-vars` with a `CORS_ORIGINS` value containing a comma (two
  URLs) kept failing across several attempts (splitting the flag onto two
  lines, fixing a missing backslash, shell-quoting the combined string) —
  none of which addressed the actual cause, since gcloud does its own
  internal comma-splitting on the flag's value *after* the shell has
  already handed it the full string. Diagnosed by reading exactly which
  fragment the error isolated (a lone URL, no `=` sign) as a signal of
  where parsing broke, rather than treating the whole flag as uniformly
  malformed. Fixed with gcloud's `^CHAR^` custom-delimiter syntax.

**Result:** live site's `/ask-me` page confirmed working end-to-end against
the real deployed backend, including tool-calling, session persistence, and
the clear-conversation button. **Open item, not yet completed:** the eval
harness re-run against the new tool-calling behavior was blocked by a
free-tier rate limit from earlier testing in this same session; deferred
to later today rather than forced through.

**Why / what I'd do differently:**
The gcloud bug is the standout lesson of the day — three earlier fix
attempts each addressed a plausible-sounding but wrong layer (shell
splitting) before the actual layer (gcloud's own internal parsing) was
identified, by reading the error's precise wording rather than pattern-
matching to "probably a quoting issue." Worth generalizing: when a
plausible fix doesn't work, that's a signal to re-read the error more
carefully for what it's specifically pointing at, rather than trying a
nearby variation of the same fix.

---

## YYYY-MM-DD — <short title>

**What happened:**

## 2026-08-02 — Day 10-11: hand-tracking, a game redesign mid-flight, and knowing where software's limits are

**What happened:**
Built the standalone MediaPipe hand-tracking demo (Day 10), then evolved it
significantly further than originally scoped: a gesture-selection
comparison, a cosmic visual overhaul, and — the bulk of the actual work — a
full card-flip game (Day 11) that got redesigned twice mid-build in
response to real playtesting feedback, landing on a Minesweeper-inspired
deduction mechanic considerably better than the original concept.

**What I decided / how I fixed it:**

*A retracted diagnosis, worth recording honestly:*
- Proposed a specific root cause (a React Strict Mode race condition) for a
  camera-staying-on report, and shipped a defensive fix for it — but the
  original behavior turned out to already be correct; the "bug" didn't
  exist. Flagged directly rather than left implicit, since presenting an
  unverified theory as settled fact was a real process mistake worth
  learning from, not just a footnote.

*Gesture selection, chosen by actual comparison, not assumption:*
- Built a side-by-side test page comparing pinch, poke, and fist-clench as
  candidate "select" gestures before committing to one. Pinch won on
  precision, but even it felt unresponsive as a *double*-tap — the real fix
  was recognizing double-tap was the wrong interaction shape for this task
  entirely (borrowed from desktop/touch conventions with no reason to
  transfer), not further threshold tuning. Landed on hover-dwell instead
  as the primary mechanic, which tested as meaningfully more responsive.

*A significant, two-stage game redesign, driven by real playtesting:*
- The first working version (find K bingo cards among a grid, no
  information on wrong flips) was provably a guaranteed win via exhaustive
  scanning — boring, not because of missing polish, but because of a
  structural flaw: zero cost or information on a wrong flip. Considered
  several fixes (hazard cards, timers, hard flip limits) before landing on
  the actual right one: Minesweeper-style adjacency numbers, which fix the
  root cause (no information) rather than patching around the symptom
  (no risk). Added flood-fill cascade reveals and a min/max-bounded
  efficiency score as natural extensions of the same mechanic.

*Two-hand support and identity tracking:*
- Fixed a hand-tracking flicker (assumed at first to need bigger rendering)
  by tracking both hands and using MediaPipe's own handedness label for
  per-hand identity across frames, rather than array index, which isn't
  stable frame to frame.

*Layout bugs, both diagnosed correctly on the first real attempt:*
- Canvas text rendered mirrored due to the outer CSS flip applied for
  selfie-view — fixed with a small reusable counter-transform helper,
  reused once the same issue reappeared in a second location.
- The game board appeared off-center because `mx-auto` silently fails to
  center an element wider than its constrained parent — fixed with the
  standard viewport-breakout CSS pattern rather than trial-and-error
  margin adjustments.

*A real hardware limit, correctly identified through direct measurement:*
- Persistent tracking instability at one edge of the play area was
  investigated with actual on-screen coordinate debugging rather than
  continued guessing — revealed two distinct physical causes (self-
  occlusion for one hand, genuine camera field-of-view edge degradation for
  the other), neither fixable in software. Stopped iterating once this was
  confirmed with evidence, rather than continuing to adjust config values
  against a problem no config value could solve.

**Result:** a genuinely more interesting, replayable game than originally
planned, two-hand tracking with stable per-hand identity, and an honest,
evidence-based understanding of where the current hand-tracking setup's
real limits are.

**Why / what I'd do differently:**
The retracted camera-bug diagnosis is worth sitting with directly: proposing
a plausible, confident-sounding theory and shipping a fix for it, without
first confirming the bug was real, cost a round trip and (mildly) obscured
what was actually true. The later camera field-of-view diagnosis did this
correctly — instrumented first, concluded second — and is the model worth
repeating: when a root cause isn't already obvious, get real evidence
before proposing (or trusting) a specific explanation, rather than
pattern-matching to the most recent similar-sounding lesson.

---

## 2026-08-05 — Day 12: Redis leaderboard, a mid-session reliability check-in, and a real fix that followed from it

**What happened:**
Picked the project back up after a gap, audited the actual repo against the
15-day plan (found the eval harness re-run from Day 9 was still unconfirmed,
and a stray Three.js page had been added independently outside the tracked
scope), then built the Redis leaderboard end to end: submission with
anti-cheat, fetch, a name-availability check, retry/exception handling, and
a short-TTL read cache with explicit write-time invalidation.

**What I decided / how I fixed it:**

*Real bugs, each diagnosed from actual evidence rather than guessed at:*
- The leaderboard modal appeared to never update, across several plays.
  Root cause, found only after fixing a silently-swallowed fetch error
  (the same failure-hiding pattern flagged as a gap back on Day 9's error
  handling): the local backend simply wasn't running —
  `ERR_CONNECTION_REFUSED`, not a code bug at all. Surfacing real errors
  instead of swallowing them turned a confusing "it's just broken" into an
  immediately obvious, one-line fix.
- The hand-tracking dwell/selection logic kept running even while the
  leaderboard modal was open, since the modal's state lived in React state
  the long-running animation loop's closure had already captured a stale
  copy of. Fixed with a ref kept in sync via its own small effect — the
  same closure-staleness class of bug as several earlier fixes this
  project, just in a new location.

*A genuine mid-session reliability dip, addressed directly rather than
brushed past:*
- Made two real mistakes in close succession: labeled a curl test as
  proving one thing when the actual numbers given didn't exercise that
  code path, and did work in tool calls without actually including the
  runnable result in the message sent back. Asked directly about it,
  answered honestly (long-context detail-tracking pressure, not "the model
  getting worse") rather than deflecting, and changed process going
  forward: precise file edits now get applied programmatically against the
  actual current file content (exact-match assertions, structural balance
  checks) before being presented, rather than reconstructed from memory of
  a long thread and trusted on faith.

*Design decisions made with reasoning shown, not just asserted:*
- Chose to leave Upstash's eviction feature off — appropriate for a genuine
  cache workload willing to lose old entries, wrong for a leaderboard where
  every entry is a real score worth keeping; confirmed current free-tier
  terms (256MB/500K commands/month, a real ongoing tier) before relying on
  them.
- Chose an *informational* name-availability hint over a hard "name taken"
  block, since the system has no real authentication and can't actually
  enforce exclusive ownership either way — a hard block would be friction
  that looks like security without providing it.
- Investigated whether "same session, skip the redundant check" was safe;
  concluded no, since the backend has no real session concept and an
  in-memory shortcut would reintroduce the exact multi-instance
  inconsistency already learned from Chroma on Day 5.
- Surveyed the general toolkit for reducing database call redundancy
  (debounce, TTL caching, atomic conditional writes, Lua scripts,
  pipelining, write-behind) before picking the one genuinely warranted
  here (a short-TTL cache with write-time invalidation), rather than
  reaching for the most sophisticated option by default.

**Result:** a fully working leaderboard — submission, anti-cheat, fetch,
name-availability hint, retry/exception handling, and redundancy reduction
— confirmed end to end in the live game, plus a concrete process
improvement adopted mid-session rather than just noted for later.

**Why / what I'd do differently:**
The most valuable thing about today wasn't any single bug fix — it was
being asked directly about a real, noticed dip in reliability, and having
an honest, specific answer available rather than either denying it or
over-apologizing. The two actual mistakes were different in kind (a
verification gap, and a communication gap), which matters: it means the
fix is concrete and checkable (verify test claims before presenting them;
verify a file was actually included in the response, not just built in a
tool call) rather than a vague resolution to "be more careful." Worth
continuing to apply the self-verification habit adopted today to future
large or precise edits by default, not just when directly asked to.

---