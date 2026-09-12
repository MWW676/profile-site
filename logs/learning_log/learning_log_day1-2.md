# Learning log — Day 1-2

A clean, sequential review of every concept introduced today, separate from the
blow-by-blow debugging. Read this top to bottom as the "what did I actually learn" version.

---

## 1. React — the component model

**What it is:** a JavaScript library for building UIs out of small, reusable pieces
called *components*, each with its own local *state* (data that can change).

**Core idea:** when a component's state changes, React automatically re-renders
just that piece of the page — you never manually find and update HTML elements yourself.

**Where we used it:** every `.tsx` file in `frontend/app/` is a component.
`layout.tsx` is the shared shell (nav); `page.tsx` is the home page content.

---

## 2. Next.js — the framework built on React

**What it is:** React alone gives you components; Next.js adds routing (which URL
shows which page), a dev server, and the production build process.

**Key commands:**
```
npx create-next-app@14 frontend   # scaffold a new project (pinned to v14, see §7)
npm run dev                        # start local dev server at localhost:3000
```

**Version note:** Next.js 15+ requires Node 20.9+; we're on Next.js 14, which only
needs Node 18.17+ — this pin was a direct consequence of the Node/macOS constraint in §7.

---

## 3. Tailwind CSS

**What it is:** a styling approach where you apply CSS via class names directly in
your markup (`className="text-2xl font-medium"`) instead of writing separate stylesheet files.

**Why it's common in industry:** faster iteration, no inventing class names, styles
stay colocated with the component that uses them.

---

## 4. FastAPI — the backend framework

**What it is:** a Python framework for defining HTTP endpoints — URLs the frontend
can call to get or send data (`/health`, later `/api/chat`, `/api/score`).

**Why the backend has to exist separately from the frontend:** secrets (API keys),
heavy computation, and database access need to live somewhere the browser can't see
or tamper with. That "somewhere" is the backend server.

**Key commands:**
```
pip install -r requirements.txt
uvicorn app.main:app --reload      # run locally at localhost:8000
```

---

## 5. Client-server request flow (why we deploy *two* separate services)

Two distinct round trips, at two different times:

1. **Page load (once):** browser → frontend service → gets back HTML + JS bundle.
   This is what the frontend deployment is *for* — without it, there's no page for
   anyone to visit, and no JS ever gets downloaded to run.
2. **Interaction (whenever the user does something):** the JS that arrived in step 1
   is now running *inside the browser*, and it's that browser code that calls the
   backend URL directly and gets back JSON.

