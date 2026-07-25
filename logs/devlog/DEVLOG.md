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

---

<!-- New entries go above this line. Suggested template:

## YYYY-MM-DD — <short title>

**What happened:**

**What I decided / how I fixed it:**

**Why / what I'd do differently:**

-->