**Practical implication:** only the frontend URL is ever shared publicly (it's "the site").
The backend URL is an API — reachable, but not meant to be browsed directly.

**Coming later, not yet configured:** because frontend and backend live on two
different domains, browsers block cross-domain requests by default (CORS) unless the
backend explicitly allows the frontend's URL.

---

## 6. Docker — containerization (built, but not run locally — see §7)

**The problem it solves:** "works on my machine" happens when your exact Python
version + dependencies + OS libraries aren't reproducible elsewhere.

**What a Dockerfile is:** a recipe that builds an identical, isolated environment
every time, regardless of where it's built.

**Line-by-line, from `backend/Dockerfile`:**
| Line | Purpose |
|---|---|
| `FROM python:3.12-slim` | start from a minimal pre-built Python image |
| `WORKDIR /app` | set the working directory *inside* the container |
| `COPY requirements.txt .` + `RUN pip install ...` | install dependencies **before** copying app code, so Docker can cache this step and skip re-installing when only code changes |
| `COPY app ./app` | copy the actual application code in |
| `EXPOSE 8080` | documents which port the container listens on |
| `CMD [...]` | the command that runs when the container **starts** |

---

## 7. The macOS version wall (the day's recurring theme)

**Root cause, discovered repeatedly:** the laptop is on macOS Big Sur (11.7.10),
released 2020. Most current dev tooling (Node 20+, Docker Desktop, Homebrew's
"Tier 2" source builds, GitHub CLI's `.pkg` and even its raw binary) now requires
macOS 12 or 13+.

**Pattern learned — three ways to route around an OS-version wall, in order of preference:**
1. **Pin an older tool version** that still supports your OS (Node 18 via `nvm`,
   Next.js 14 instead of `@latest`) — the cleanest fix when available.
2. **Skip the package manager, use a precompiled binary/installer directly** —
   bypasses Homebrew's from-source builds (worked for Node, once pinned to v18).
3. **If even the binary was compiled against newer OS APIs, stop and switch
   approach entirely** rather than trying a fourth workaround for the same wall
   (this is what happened with `gh` — pivoted to a Personal Access Token instead).

**Concrete resolutions today:**
- Node → installed via `nvm`, pinned to v18 (not `--lts`, which grabs a too-new version)
- Next.js → pinned to `@14` via `create-next-app@14`
- Docker Desktop → **parked entirely**; not needed because Google Cloud Build can
  containerize source code in the cloud without a local Docker install
- GitHub CLI (`gh`) → **abandoned**; used a Personal Access Token instead

---

## 8. Google Cloud Run + Cloud Build

**What Cloud Run is:** a service that runs containers and only charges for actual
usage (scales to zero when idle) — this is why it suits a free-tier personal project.

**How we deployed without Docker installed locally:**
```
gcloud run deploy <service-name> --source . --region us-central1 --allow-unauthenticated
```
`--source .` uploads your code to Google, which builds the container *in the cloud*
via Cloud Build — either using buildpacks (auto-detects language from files like
`package.json`) or, if present, an actual `Dockerfile` in the folder (this is what
happened for `backend/`, since we had one; the buildpack path is what ran for
`frontend/`, since it has no Dockerfile).

**One real config bug hit and fixed:** Cloud Run injects a `PORT` environment
variable and expects the container to listen on it — our Dockerfile had a hardcoded
`--port 8000`. Fixed by using `${PORT:-8080}` in the `CMD`, which requires the
shell form of `CMD` (`sh -c "..."`) rather than the JSON-array form, since env var
substitution needs a shell to evaluate it.

---

## 9. IAM & service accounts (Google Cloud's permission system)

**Core idea:** every actor in Google Cloud — including automated processes like
Cloud Build — is an *identity* that needs to be explicitly granted permission
(a "role") to do specific things. Nothing is trusted by default.

**Roles granted today, and why each was needed:**
| Role | Needed for |
|---|---|
| `roles/storage.objectViewer` | reading uploaded source code during build |
| `roles/artifactregistry.writer` | pushing the built container image |
| `roles/editor` (on the CI service account specifically) | broad grant for GitHub Actions — a deliberate simplification, see devlog |

**Pattern learned:** on a brand-new project, expect to hit a *sequence* of
"permission denied" errors, each naming the exact missing role — grant it, retry,
repeat. This is normal, not a sign something is broken.

---

## 10. Git + GitHub authentication

**What changed industry-wide (not new today, but relevant):** GitHub removed
plain password authentication for git operations in 2021. Logging into the website
via Google/SSO doesn't substitute — git needs its own credential.

**Options, in order attempted today:**
1. `gh` CLI's browser-based login → blocked by the macOS version wall (§7)
2. **Personal Access Token (PAT)** → what we ended up using: a token generated on
   GitHub's website, pasted in place of a password when git prompts for one.
   Needed the **`repo`** scope for normal pushes, plus **`workflow`** scope
   specifically to push changes inside `.github/workflows/`.

---

## 11. CI/CD — GitHub Actions

**What "CI/CD" means:** Continuous Integration / Continuous Deployment — automatically
testing and deploying code on every push, instead of doing it by hand each time.

**Where the pipeline definition lives:** `.github/workflows/deploy.yml`, written in
YAML, committed *in the repo itself* — this is "config as code": the deployment
process is version-controlled and identical for anyone who clones the repo, not
hidden in a dashboard's settings.

**How a `git push` actually triggers a cloud deploy:** nothing runs on your laptop.
GitHub's own servers detect the push, spin up a temporary VM, check out your code
onto it, and run each step in the YAML file there — including the `gcloud run deploy`
commands. Your laptop's only job was pushing the code.

**Structure of the workflow file:**
- `on:` → what triggers it (a push to `main`)
- `jobs:` → the sequence of steps that run

**What "lint" means:** static analysis — scanning code for style issues and obvious
bugs *without running it*. Cheap and fast (seconds) compared to catching the same
issue after a full deploy.

---

## 12. Workload Identity Federation (WIF)

**The problem it solves:** the naive way to let GitHub Actions deploy to Google
Cloud is to create a long-lived key file and store it as a GitHub secret. That key
is a standing liability if it ever leaks. Our project's org policy actually
*blocked* key creation outright, which forced the better solution.

**How WIF works instead:** Google Cloud is configured to directly trust identity
tokens that GitHub itself issues. When the workflow runs, GitHub proves "this is
really a run of `fang407/profile-site`," and Google exchanges that proof for a
short-lived credential on the spot. No password or key file exists at any point,
stored or otherwise.

**Pieces set up:**
1. A **Workload Identity Pool** — a container for trusted external identities
2. A **Provider** inside it — configured to trust GitHub's token issuer specifically,
   restricted via `--attribute-condition` to only this one repo
3. A **service account** (`github-deployer`) that the pool is allowed to impersonate
4. Three GitHub repo secrets (`GCP_PROJECT_ID`, `WIF_PROVIDER`, `WIF_SERVICE_ACCOUNT`)
   referencing the above — none of them are credentials themselves, just identifiers

**Industry note:** this is the currently recommended pattern for CI-to-cloud auth
generally, not a workaround specific to our situation — worth knowing that the
"harder" path here was actually the better-practice one.

---

## Sequence, end to end (how it all connects)

```
git push
   │
   ▼
GitHub detects the push → spins up a runner
   │
   ▼
Runner checks out code, installs deps, runs lint
   │
   ▼
Runner authenticates to Google Cloud via WIF (no stored key)
   │
   ▼
Runner runs `gcloud run deploy` for backend and frontend
   │
   ▼
Google Cloud Build containerizes each (Dockerfile for backend,
buildpack auto-detection for frontend) and deploys to Cloud Run
   │
   ▼
Two live public URLs — frontend is "the site," backend is the API
it calls from the visitor's own browser
```

---

# Learning log — Day 3

## 13. File-based routing (Next.js App Router)

**Core idea:** the folder structure under `app/` directly becomes the URL structure —
there's no separate routing config to maintain. Creating `app/resume/page.tsx`
automatically makes `/resume` a real route.

**What each special filename means:**
| File | Role |
|---|---|
| `page.tsx` | the actual content shown at that route |
| `layout.tsx` | a wrapping shell — can exist at the root (applies everywhere) or inside any route folder (applies to just that section and its children) |

We're only using the root `layout.tsx` so far (the shared nav), but any section
could get its own nested `layout.tsx` later if it needed distinct chrome the
others don't.

## 14. Component composition (small reusable pieces inside one page)

`page.tsx` isn't one big blob of markup — it defines small local components
(`SectionTitle`, `Check`) and reuses them repeatedly. This is the same "component"
idea from Day 1's counter demo, just applied at a smaller scale: instead of
writing `<h2 className="...">Skills</h2>` and `<h2 className="...">Experience</h2>`
separately, `<SectionTitle>Skills</SectionTitle>` guarantees every section heading
looks identical and only needs updating in one place.

**Data-driven rendering:** the resume content itself lives in plain JS arrays/objects
(`SKILLS`, `EXPERIENCE`) at the top of the file, and the JSX below just `.map()`s
over them. This separates *content* from *layout* — editing a bullet point means
editing data, not markup.

## 15. Design tokens — the payoff of naming colors instead of hardcoding them

**What we did:** rather than writing `bg-[#EDF0EA]` directly in the page, we defined
named tokens (`canvas`, `ink`, `sage`, `mint`, `mint-soft`, `hairline`) once in
`tailwind.config.js`, and every component references the *names*.

**Why it mattered today, concretely:** switching the entire site's theme from warm
charcoal to soft sage took editing exactly one file (`tailwind.config.js`) — zero
changes to `layout.tsx` or `resume/page.tsx`, because they never referenced a raw
color, only a token name. This is the general principle behind design systems in
real products: indirection now (name it once) saves rework later (swap the
definition, not every usage).

## Recurring bug pattern, now confirmed twice

Both "Unexpected token" build errors (Day 1 and Day 3) trace to an identical
failure: a copy-pasted JSX block silently lost its opening `<a` tag, and the
compiler reported the error several lines away from the actual problem. Worth
trusting this pattern going forward: if a build error mentions `Unexpected
token` on a line that looks completely normal, check nearby `href=`/attribute
lines for a tag missing its name — `grep -n 'href='` is a fast way to scan for
it before even opening the browser.

---

# Learning log — Day 5

## 16. Embeddings & vector space intuition

**Core idea:** an embedding turns text into a list of numbers — a point in
space — positioned so that text with *similar meaning* ends up nearby, even if
the wording shares no words at all ("debugged a flaky test" and "the CI
pipeline caught a bug" land close together despite minimal word overlap).

**Why this matters for RAG:** a user's question gets embedded into a point in
this same space, and the system finds whichever stored chunks are *nearest* —
retrieval by meaning, not keyword matching.

## 17. Prompt engineering basics

A good system prompt generally has three parts:
- **Role** — who/what the model is acting as ("you're answering questions
  about Fang's resume")
- **Boundaries** — what to do when a question falls outside scope (politely
  decline and redirect, rather than answering anyway or refusing rudely)
- **Format guidance** — length/tone defaults ("2-4 sentences unless asked for
  more detail")

## 18. Chunking strategy and content organization

**Goal:** group content by *topic coherence*, so a single retrieved chunk
answers one kind of question well rather than being a grab-bag of loosely
related facts.

**Naming discipline for chunk IDs:** name each chunk after its *purpose*
(what kind of question it answers), not just its literal contents — e.g.
`internship_experience` rather than `dyson_panasonic`. The ID is never shown
to a user, but a purpose-driven name makes the content file maintainable later.

**A genuine judgment call worth remembering:** overlapping categories (e.g.
scholarships could reasonably live under "education" or "awards") are best
resolved by asking which *kind of question* each item answers — splitting
pure academic facts from recognition/awards kept both more retrievable.

## 19. Chroma as an embedded vector database

Chroma isn't a server your app calls over a network — for a project this
size, it's a library that runs *inside* your own Python process and writes to
a local folder (`chroma_db/`), conceptually similar to SQLite. It never talks
to Gemini directly; your own code is the middleman both ways.

## 20. How Chroma, Gemini, and your code fit together

```
Ingest:  your code → Gemini (embed each chunk) → Chroma (store vector + text)
Query:   your code → Gemini (embed the question) → Chroma (find nearest vectors)
         → Chroma returns matching TEXT → your code → Gemini again (LLM call,
         this time to write an answer using that text as context)
```

## 21. Industrial practices for vector search

- **Same embedding model for ingest and query, always** — mixing models
  breaks similarity search, since "nearness" only means something within one
  model's own space.
- **Asymmetric task types** — `task_type="retrieval_document"` at ingest vs.
  `"retrieval_query"` at query time; good embedding APIs optimize these
  differently since a question and its answer don't look alike as raw text.
- **Metadata filtering** — attaching category/date metadata to chunks so you
  can narrow the candidate set before doing similarity search, useful once
  content grows large.

## 22. Why local persistence doesn't survive Cloud Run

Cloud Run's disk is like a rented hotel room, not an owned apartment — every
container start (redeploy, scale-up, automatic restart) gets a **brand-new,
empty filesystem**. A `PersistentClient` writing to a local folder works
perfectly on a laptop (whose disk genuinely persists) but loses everything the
moment the same code runs inside Cloud Run. Flagged as a known gap to solve
before this matters for real deployment, not fixed yet.

## 23. Gemini's two distinct roles

The same "Gemini" umbrella covers two functionally separate models used for
two different jobs in this project:
- **Embedding model** (e.g. `gemini-embedding-001`) — turns text into a vector.
  Used twice: once per chunk at ingest, once per question at query time.
- **Chat/LLM model** (e.g. `gemini-flash-latest`) — takes retrieved text plus
  a question and writes an actual natural-language answer. Chroma never
  produces formatted answers itself — it only ever returns raw stored text.

## 24. Model deprecation and verifying against current docs

`models/text-embedding-004` — the model name originally used — turned out to
already be deprecated by Google. AI tooling/model names move fast enough that
even confident-sounding instructions can be stale; checking current official
docs before trusting a specific model/API name is a real, recurring
discipline, not a one-off fluke.

## 25. Two separate Google billing systems

**Google Cloud Billing** (the GCP trial credit used for Cloud Run/Build) and
**Gemini API / AI Studio billing** are entirely separate ledgers — funding one
does not affect the other. A specific error ("prepayment credits are
depleted") turned out to be a known, currently-reported Google-side bug tied
to projects with an active GCP trial specifically; switching to a plain
"Free tier" API key (no GCP trial attached) sidestepped it entirely.

**Related, separate issue also hit this day:** even a working key can have
per-model free-tier quota set to `0` for a specific model version, independent
of overall account status. `genai.list_models()` reveals which models a key
can call *at all*, but not which currently have non-zero free quota — the
`-latest` aliases (e.g. `gemini-flash-latest`) are a more durable choice than
pinning an exact version number, since Google keeps them pointed at whichever
model currently sits in the free tier.

## RAG pipeline, end to end (recap)

```
INGEST     resume content → chunked by topic → embedded → stored in Chroma
RETRIEVE   user question → embedded → Chroma finds nearest chunks
AUGMENT    system prompt + retrieved chunks + question, combined
GENERATE   combined prompt → LLM → grounded natural-language answer
SERVE      wrapped behind a FastAPI endpoint
DEPLOY     same GitHub Actions → Cloud Run pipeline as the rest of the backend
```
Day 5 covered Ingest and half of Retrieve. Day 6 covered Augment, Generate,
and Serve.

---

# Learning log — Day 6

## 26. From script to reusable function

A script (`query_test.py`) runs top-to-bottom and prints output when executed
directly — nothing happens just from importing it. A FastAPI endpoint needs
something it can *call and get a return value from*, so the same retrieval
logic was extracted into a plain function (`get_relevant_chunks` in
`retrieve.py`) that both the test script and the real endpoint can share,
without duplicating logic.

## 27. System prompt as a versioned file

The system prompt lives in its own file (`app/prompts/ask_me_system.md`)
rather than being a string buried inside Python — the "skill file" pattern
from the original proposal. This keeps prompt content editable and
version-controlled independently from application logic.

## 28. Assembling retrieval + prompt + generation

`chat.py` ties the pieces together: retrieve relevant chunks → join them into
one string with blank-line separators (`"\n\n".join(chunks)`, which signals to
the LLM that these are distinct excerpts rather than one continuous passage,
reducing the chance it blends facts that were never actually adjacent) → send
that combined context plus the question to the chat model.

## 29. FastAPI route conventions

```python
@app.post("/api/chat")          # decorator: HTTP method + URL path
def chat(request: ChatRequest):  # function FastAPI calls for that route
    ...
    return {"answer": answer}    # auto-converted to JSON
```
FastAPI's value over handling raw HTTP by hand: automatic request validation,
automatic JSON conversion, and free interactive docs at `/docs`.

## 30. Pydantic request validation

`class ChatRequest(BaseModel): message: str` *is* input validation — if a
request is missing `message` or sends the wrong type, FastAPI rejects it
automatically (422 error) before the endpoint function even runs. Deeper
validation (length limits, content checks) is a separate, not-yet-added layer.

## 31. Uvicorn — the ASGI server

FastAPI describes *what* endpoints do; Uvicorn is the program that actually
listens on a network port, accepts connections, and hands each request to
FastAPI. FastAPI without a server like Uvicorn is inert code that never
receives anything.

## 32. HTTP vs. framework — untangling the relationship

HTTP is the *protocol* (the rules requests/responses follow). FastAPI is one
*tool*, written in Python, for building a server that speaks that protocol —
Flask, Django, and Express are other tools that speak the same protocol
differently. `curl` talks HTTP to whatever is listening on a port; it has no
awareness of which framework is on the other end.

## 33. Backend directory structure

```
backend/app/
├── main.py              — FastAPI app + all route definitions
├── data/resume_chunks.py — raw content to ingest
├── prompts/ask_me_system.md — system prompt text
└── rag/
    ├── ingest.py         — one-time: embeds chunks, writes to Chroma
    ├── retrieve.py        — reusable: question → relevant chunks
    ├── chat.py             — reusable: question → full answer
    └── query_test.py       — manual test script, not used by the real app
```
Each file has one job; `main.py` → `chat.py` → `retrieve.py` → `chroma_db/`
is the only real dependency chain.

## 34. Why generated data isn't committed

`chroma_db/` is *output*, not source — reproducible any time by re-running
`ingest.py`, and not meaningful to review in a diff (a vector is a wall of
floating-point numbers). Same category of exclusion as `node_modules/` or a
compiled build folder: commit the recipe, not the result of running it.

## 35. Error handling pattern

Convention: keep low-level functions (`get_relevant_chunks`, `answer_question`)
simple and let exceptions propagate; catch and translate errors at the
*endpoint* layer, where there's a clear boundary to a public response.
Catching a specific exception type (`ResourceExhausted` for Gemini rate
limits) allows a specific, honest message; a broader `except Exception`
catches anything else with a generic, safe message — a visitor should never
see a raw Python traceback, which would leak internal file paths and library
details. The real error still gets logged server-side (`logger.exception`)
for actual debugging.

## 36. Agent vs. fixed pipeline — what was actually built

**A fixed pipeline** (what exists now): retrieval runs unconditionally on
every question, in a hardcoded sequence — the LLM never decides *whether* to
look something up.

**A true agent** (industry sense, not yet built): the LLM itself decides which
tool(s) to call, if any, based on reasoning about the specific question — a
capability called **function calling / tool use**. Planned for a later day,
once multiple tools exist for the model to choose between.

## 37. Prompt engineering calibration — where and when

- **System prompt changes** (identity, boundaries, tone): rare, deliberate,
  durable behavior — not tuned per-question.
- **Formatting/output instructions**: iterated more often, based on observed
  failures.
- **Key discipline**: diagnose *which layer* actually failed (retrieval,
  generation, or prompt) before changing anything — prompt tweaks cannot fix
  a wrong answer caused by retrieving the wrong chunk in the first place.

## 38. Production QA controls for an agentic/RAG system

- **Golden eval sets** — fixed question → expected-behavior pairs, re-run
  automatically on every change (planned Day 8; the manual off-topic test
  done today is exactly the kind of case that belongs in that permanent set).
- **Groundedness/faithfulness checks** — verifying an answer doesn't contain
  claims absent from the retrieved context.
- **Boundary/adversarial regression tests** — off-topic refusal, prompt-
  injection attempts ("ignore previous instructions...").
- **Observability** — token usage, latency, error-rate logging per request.
- **Graceful degradation** — known failure modes get specific, calm
  responses rather than generic crashes (implemented today for rate limits).
## 39. Token usage logging — what to log and why

Every LLM response carries real, exact token counts for that specific
request (`prompt_token_count`, `candidates_token_count`, `total_token_count`)
— not estimates. Logging these per request is the foundation for cost
tracking, anomaly detection, and later, empirically choosing context-size
tradeoffs rather than guessing them.

## 40. Context window budget — competing consumers

A context window is one fixed total budget shared by the system prompt,
retrieved context, conversation history, and space reserved for the model's
own output. Growing any one of these leaves less room for the others —
"more retrieved chunks" is never free, even when the window is technically
large enough to fit them.

**Lost in the middle:** LLMs attend more reliably to information at the
start and end of a long context than to content buried in the middle —
concrete reason to keep retrieved chunks sorted by relevance (most relevant
first) rather than treating order as irrelevant.

## 41. Token/context management — industrial checklist

- Match model tier to task difficulty — don't spend a reasoning-heavy
  model's budget on simple lookup/classification
- Disable or reduce "thinking" for tasks that don't need multi-step
  reasoning, where the specific model/SDK combination supports it
- Cap retrieved context (top-k + char/token limits), tuned empirically
  against an eval set, not guessed
- Order retrieved content by relevance to mitigate lost-in-the-middle
- Use prompt/context caching for large static content reused across calls
- Manage conversation history with a sliding window or periodic
  summarization, never unbounded append
- Set explicit output token limits to bound worst-case cost/latency
- Log token usage per request
- Use batch APIs for non-real-time, high-volume workloads
- Treat context-size and compression decisions as empirical, testable
  choices, not assumptions — and know when a possible optimization isn't
  worth the cost of pursuing further (see #49)

## 42. Batch API vs. real-time API

Batch API trades immediacy for cost/throughput: submit many requests
together, the provider processes them within a window (not instantly,
often up to ~24 hours) using spare capacity, typically at a significantly
lower price than the same volume of real-time calls. Right shape for
large, non-urgent bulk workloads (e.g. reprocessing yesterday's support
tickets overnight); wrong shape for anything a user is waiting on live,
like our chatbot.

## 43. Prompt/context caching — what's actually cached, what it saves

Caching saves **inference cost** (re-processing input tokens on every call),
entirely separate from embedding/vector-search cost. What's cached is a
processed representation of a *fixed, reused* block of input — a system
prompt, a large static reference document — kept warm on the provider's
side so repeat calls reusing that exact block are billed at a much lower
rate. Only earns its complexity when the fixed block is large and reused
across many calls; our system prompt is small enough that caching would
save close to nothing, a deliberate reason to skip it for now.

## 44. Sliding window vs. rolling summarization

**Sliding window:** keep only the last N turns of a conversation verbatim,
drop anything older — simple, but old context is lost entirely.

**Rolling summarization:** periodically compress older turns into a short
summary, replace the verbatim history with that summary, keep appending new
turns on top — preserves the gist of old context at much lower token cost
than keeping it verbatim.

**Not implemented, and correctly so for now:** our `/api/chat` endpoint is
stateless, single-turn — there's no accumulating history yet for either
technique to manage. Relevant the moment multi-turn memory gets added, not
before; adding either now would solve a problem the project doesn't
currently have.

## 45. Balancing truncation/summarization against accuracy loss

Same empirical principle as top-k tuning: build a small eval set where
answers depend on specific detail that compression could plausibly lose,
run the same questions at different compression levels, and find the most
aggressive setting that doesn't yet cause measurable accuracy loss on that
set. General judgment underneath it: summarization preserves gist but loses
exact detail — safer for tracking conversational flow than for anything
requiring precise facts, which is exactly why the resume content itself is
retrieved verbatim (via RAG) rather than summarized.

## 46. Thinking tokens — a hidden cost category

Some current Gemini models perform an internal "thinking"/reasoning step
before producing the visible answer. Per Google's own documentation,
`total_token_count` includes these tokens, but `candidates_token_count`
(the visible output) does not — the discrepancy between `prompt + candidates`
and `total` in an early Day 7 log line was this hidden cost, confirmed via
research, not a bug in the logging code. `total_token_count` is the number
that matters for actual billing/quota regardless of whether a specific SDK
surfaces the thinking-token field by name.

## 47. SDK lifecycle — reaching end-of-life mid-project

`google-generativeai` (used since Day 5) was discovered to have been
officially deprecated by Google, reaching full end-of-life August 31, 2025
— frozen, unmaintained, missing newer features like thinking-mode
configuration by design. Migrated the whole backend (`ingest.py`,
`retrieve.py`, `chat.py`) to the current recommended SDK, `google-genai`,
which uses a different pattern throughout: a `Client` object
(`genai.Client(api_key=...)`) rather than module-level `genai.configure()`,
and `client.models.embed_content(...)` / `client.models.generate_content(...)`
rather than standalone functions. Worth checking a dependency's maintenance
status occasionally, not just its latest version number — "still gets
releases" and "actively maintained" aren't the same guarantee.

## 48. Import-order bugs — module self-sufficiency

A real bug hit during the SDK migration: `retrieve.py` read an environment
variable at import time, but only `chat.py` called `load_dotenv()` — and
because `chat.py` imported `retrieve.py` *before* its own `load_dotenv()`
line ran, `retrieve.py` executed first and found the variable unset.
General lesson: any module that reads an environment variable should call
`load_dotenv()` itself, rather than relying on some other file having
already done it first — depending on import order for correctness is
fragile and breaks silently the moment that order shifts.

## 49. Model availability volatility — knowing when to stop optimizing

Across a single session: one model was already deprecated, a second had
zero free-tier quota despite being listed as accessible, a third didn't
support a needed config field via the SDK's validation layer, a fourth
through seventh (tested via a batch probe script rather than one-by-one)
each failed for a *different* reason — quota, deprecation, or invalid
argument. The conclusion — no available model currently supports disabling
thinking for this API key — was reached by direct, systematic testing, not
assumed. ## 50. Harness vs. evals — the general distinction

**Evals** are the test cases themselves: questions plus criteria for what
counts as a correct/acceptable answer. **Harness** is the infrastructure that
executes those cases and reports results. Same relationship as test cases
vs. a test runner in traditional software testing (e.g. pytest); the harness
doesn't know what "correct" means for any given domain, it just runs
whatever check each case declares — which is what makes the same harness
reusable across very different projects.

**Designing a harness well, key points:**
- Pluggable check types (`must_contain` / `must_not_contain` / `any_of`),
  not hardcoded logic — the harness stays reusable across very different
  criteria
- Actionable failure output (what was expected vs. what was actually
  returned), not just a pass/fail flag
- Cost/rate-limit awareness — running evals makes real API calls; a small
  frequent "smoke" subset plus a larger less-frequent full suite is a common
  pattern
- CI integration as the natural end state — failing evals blocking a deploy
  automatically
- Fitting the *business* context is the actual hard part: the "pass" bar for
  a resume bot (near-zero tolerance for fabricated professional claims) is
  entirely different from a creative-writing assistant's (tone/style matter
  more than factual precision) — the harness's job is staying flexible
  enough to encode that judgment, not enforcing one universal standard

## 51. Why the check function returns a boolean, not a status string

Separation of concerns: the checking logic decides *what's true*; the
calling code decides *how to display it*. A boolean is directly reusable
elsewhere (counting, feeding a CI pass/fail decision) without string
parsing, which is more fragile (typos, case-sensitivity) and couples
decision logic to formatting choices that might change later.

## 52. Lexical vs. behavioral checks — which fits which case

**Lexical (string-match)** fits: specific known facts that must appear
(certifications, tool names, dates); specific known-bad terms that must
never appear; structural/format checks.

**Behavioral (judge-based, semantic)** fits better when the *property*
matters more than exact phrasing: does the response stay in character
under an adversarial prompt (unpredictable wording, but a checkable
semantic property); faithfulness/groundedness (requires comparing meaning
against context, not strings); tone/persona consistency; anything a
keyword blocklist could be trivially paraphrased around.

**A real weakness surfaced this session:** the jailbreak eval case used a
lexical check (`must_not_contain: ["knock knock", ...]`) for something
that's fundamentally a behavioral property — it only catches a leaked joke
that happens to start with a guessed phrase, not the underlying failure
mode. Flagged as a known, deliberate simplification rather than a real
defense.

## 53. Other evaluation perspectives beyond lexical/behavioral

- **Human evaluation** — the gold standard, often used to calibrate whether
  an automated judge itself is trustworthy
- **Statistical/similarity-based** (BLEU, ROUGE, embedding similarity to a
  reference) — cheaper than an LLM judge, noisier and less interpretable
- **Production signals** — thumbs up/down, follow-up rate, abandonment;
  continuous post-launch measurement, not pre-deployment testing
- **Adversarial/red-teaming** — deliberate attempts to break the system,
  distinct from a fixed regression suite that only catches previously-known
  failure modes
- **A/B testing** — comparing versions against real business outcomes on
  live traffic
- **Operational metrics** (cost, latency) — a real evaluation dimension with
  its own business-driven pass/fail thresholds, separate from "quality"

## 54. LLM-as-judge and determining a reference answer

For source-grounded RAG specifically, the retrieved chunk itself can serve
as the reference — the judge checks "is this answer supported by this
excerpt," no separately authored answer needed. Other approaches: human-
curated gold answers (most reliable, most expensive, common in high-stakes
domains); rubric-based scoring for subjective tasks with no single correct
answer (tone, creativity).

## 55. RAG evaluation metrics, with business-context thresholds

Faithfulness (claims actually supported by context), context recall
(missed relevant chunks), context precision (irrelevant chunks retrieved),
refusal accuracy (boundary/safety cases), latency, and cost per query are
all real, commonly used metrics — but **the acceptable threshold for each is
a business decision, not a technical one.** A resume bot needs
near-100% faithfulness because fabricated claims about a real person's
career are a real reputational problem; a general trivia bot could tolerate
a much lower bar without meaningful real-world consequence. Dedicated
open-source tooling exists for this at scale (RAGAS, DeepEval, TruLens) —
worth knowing about, out of proportion to a 9-chunk resume project today.

## 56. Decomposing eval pipelines at larger scale

Common practice splits evaluation along the same seams as the RAG pipeline
itself — retrieval (precision/recall of retrieved chunks), augmentation
(did context fit/get truncated correctly), generation (faithfulness,
relevancy), safety/boundary (refusal accuracy), and end-to-end (overall
real-world quality, latency, cost). The payoff: when an end-to-end test
fails, stage-level evals tell you *where* — a wrong answer from bad
retrieval needs a different fix than one from the LLM ignoring good
retrieval.

## 57. Multi-turn reasoning and thought signatures

Multi-turn reasoning means a response depends on context accumulated across
several exchanges or sequential steps, not just the current message alone.
A thought signature is Gemini's specific mechanism for this: an opaque
token representing internal reasoning state, passed into the *next* call so
the model can continue coherently without recomputing prior reasoning.
Not relevant to our chatbot currently, since `/api/chat` is deliberately
stateless/single-turn (confirmed Day 7) — genuinely relevant the moment
real conversation memory gets added, not before.

## 58. Langfuse — purpose and how it fits alongside evals

An observability platform purpose-built for LLM applications — comparable
in spirit to Grafana/Datadog for general software, but vertically
integrated around LLM-specific concepts (prompts, tokens, cost, retrieved
context) that a generic dashboard has no native notion of. Evals answer
"does this known test case pass" before shipping; Langfuse answers "what
actually happened on this one real request" after the fact — genuinely
different, complementary questions.

## 59. Function signatures and tool schemas

A function signature (name, parameters with types, return type) is what the
SDK reads to build the schema shown to the model — the model only ever sees
this interface description, never the function's internal code.

## 60. How a model actually requests a tool call

Not plain text, not an HTTP request from the model's side — a distinct
structured **function_call part** in the API response (tool name + parsed
arguments), separate from any regular text output. The executed result comes
back as a matching **function_response part** in a follow-up exchange.

## 61. Automatic Function Calling (AFC) — the execution mechanics

The SDK inspects the response for a function_call part, matches it against
the real Python callables passed in `tools=[...]`, executes the matching
one directly, and feeds the return value back to the model automatically —
all within one `generate_content()` call from the calling code's
perspective, even though multiple round trips happen underneath.

## 62. Parallel vs. sequential tool calls

A model can request several independent function calls in a single turn
(all executed and their results returned together), or call one tool,
observe its result, and decide whether to call a second based on that —
entirely the model's judgment given the specific question, not something
the calling code controls directly.

## 63. Token cost of tool-calling — a real multiplier, not free

Tool schemas are sent on every call regardless of whether a tool ends up
used; the model's function-call request and the tool's return value both
consume tokens across the underlying multi-step exchange. Concretely
confirmed this session: tool-calling roughly doubles the real API calls per
user question versus the earlier fixed pipeline (Day 6) — directly
responsible for hitting free-tier rate limits faster than before when
testing multiple questions back-to-back.

## 64. Prompt caching — savings scale with what's being skipped, not just its existence

Caching a small fixed block (e.g. our handful of tool signatures, ~100-200
tokens) saves a proportionally small absolute amount — real, but not worth
the added complexity at that size. The technique earns its cost specifically
once the fixed, reused block is large (a whole reference document, an
extensive tool schema) — same "does this optimization earn its complexity
at our actual scale" judgment applied consistently since the Cloud Storage
and thinking-token decisions earlier.

## 65. LLM calls are fully stateless — no such thing as a model reading external storage

A model has no memory of prior calls and no live connection to any external
system; everything it needs must be physically present in that call's input
text, every single time. There's no mechanism for a model to independently
"go look something up" in cloud storage — caching only ever affects billing
for reprocessing a fixed block, never removes it from having to logically
be present in context.

## 66. Middleware, generally

Code that runs on every request/response passing through an app, uniformly,
regardless of which specific route is being hit — conceptually a checkpoint
every visitor passes through entering and leaving a building. FastAPI's
`app.add_middleware(...)` registers this globally; `CORSMiddleware`
specifically checks the incoming `Origin` header against an allowed list on
every request and answers browser preflight `OPTIONS` requests directly,
before route code ever runs.

## 67. CORS configuration should come from environment, not hardcoded source

Same reasoning as secrets: values that differ between local and deployed
environments (allowed frontend origins) belong in `.env`/deploy-time
environment variables, read via `os.environ.get(...)`, not hardcoded into
application code.

## 68. FastAPI routers — the standard growth pattern

Rather than OOP inheritance/subclassing (not a FastAPI convention), the
real industrial pattern for a growing app is `APIRouter`: each logical
feature area gets its own file defining a router, included into one
`main.py` via `app.include_router(...)`. Keeps `main.py` as pure app
setup/wiring, with route logic organized by feature as the app grows.

## 69. localStorage vs. sessionStorage

Both are browser-only, origin-scoped storage, entirely independent of any
backend state — restarting a server or redeploying has zero effect on
either. The real difference is lifespan: `localStorage` persists
indefinitely until explicitly cleared; `sessionStorage` persists across
refreshes and navigation within one tab but clears automatically when that
tab closes — a much closer match to the everyday meaning of "a session"
than `localStorage` was, once discussed carefully.

## 70. Server-side rendering and browser-only APIs (hydration mismatch)

Next.js renders a page once on the server (no `localStorage`/`sessionStorage`
exists there) before the browser "hydrates" it client-side. Reading
browser-only storage too early causes a mismatch between what the server
rendered and what the client expects. Standard fix: initialize state empty
(matching the server-rendered version), then load browser-only data inside
a `useEffect`, which only runs after the component has actually mounted in
the browser.

## 71. A real React race condition, and the fix pattern

Two `useEffect` hooks — one loading saved state, one saving current state on
every change — both run within the same initial render pass. The load
effect's `setState` call doesn't apply synchronously, so the save effect,
running immediately after in that same pass, still sees the *original*
(empty) state and overwrites the just-loaded data before it's ever
rendered. Fixed with a `useRef` flag that makes the save effect a no-op on
its very first run only, giving the load effect's update a chance to land
first. Notably, this bug was easier to catch in local dev specifically
because React Strict Mode double-invokes effects there — the same code is
less likely to visibly fail in a production build, which is why testing
against `next build && next start`, not just `next dev`, mattered as its
own separate check.

## 72. gcloud `--set-env-vars` — escaping values that contain the delimiter

`--set-env-vars` uses commas to separate different `KEY=value` pairs; a
value that itself contains a comma (e.g. two URLs) gets mis-split, with the
fragment after the comma read as an invalid new pair. Shell-level quoting
does not fix this, since it's a separate, later parsing step internal to
gcloud itself. Fix: gcloud's `^CHAR^` prefix syntax lets you specify a
different separator character for that one flag
(e.g. `"^@^KEY1=val1@KEY2=val,with,commas"`), leaving commas inside values
untouched.

## 73. Debugging technique — reading an error's isolated fragment as a signal

When an error message names a suspiciously small, precisely-isolated
fragment of a larger input (here: a lone URL, no `=` sign, cut out of a
much longer flag value), that fragment usually marks exactly where a
parser's understanding diverged from intent — read as "everything before
this parsed correctly; this specific piece is where it broke," rather than
treating the whole argument as uniformly malformed. This framing was what
pointed directly at "something inside the value is being misread as a
separator" rather than continuing to chase shell-escaping, which had
already been ruled out by the location of the failure.


---

# Learning log — Day 5 & Day 6: building the RAG chat agent

## 16. Embeddings — the core intuition

An embedding turns a sentence into a list of numbers (a point in a high-dimensional
space) such that sentences with similar *meaning* land near each other — not
similar spelling. "I debugged a flaky test" and "the CI pipeline caught a bug"
end up close together despite sharing almost no words. This is the whole
mechanism retrieval relies on: a user's question gets embedded into that same
space, and whichever stored chunks are *nearest* to it are the relevant ones.

## 17. Prompt engineering — the three-part shape of a system prompt

A good system prompt generally has: **role** ("you're answering questions about
X"), **boundaries** ("if off-topic, decline politely"), and **format guidance**
("keep answers to 2-3 sentences unless asked for more"). Built for real in
`app/prompts/ask_me_system.md` and confirmed working via the off-topic test at
the end of Day 6.

## 18. Content chunking — grouping principle and naming

**Chunking principle:** group by topic coherence, not by arbitrary size — the
goal is that a retrieved chunk is about *one thing*, so the LLM isn't stitching
together loosely related facts from a grab-bag.

**Chunk ID naming, corrected mid-session:** IDs are internal-only (never shown
to a user) but should describe the chunk's *purpose*, not just what happens to
be in it. `dyson_panasonic` (names the companies) was renamed in spirit to
`internship_experience` (names the category) — the second tells you the chunk's
role at a glance, which matters when maintaining the file later.

**Category judgment call, made explicit:** pure academic facts (degree,
university, honours) belong in `education`; recognition (scholarships, the
TikTok Spot Bonus) belongs in a separate `awards` chunk — because "where did she
study" and "what awards has she won" are different question types, and mixing
them means either question retrieves irrelevant content alongside the right answer.
A content *error* was also caught and fixed in this pass: the TikTok bonus had
been miscategorized under education originally.

## 19. Chroma — what it actually is and how it fits the codebase

Chroma is not a separate server the app calls over a network — for a project
this size, it's a Python library running *inside* the same process, writing to
a local folder (`chroma_db/`), conceptually similar to SQLite. Chroma and Gemini
never talk to each other directly; the app's own code is the middleman for both:

- **Ingest time:** app code → Gemini (embed each chunk) → Chroma (store vector + text)
- **Query time:** app code → Gemini (embed the question) → Chroma (find nearest
  vectors, return matching text) → app code → Gemini again (this time as an LLM,
  to write a natural-language answer using that text)

**Industrial practices noted:**
- Always use the *same* embedding model for ingest and query — mixing models
  breaks similarity search, since "nearness" only means something within one
  model's space.
- Asymmetric task types: `task_type="retrieval_document"` at ingest,
  `task_type="retrieval_query"` at query time — good embedding APIs optimize
  these differently since a question and its answer don't look alike as raw text.
- Metadata filtering (attaching category/date to chunks, filtering before
  similarity search) becomes relevant once the data source grows large — not
  needed yet at 9 chunks.

## 20. Why local persistence doesn't survive Cloud Run

Cloud Run gives each container a fresh, empty filesystem on every start,
restart, or scale-up — like a hotel room, not an owned apartment. Nothing
written to disk in a previous run carries over. `PersistentClient`'s local
folder works fine on a laptop (which genuinely persists between runs) but would
silently lose all ingested data the moment this code runs in Cloud Run. **Flagged
as a known gap to fix on a later day** (options noted: re-run ingestion at
container startup, or move Chroma's storage to a mounted volume/cloud bucket) —
not yet resolved.

## 21. Two separate Gemini roles, not one

- **Gemini as an embedding model** (`embed_content`) — turns text into a vector.
  Used twice: once at ingest, once per query.
- **Gemini as an LLM/chat model** (`GenerativeModel(...).generate_content(...)`)
  — a *different* model, takes retrieved text + the question, writes an actual
  answer. Chroma never does this formatting step itself; it only ever returns
  raw stored text.

## 22. RAG end-to-end, the full pipeline

```
INGEST (one-time, or when content changes)
  content → split into topic chunks → embed each → store in vector DB

RETRIEVE (every user question)
  question → embed it → vector DB finds nearest chunks

AUGMENT
  system prompt + retrieved chunks + question → combined prompt

GENERATE
  combined prompt → LLM → grounded answer

SERVE
  wrapped behind a FastAPI endpoint (POST /api/chat)

DEPLOY
  same GitHub Actions → Cloud Run pipeline as the rest of the backend
```
Day 5 covered Ingest and Retrieve; Day 6 covered Augment, Generate, and Serve.

## 23. Backend directory structure

```
backend/
├── app/
│   ├── main.py              — FastAPI app + all route definitions
│   ├── data/resume_chunks.py — raw content to ingest
│   ├── prompts/ask_me_system.md — system prompt text
│   └── rag/
│       ├── ingest.py        — one-time script: embed chunks → Chroma
│       ├── retrieve.py      — reusable function: question → relevant chunks
│       ├── chat.py          — reusable function: question → full answer
│       └── query_test.py    — throwaway manual test script
├── chroma_db/                 — generated vector data (gitignored)
├── requirements.txt
├── Dockerfile
└── .env                        — secrets (gitignored)
```
Flow: `main.py` → `chat.answer_question()` → `retrieve.get_relevant_chunks()` →
reads `chroma_db/` (populated earlier by `ingest.py`). Each file has one job.

## 24. Script vs. reusable function — what makes something endpoint-callable

Nothing magic distinguishes them structurally — it's about shape. `query_test.py`
is a script: runs top-to-bottom, prints to console, does nothing on import.
`retrieve.py` defines a *function* (`get_relevant_chunks`) that does nothing on
its own but returns a value when called — which is what an endpoint needs. The
same underlying logic was extracted from the throwaway script into a proper
function specifically so both the test script and the real endpoint could reuse
it without duplication.

## 25. Which endpoints call retrieval, and why just one

Only `/api/chat` calls `get_relevant_chunks()` — as an internal implementation
detail, never exposed to visitors directly. Retrieval isn't a standalone public
capability; it's a helper step inside answering a question. A separate feature
needing search later could reuse the same function without new retrieval logic.

## 26. Error handling convention — where it lives

**Low-level functions stay simple and let exceptions propagate.** The *endpoint*
is where errors get caught and translated into a sensible HTTP response — a
visitor should see "something went wrong, try again," never a raw Python
traceback. Implemented for real at the end of Day 6:
- Catch the *specific* exception type where possible (`ResourceExhausted` for
  Gemini rate limits) → return an honest, specific message ("busy, try again").
- Catch generic `Exception` as a safety net for anything else → return a vague,
  safe message (prevents leaking internal file paths/library details).
- Log the *real* error server-side (`logger.warning` / `logger.exception`) even
  while showing the visitor something generic — debuggability without exposure.
- A generic `500 Internal Server Error` is just FastAPI/Uvicorn's fallback for
  *any* uncaught exception — it's a wrapper, not a diagnosis; the real cause is
  always underneath it in the traceback.

## 27. Prompt assembly — what `"\n\n".join(chunks)` does and why

`chunks` is a list of separate strings; `"\n\n".join(...)` glues them into one
string with a blank line between each. The blank lines are a cheap, effective
signal to the LLM that these are *separate, distinct excerpts* rather than one
continuous paragraph — run-on text with no separation makes it more likely the
model blends facts that were never actually adjacent in the source content.
Retrieved chunks being handed to the LLM as labeled "context" alongside the
question is the standard, textbook shape of RAG — not a project-specific choice.

## 28. FastAPI conventions

```python
@app.get("/some-path")      # decorator: HTTP method + URL path
def function_name():         # called by FastAPI when that URL is hit
    return {"key": "value"}  # auto-converted to JSON
```
FastAPI's value over handling raw HTTP by hand: automatic request validation via
Pydantic models (e.g. `class ChatRequest(BaseModel): message: str` — a request
missing or misdefining `message` gets auto-rejected with a 422 before the
function even runs), automatic JSON conversion both directions, and free
interactive docs at `/docs`.

**Framing correction made explicit:** FastAPI is not an alternative to HTTP —
it *is* HTTP, just a Python framework that makes writing HTTP endpoints far
less tedious than handling raw sockets. `curl` speaks HTTP to whatever's
listening on a port; it has no awareness of which framework (FastAPI, Flask,
Express) is on the other end.

## 29. What Uvicorn is, and why it's separate from FastAPI

FastAPI describes *what* endpoints do; something still has to actually listen
on a network port and hand incoming connections to FastAPI. That's Uvicorn's
job — an ASGI server. FastAPI without a server like Uvicorn running it is inert
code that never receives a request.

## 30. Debugging model-availability errors — a repeatable pattern

Hit twice in one session, each with a different root cause, both real "AI
tooling moves fast" lessons:

- **`text-embedding-004` not found** → the model had been deprecated by Google
  since the original instructions were written. Fixed by switching to
  `gemini-embedding-001`.
- **A typo'd fix** (`text-embedding-001`, which nobody typed intentionally)
  appeared after an editor edit — fixed by verifying the literal file content
  via `grep` rather than trusting the edit happened as described, then
  correcting via a `sed` command run directly in the terminal to avoid further
  editor-autocomplete interference.
- **`gemini-2.0-flash` quota limit: 0`** despite appearing in
  `list_models()` output — the key lesson: **being listed as a permitted model
  and having non-zero free-tier quota are two separate gates.** `list_models()`
  only confirms the first. Fixed by switching to a `-latest` alias
  (`gemini-flash-latest`) rather than a specific version number, since Google
  maintains these aliases to always point at whatever they currently consider
  the free-tier-appropriate model — a more durable choice than hardcoding a
  version that could get its quota reallocated the same way.

**General pattern worth keeping:** when an AI provider's model name fails,
verify against the provider's *current* live behavior (search, or a
`list_models()`-style call) rather than trusting either party's static
knowledge — both a person's instructions and a model's training data can be
stale relative to how fast these APIs change.

## 31. Gemini billing — two separate systems, and a known Google-side bug

**Google Cloud Billing** (the GCP trial credit) and **Gemini API / AI Studio
billing** are entirely separate systems — a GCP trial credit does not fund
Gemini API usage at all, and vice versa. This explains why the resume agent's
LLM calls run under a *different* Google project than the Cloud Run
infrastructure — a real, acknowledged bit of tangle in the setup, not
tidy, but functional and free.

**The specific error hit** ("prepayment credits are depleted" on a fresh
free-tier key) was confirmed, via checking current forum reports, to be a
**known, currently-open Google-side billing-state sync bug** affecting projects
with an active GCP trial specifically — not something caused locally, and not
reliably fixed by enabling billing (multiple reports showed the error
persisting even with billing already active). **Resolution used:** switch to a
different, older API key/project with no GCP trial attached, which sidesteps
the buggy trial-tier ledger entirely.

**Cosmetic, unrelated noise:** the "Failed to send telemetry event" messages
seen throughout are Chroma's own optional, anonymous analytics call failing due
to a harmless version mismatch — confirmed not to affect ingestion or retrieval
correctness in any way, safe to ignore or silence via
`os.environ["ANONYMIZED_TELEMETRY"] = "False"`.

## 32. Agent vs. fixed pipeline — a real distinction, not just terminology

What's built as of Day 6 is more precisely a **grounded chatbot / fixed RAG
pipeline**, not yet a full **agent** in the stricter industrial sense — worth
naming the distinction rather than blurring it:

- **What we have:** retrieval runs *unconditionally* on every question,
  hardcoded in `chat.py`. The LLM never decides whether to look something up —
  that decision was made in code, not by the model.
- **What a true agent adds:** the LLM itself decides *whether* and *which*
  tool(s) to call, based on reasoning about the specific question — this
  capability is called **function calling** / **tool use**. E.g., a real agent
  version would offer multiple tools (`search_resume`, `get_project_details`,
  `get_fun_fact`) and let the model choose among them, potentially calling
  several in sequence.
- System prompt for identity/scope: correctly part of "agent" thinking either
  way. Autonomous, LLM-decided tool invocation: not yet implemented — this is
  the explicit target of a later day (multi-tool agent work), not something
  accidentally skipped.

## 33. Where prompt engineering calibration happens, and the guiding principle

- **System prompt changes** (identity, boundaries, tone): rare and deliberate —
  durable behavior, not tuned per-question.
- **Formatting/output instructions**: iterated more frequently, based on
  observed failures (e.g. answers too long → add a length instruction → re-test
  to confirm nothing else broke).
- **General principle:** treat prompt changes like any regression-tested
  system change — alter one variable, re-run the same fixed test set, compare
  results, rather than tuning by feel.
- **Trap to avoid:** using prompt tweaks to paper over a *retrieval* failure.
  If a wrong answer traces back to the wrong chunk being retrieved, no prompt
  wording fixes that — the fix belongs in chunking/retrieval, not the prompt.
  Diagnosing *which layer* actually failed (retrieval vs. generation vs.
  prompt) before changing anything is the real skill, and directly motivates
  building a fixed eval set later (a later day) rather than tuning ad hoc.

## 34. Common production QA controls for an agentic/RAG flow

- **Golden eval sets** — a fixed list of question → expected-behavior pairs,
  run automatically on every prompt or code change (planned for a later day;
  the manual off-topic test just performed is exactly the kind of case that
  belongs permanently in such a set).
- **Groundedness/faithfulness checks** — verifying an answer doesn't contain
  claims absent from the retrieved context (often done via a second LLM call
  grading the first's output against its source context).
- **Boundary/adversarial regression tests** — off-topic refusal (tested today,
  passed) and prompt-injection resistance ("ignore previous instructions...")
  — should become permanent automated tests, not one-off manual checks.
- **Observability** — token usage, latency, and error-rate logging per request
  (planned: Langfuse, later day) — catches quality or cost regressions before a
  user reports them.
- **Graceful degradation** — implemented today: known failure modes (rate
  limits) get a specific, honest response rather than a generic crash.
- **Prompt version control** — the system prompt already lives in its own
  file, tracked like code, rather than edited live in a running system.

---

# Learning log — Day 9

## Function signatures and automatic function calling

A function signature is just the name, typed parameters, and return type —
the interface, not the implementation — and it's exactly what an SDK reads
to build the schema shown to an LLM for tool-calling; the model never sees
a function's actual code. "Automatic function calling" (AFC): pass plain
Python functions (with docstrings) as `tools=[...]`, and the SDK handles
everything after the model decides to use one — matching the requested
tool by name, executing the real function with parsed arguments, and
feeding the result back to the model automatically, all within one
`generate_content()` call from the caller's perspective.

## How a tool call actually flows

The model's request to call a tool isn't plain text or an HTTP request on
its end — it's a structured `function_call` part in the API response
(tool name + arguments, matching the schema built from the function
signature). The SDK executes the matching real function and packages the
return value as a `function_response` part, sent back to the model in an
automatic follow-up request, before the model writes its final answer.

## Parallel vs. sequential tool calls

A model can request multiple independent tool calls in a single turn if a
question needs several unrelated lookups — the SDK executes all of them and
returns all results together before the final answer. Separately, a model
can also call one tool, see its result, and decide to call a second based
on that outcome (sequential/chained calling). Which happens is entirely the
model's judgment given the specific question.

## Token cost of tool-calling — a real multiplier, not free

Every tool-enabled call sends the full tool *schemas* (names + docstrings)
regardless of whether any tool actually gets used, and each internal
model→tool→model round trip adds real tokens beyond the visible final
answer. Confirmed directly: adding tools roughly doubled real API calls per
user question (tool-selection step + final-answer step) versus the earlier
fixed pipeline, which is exactly why an early rate-limit hit (a 503, handled
gracefully per the Day 7 error-handling work) showed up sooner than before
when firing several test questions back-to-back.

## Where prompt caching's payoff actually comes from

Revisited from Day 7 with a sharper framing: caching's savings scale with
the *absolute size* of the fixed block being skipped, not with whether
caching is "supported" in principle. Caching three small tool schemas
(~100-200 tokens) would save a proportionally tiny, not-worth-the-complexity
amount — the same category of premature-optimization judgment as the
Cloud Storage and thinking-token decisions on earlier days.

## CORS — browser same-origin policy

Browsers block JavaScript on one origin (e.g. the frontend's Cloud Run
domain) from calling a different origin (the backend's) by default, unless
the backend explicitly allows it. `CORSMiddleware`, given a list of allowed
origins, adds the correct response headers (or rejects) for every request —
without this, cross-origin fetch calls from a real deployed frontend fail
silently, even though everything can look fine when both sides happen to
run on `localhost` during local testing.

## Middleware, generally

Code that wraps every request/response passing through an app, running
before the route handler and after it returns, uniformly, regardless of
which specific route is hit — comparable to a checkpoint every visitor
passes through entering and leaving a building, not tied to any one room.
`add_middleware(CORSMiddleware, ...)` registers exactly this kind of
uniform, cross-cutting check globally rather than requiring origin-checking
logic to be duplicated inside every individual route.

## Scaling a FastAPI app — routers, not class inheritance

The industrial pattern for a growing API isn't object-oriented subclassing;
it's `APIRouter` — each logical feature area gets its own file defining a
router, included into one central `main.py` via `app.include_router(...)`.
Restructured `/api/chat` and `/health` into `app/routers/` this way,
specifically because more endpoints (leaderboard, meme-of-the-day, admin)
are already known to be coming later in the project.

## Centralizing shared constants

Caught a real instance of the same limit (`MAX_CONTEXT_CHARS`) being
independently defined in two files — moved into a single `app/config.py`
that both import from. General principle: config/constants shared across
files should have exactly one source of truth, the same reasoning as
avoiding duplicated logic.

## Why React state resets when navigating between pages

Next.js's App Router **unmounts** a page's component when navigating away
and mounts a genuinely new instance on return — `useState` is scoped to a
component instance, so its data is discarded, not paused. This is why an
in-memory-only chat history disappeared on switching pages, and why
surviving navigation requires state to live somewhere outside the
component's own lifecycle (browser storage, or a provider higher up the
tree).

## localStorage vs. sessionStorage

Both persist independently of anything server-side (a backend restart or
redeploy has zero effect on either) — the difference is purely how long the
browser keeps the data. `localStorage` persists indefinitely until
explicitly cleared; `sessionStorage` persists across refreshes and
navigation within one tab, but clears automatically when that tab closes.
Chose `sessionStorage` specifically because it matches the actual intended
meaning of "a visit" much more closely than `localStorage` did.

## Server-side rendering and browser-only APIs

Next.js renders once on the server (no `localStorage`/`sessionStorage`
exists there) before hydrating in the browser — reading browser-only
storage too early causes a mismatch. Standard fix: render with empty/default
state matching what the server produced, then load real stored data inside
a `useEffect`, which only runs after the component has mounted in the
browser.

## A real race condition from React Strict Mode

Two separate effects — one loading from storage, one saving to storage
whenever `messages` changed — ran in an order where the save effect fired
using the *pre-update* state, immediately overwriting the just-loaded data
with an empty array before the load had visibly taken effect. Fixed with a
ref-based guard that skips the save effect's very first run. Notably, this
exact race is *more visible* in local dev specifically because React
Strict Mode deliberately double-invokes effects to help surface bugs like
this one — worth testing the actual production build (`next build` +
`next start`), not just dev mode, as a stronger confirmation a fix
actually works.

## Sticky positioning for a persistent UI control

`sticky top-0 z-10 bg-canvas` locks an element to the top of the viewport
once scrolled past, rather than scrolling away with the rest of the page —
used to keep a "clear conversation" button reachable at all times in a
growing chat thread. The solid background matters as much as the
positioning itself, so content scrolling underneath doesn't visually
overlap the pinned element.

## Auto-scroll-to-latest pattern

A ref attached to an empty marker element at the very end of a message
list, combined with `scrollIntoView({ behavior: 'smooth' })` inside a
`useEffect` that runs whenever the message list changes — standard pattern
for keeping newly arrived content visible in any growing scrollable feed.

## Why testing the production build specifically matters

`next dev` does not enforce the same linting `next build` does — a build
caught real, blocking errors (unescaped quote characters in JSX) that dev
mode had been silently accepting the entire time. Since real hosting
platforms run the equivalent of `next build`, not `next dev`, a feature
that "works" in local dev isn't actually confirmed until it's been checked
against a real production build — which is exactly the check that also
caught the Strict Mode race condition being dev-mode-specific.

## Debugging a cryptic CLI syntax error — reasoning from the exact fragment named

`gcloud run deploy`'s `--set-env-vars` splits its value on commas to
separate different `KEY=value` pairs — a problem when one variable's own
value (a comma-separated list of CORS origins) contains a comma itself.
The error named one small, oddly-isolated fragment (a lone URL with no
`=`) rather than the whole flag — a strong signal that gcloud had already
parsed everything *before* that point correctly, and broke specifically at
the comma inside the URL list. The general lesson: shell-level quoting and
a command's *own internal* argument parsing are two separate layers that
can each break independently — quoting a string controls what the shell
hands to a command, but does nothing about how that command parses the
string internally afterward. Fixed using gcloud's documented custom-
delimiter escape syntax (`^@^KEY=value@KEY2=value2`) rather than more
shell-level quoting, since the actual problem lived in the second layer.

---

# Learning log — Day 10 & Day 11: hand-tracking and the gesture-controlled game

## MediaPipe Hand Landmarker fundamentals

Detects 21 fixed points per hand (fingertips, knuckles, wrist), returned as
normalized `(x, y, z)` — `x`/`y` as fractions (0-1) of the video frame's
width/height, `z` as rough relative depth. Landmark 8 is specifically the
index fingertip. Runs entirely client-side via WebAssembly (`delegate:
'GPU'` routes the actual computation through WebGL) — no video frame ever
leaves the browser, which matters for both latency and privacy. Internally
a two-stage pipeline: a lightweight palm detector finds a rough hand
location across the full frame, then a precise landmark model runs only on
that small cropped region — keeps per-frame cost low once a hand is already
being tracked.

## requestAnimationFrame syncs to the display, not a fixed timer

Fires in step with the actual screen refresh rate (commonly 60Hz, can be
higher), not a chosen interval — the detection loop's frequency is
determined by the visitor's own display, not by us.

## Choosing a selection gesture — measured, not assumed

Directly compared three candidate "select" gestures (pinch-close, forward
poke via z-depth, fist-clench via MediaPipe's separate Gesture Recognizer
task) using a real side-by-side test page before committing to one. Pinch
won on precision, but a *double*-pinch requirement still felt unresponsive
— the actual fix was reconsidering the gesture's shape entirely (single
pinch, not double), not further tuning thresholds. General lesson: a
UX complaint about "responsiveness" isn't always a detection-accuracy
problem — sometimes the interaction pattern itself is the wrong shape for
the task, borrowed from a different context (double-click/double-tap is a
desktop/touch convention with no inherent reason to transfer to gesture
control).

## Landmark smoothing — damping jitter without adding real lag

Per-frame landmark coordinates are noisy even when a hand is still enough
to cause a computed value (like a pinch-distance ratio) to flicker across a
threshold repeatedly. Fixed with exponential smoothing — blending each new
raw reading with the previous *smoothed* value (50/50 in this project) —
before using the coordinates for anything, both detection logic and
drawing.

## Multi-hand tracking and identity across frames

With `numHands: 1`, a second hand entering the frame forces the model to
arbitrarily pick one, causing visible flicker as confidence shifts between
them. Fixed by tracking both (`numHands: 2`) and identifying each by
MediaPipe's own handedness label (`Left`/`Right`), not array index — index
order across frames isn't guaranteed stable, but the label is, which is
what actually stopped the flicker (rather than the increased render size
initially assumed to be the fix).

## Canvas hand-skeleton rendering

MediaPipe's 21 landmarks have a fixed, well-known connectivity graph
(which joint connects to which) — hardcoded once as a constant list of
index pairs, since it reflects a stable anatomical mapping unrelated to API
version. Drawing lines between connected pairs plus dots at each joint,
with a `shadowBlur`/`shadowColor` glow, over a dark starfield background
instead of raw video, produces the "digitized hand" visual — raw video is
hidden entirely (kept only as MediaPipe's detection input, not shown).

## Starfield background — generate once, animate cheaply

Star positions/sizes are randomized once on mount and stored in a ref, not
regenerated per frame (which would look like flickering noise, not a
starfield). Per-frame cost is just reading stored positions and computing a
cheap sine-based twinkle offset — expensive randomness happens once,
cheap animation happens every frame.

## Grouped config objects over flat constant lists

A later revision of the shared config file organized constants by concern
(`PALETTE`, `PINCH`, `HOVER`, `STARFIELD`) rather than a flat list of
similarly-prefixed names — genuinely easier to extend (adding `BURST` or
`DEPTH` groups for future features) and reduces the chance of a stray
unrelated constant getting lost among unrelated ones.

## Minesweeper-style deduction as a fix for a "guaranteed win" game design

The root problem with the first working version of the card game wasn't
difficulty tuning — it was that flipping a wrong card carried zero
information *or* cost, making exhaustive row-by-row scanning a completely
safe, if boring, winning strategy. The fix that actually addressed the root
cause (rather than patching around it with a hazard card or a hard flip
limit) was adding real information: revealing, on every non-bingo card
flip, the count of bingo cards among its 8 neighboring cells — the same
core mechanic as Minesweeper's numbers. This converts every flip from
"blind guess" into "evidence," making deduction genuinely possible and
rewarding, without needing any punishing failure state.

## Flood-fill cascade reveal (BFS), and "free" information

A card with zero bingo neighbors auto-reveals its own neighbors too
(cascading further through any of *those* that are also zero, stopping at
any non-zero "boundary" cell) — the classic Minesweeper open-area reveal.
Implemented as a breadth-first search with a visited-set to avoid
reprocessing. Deliberately made these cascade-revealed cells **not** count
against the player's flip total — only the one card they explicitly
selected does — mirroring Minesweeper's own convention that finding an
open area is a reward, not a cost.

## A simple, honest efficiency score from min/max bounds

`efficiency = 1 - (flipsUsed - bingoCount) / (totalCards - bingoCount)`,
clamped to 0-1: the theoretical best case (every flip is a bingo card) and
worst case (the whole grid) bound a genuinely meaningful score without
needing to solve for a mathematically true optimal-play minimum, which
would be a much harder problem. Good enough to reward actual deduction
over brute force, cheap to compute from numbers already tracked.

## Refs vs. React state for high-frequency game data

Card state, timers, and per-frame tracking data live in refs, not
`useState` — since the whole board is redrawn on canvas every animation
frame regardless, there's no reason to also trigger a React re-render 60
times a second for data nothing in the DOM directly reads. Only the couple
of values actually displayed as DOM text (level, score, found count) are
real state.

## Fixing mirrored canvas text

`-scale-x-100` (CSS) mirrors an entire canvas element for a natural
selfie-view — correct for symmetric shapes (circles, grid lines) but
visibly wrong for text. Fixed with a small reusable helper that temporarily
counter-transforms the canvas's own coordinate system (`ctx.save()` →
translate to the text's position → `ctx.scale(-1, 1)` → draw at the new
origin → `ctx.restore()`) rather than fighting the outer CSS mirror
directly — used consistently for both the level-clear banner and the
in-cell adjacency numbers once the same bug appeared in a second place.

## Two independent coordinate systems: display size vs. detection space

A common point of confusion worth having settled clearly: how large a
canvas is rendered on screen (`85vw`, CSS) has zero effect on tracking
quality or coordinate values — MediaPipe reports hand position as a
fraction (0-1) of the raw camera frame, entirely independent of display
size. The actual lever for keeping game elements inside a reliably-tracked
region is the *normalized* margin reserved in that 0-1 space, not anything
about how big the canvas looks.

## CSS centering failure when a child is wider than its constrained parent

`mx-auto` only centers an element correctly when it's *narrower* than its
parent. The site's `<main>` container is capped at `max-w-3xl`; sizing the
game board to `85vw` made it wider than that parent, so auto-margins
collapsed to zero rather than centering — left-aligning it with wherever
the parent's content started, with unconstrained overflow to the right.
Fixed with the standard "viewport breakout" technique: an outer wrapper
sized to the true viewport (`w-screen`) and centered relative to it via
`relative left-1/2 -translate-x-1/2` (shift right by half the viewport,
then left by half of its own now-full width), with the actual desired
sizing applied to an inner element centered within that wrapper.

## Physical hardware limits vs. code bugs — a real, correctly diagnosed distinction

Persistent tracking instability at one edge of the play area was
investigated directly (temporarily displaying the raw landmark coordinate
on-screen while testing) rather than continuing to guess at config values.
The result: two genuinely different physical causes — one hand's reach
being blocked by self-occlusion (the arm crossing in front of the body),
and normal model-confidence degradation near the true edge of the camera's
field of view for the other. Neither is fixable by adjusting margins,
canvas size, or any other code-level change — a good, concrete example of
recognizing when a persistent issue has reached the boundary of what
software can address, and confirming that boundary with direct evidence
rather than continuing to iterate blindly. Notably contrasts with an
earlier, unverified bug diagnosis in this same project (the Day 10 camera
theory that turned out to be unnecessary) — this time, the claim was
checked with real instrumentation before being treated as the answer.

---

# Learning log — Day 12 (and the tool-redundancy audit before it)

## Auditing tool redundancy — the one real design test

Before adding any tool to an agent, ask: *does this tool's output depend on
its input?* If a tool takes no meaningful parameters and would return the
exact same thing regardless of the question, it isn't a tool — it's static
knowledge, and belongs directly in the system prompt instead. This single
question caught two genuinely unnecessary tools (`get_project_details`,
`get_fun_fact`) that were paying the cost of a full extra API round trip
every time, just to fetch text that never changed. After removing them,
only genuine resume questions cost two requests; everything else dropped
to one.

## Real-world token/cost management scenarios, generalized

Classification/routing and content moderation at scale favor disabling
thinking and using the cheapest model tier, since the task is closer to
lookup than reasoning. Long multi-turn chat needs a sliding window or
rolling summarization to avoid unbounded context growth. Summarizing
something bigger than the context window uses map-reduce (chunk, summarize
each, summarize the summaries). Repeated calls against one large static
reference benefit from prompt/context caching. Agentic tool-calling loops
need their intermediate tool *results* truncated before being fed back in,
since raw API responses balloon context fast across iterations. Genuinely
hard reasoning tasks are the one case where keeping thinking enabled,
possibly at a higher budget, is the right call — not everything should be
optimized toward "cheaper."

## Redis sorted sets, and why they fit a leaderboard specifically

A sorted set keeps every member ranked by an attached numeric score
automatically, at all times — no separate sort step. `ZADD` inserts or
updates a score in roughly logarithmic time regardless of how many members
exist; `ZRANGE` fetches an already-sorted slice (like "top 10") just as
cheaply. A generic database table could store the same name/score pairs,
but would need to actively re-sort on every leaderboard read. This is
specifically why Redis — not "Redis is fast" in the abstract, but "Redis
has a data structure purpose-built for exactly this shape of problem."

## How the leaderboard actually communicates

The browser never talks to Redis directly — it only ever talks to our own
backend, which is the one holding the database credentials. Submitting a
score: read the existing score (`ZSCORE`), validate the new one against it,
then write (`ZADD`) only if it passes. Fetching the board: ask Redis for
the top 10, already sorted (`ZRANGE`), and forward that straight to the
frontend. Three simple commands cover the entire feature.

## Why "skip the check for the same session" isn't actually safe

HTTP requests are stateless by default — our backend has no built-in way to
verify "this request is genuinely a continuation of an earlier one" without
adding real session/auth infrastructure. Trusting a client's unverified
claim of continuity would let anyone bypass the anti-cheat delta check by
simply asserting it. An in-memory server-side cache to skip the check would
have the same failure mode already learned from Chroma on Day 5: it breaks
the moment more than one backend instance exists, since each would have its
own inconsistent view. The actual call frequency here (once per level
clear, a human-paced event) was never a real performance problem worth
trading correctness for.

## Anti-cheat tied to real game mechanics, not arbitrary limits

Since one level clear can never award more than 100 points, a new score
submission jumping by more than that from the previously stored value is
provably implausible and gets rejected — a check derived from the actual
system's behavior, not a guessed ceiling.

## No real identity, so "claiming" a name is informational, not enforced

With no login/password anywhere in the system, exclusive ownership of a
name genuinely can't be guaranteed no matter what's built — a hard "name
taken" block would be friction that *looks* like security without actually
providing it, and would also block the common legitimate case of the same
real person returning in a fresh session. The chosen fix: show the
existing score for a name as the player types (a debounced lookup, 500ms
after typing pauses), informationally, without blocking submission either
way.

## Built-in SDK retry vs. hand-rolled retry

`upstash-redis` ships its own retry mechanism (`rest_retries`,
`rest_retry_interval` on the client), unlike `google-genai`, which needed
a custom `call_with_retry` wrapper built from scratch on Day 7. Worth
checking whether a client library already solves a problem before building
a parallel solution — the fix here was configuring existing behavior
explicitly, not writing new retry logic.

## Fire-and-forget calls can afford more patient retry timing

The live chat endpoint needed a tight retry policy specifically because a
real person is watching a "thinking…" indicator the whole time. Leaderboard
submissions are fire-and-forget from the frontend's perspective — gameplay
never pauses waiting on them — so the SDK's more patient default retry
timing carries no UX cost here, the opposite tradeoff from Day 7's chat
decision. Same general principle (interactive vs. background call budgets),
applied to the specific constraints of a different feature.

## Catching an imprecisely-documented exception type

Rather than guess at a specific exception class name from unclear SDK docs
(a mistake already made once this project, with Gemini's exception types),
caught broadly (`except Exception`) at each endpoint with full logging —
an honest, explicit fallback when the precise type genuinely isn't
confidently known, rather than a lazy shortcut.

## Reducing Redis (or any database) call redundancy — the general toolkit

- **Debounce/throttle at the source** — wait for input to settle before
  firing a request, rather than reacting to every trigger (used for the
  name-availability check).
- **Cache reads with a short TTL, explicitly invalidated on write** — safe
  when reads vastly outnumber writes and small staleness is acceptable;
  critically, invalidate the cache the moment a real write happens, or a
  read immediately after an update can serve stale data — exactly the bug
  class this project already hit once with silently swallowed errors.
- **Push conditional logic into the database atomically** — e.g. Redis's
  `ZADD` supports a `GT` flag ("only write if greater"), collapsing a
  read-then-decide-then-write sequence into one atomic round trip and
  closing the small race-condition window between separate read and write
  calls. For more complex atomic logic, a Lua script run server-side is
  the standard, real-world answer.
- **Pipelining** — batch multiple *independent* commands into one network
  round trip (doesn't help when one command's result determines the next).
- **Write-behind/batching** — accumulate high-frequency, low-priority
  writes (like analytics counters) and flush periodically, rather than
  writing on every single event; not a fit for data that needs to reflect
  promptly, like a leaderboard.

Applied here: a short TTL cache with explicit invalidation on the
leaderboard read endpoint — real reduction in redundant calls, no
correctness tradeoff, matching the actual read/write ratio (visitors view
the board far more often than anyone sets a new high score). The atomic
`ZADD GT`/Lua-script approach was consciously not built, since the race
condition it would close has essentially zero real consequence at this
project's scale — same judgment applied to several earlier scope decisions.

## Self-verifying edits before presenting them

Following a direct question about rising error rates mid-session, adopted
a stricter discipline for precise file edits: apply proposed changes
programmatically against the actual uploaded file content (exact string
matching with assertions that a match occurs exactly once), check
structural balance (e.g. matching open/close tag counts), and only then
present the result — rather than presenting a diff reconstructed from
memory of a long conversation and trusting it was correct. Directly
addressed a real, named reliability concern rather than just promising to
"be more careful."