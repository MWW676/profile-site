# Test Strategy — profile-site

**Status:** Day 1 of 14 · **Last updated:** 2026-09-20 · **Revisit:** Day 13

---

## 1. Purpose and scope

This project adds automated testing to a codebase that had none. This document
records *how* test scope was decided, so the decisions can be challenged rather
than just inherited.

In scope: the FastAPI backend, the MCP resume server, and the Next.js frontend.
Exclusions are listed in section 7, with reasons.

The full risk register (72 rows) lives in `docs/risk-table.xlsx`. It is kept
there rather than duplicated here so there is one version of record. This
document holds the method, the ranking, and the scope decisions.

---

## 2. How scope was decided

Scope is risk-based, not coverage-based. Every surface is decomposed through
five lenses, each failure mode is scored, and the ranking determines test order.

### The five lenses

| Lens | The question | Failure it catches |
|---|---|---|
| Correctness | With valid input, is the output right? | silent wrong answers |
| Boundary | What happens at the edges of valid input? | crashes, or bad data accepted |
| Dependency | What happens when something external fails? | unhandled errors, hangs |
| State | What persists, and can it go stale, leak, or race? | staleness, concurrency, leakage |
| Access | Who can reach this, and what enforces it? | unauthorised action |

A surface with rows under only one or two lenses is under-analysed, not low-risk.

### Scoring

Risk = Likelihood × Impact. Neither is rated by feel; each derives from three
sub-factors recorded in the register.

```
L = MIN(Reachability, MAX(Exposure, Control))
I = MAX(Blast radius, Recoverability, Detectability)
```

Reachability *caps* likelihood rather than setting a floor. Without that, every
public route scores L=3 and likelihood stops discriminating.

**Bands:** 6–9 = P1 (cover by Day 5) · 3–4 = P2 (if time allows) · 1–2 = P3
(accepted, documented).

Detectability is the sub-factor that makes correctness rows score properly. A
wrong answer nobody can see is worse than a crash everybody sees.

### Rules

1. One row, one failure mode.
2. Rate L and I independently.
3. Never assume a control exists — cite the line, or rate as though absent.
4. An existing control lowers likelihood but does not remove the row; regression
   risk is why the test exists.
5. Expected behaviour is the assertion. A question mark there means unresolved.

---

## 3. Test tiers

Fidelity and trigger cadence move together. Which tier a test belongs to is a
scope decision, not a style preference.

| Tier | Dependencies | Trigger | Blocks deploy |
|---|---|---|---|
| Unit | faked | every commit | yes |
| Integration | real, isolated instance | every PR | yes |
| E2E | real, full stack | pre/post deploy | yes |
| RAG eval | real Gemini | nightly | no |
| Production monitoring | real production | continuous | n/a |

**Open decision (Day 4):** integration tests need a Redis instance that is not
production. A second Upstash database on the free tier would let Days 4–5 run
against the real REST API with no blast radius. Until that is resolved those
tests use fakes, and the compromise is recorded here.

Mocks are reserved for states that cannot be reached otherwise — forcing a
timeout, a quota error, a malformed upstream response. They are not a substitute
for exercising a real dependency.

---

## 4. Environment and test data

| Environment | Config source |
|---|---|
| Local | `.env` via `load_dotenv()` |
| CI | dummy values set in `tests/conftest.py` |
| Cloud Run | platform-injected secrets |

Dummy values live in `conftest.py` so behaviour is identical on a developer
machine, in CI, and for anyone cloning the repo. Real credentials never appear
in the repository.

Dummy credentials suffice because constructing a client makes no network call;
only invocation does. Tests that must exercise a real dependency do so against
an isolated instance, never production.

**Known gap:** `conftest.py` only fills variables that are absent, so an exported
shell variable takes precedence. A developer with production credentials in their
environment will run tests against production. Accepted for now.

---

## 5. Ranked P1 set

The highest-scoring rows. The full register carries the rest.

| Risk | ID | Failure |
|---|---|---|
| 9 | BE-LOGIN-01 | Admin login has no throttle, lockout, or failed-attempt logging |
| 9 | BE-LOGIN-02 | Admin token is deterministic and never expires |
| 9 | BE-SCORE-01 | Anti-cheat gate skipped entirely on a first submission |
| 9 | BE-SCORE-03 | A lower score can silently overwrite a better one |
| 9 | BE-SCORE-04 | A write reports success without reaching Redis |
| 9 | BE-LB-01 | Leaderboard returned in the wrong order, with a 200 |
| 9 | BE-CHAT-01 | Prompt injection overrides the RAG system prompt |
| 9 | BE-CHAT-03 | Answers not grounded in retrieved context |
| 9 | BE-HEALTH-01 | Health check cannot fail |
| 9 | BE-BOOT-01 | Import-time environment coupling |
| 9 | BE-BOOT-03 | `CORS_ORIGINS` unset yields an allowlist of one empty string |
| 9 | FE-ADMIN-02 | Admin token readable from JavaScript |
| 9 | FE-CFG-01 | API base URL inlined at build time with a production fallback |
| 9 | FE-PLAY-03 | Submitted score differs from displayed score |
| 6 | BE-ADMCLR-01 | Unauthenticated full leaderboard wipe |

Several are **findings rather than failing tests** — the control does not exist,
so the test documents its absence and the fix is separate work. Track which is
which; it matters for Day 3 bug reports and Day 14 numbers.

---

## 6. Baseline

Measured Day 1, before any behavioural test existed.

| Metric | Value |
|---|---|
| Statements | 300 |
| Missing | 154 |
| Coverage | 49% |
| Tests | 6 |
| Assertions on business logic | 0 |

**The 49% is misleading, and that is the point.** Importing a module executes
every `def`, decorator, constant and route declaration, so a file scores well
before a single function is called. `leaderboard.py` sits at 45% with no test of
its own. Coverage measures execution, never verification — which is why Day 13
uses mutation testing to ask the question coverage cannot answer.

---

## 7. Out of scope

**Three.js particle rendering fidelity** — no deterministic oracle. Output
depends on GPU, driver and frame timing, so assertions would be trivial or
flaky. Covered indirectly by FE-RENDER-01 and FE-DEP-03.

**MediaPipe hand-detection accuracy** — a third-party model, not project code,
and not something this project can change. Our handling of its permission and
load failures is covered by FE-PLAY-01 and FE-PLAY-02.

**Gemini generation quality as such** — non-deterministic; fluency cannot be
pinned to an expected value. BE-CHAT-01 and BE-CHAT-03 cover injection
resistance and grounding, which are assertable against a fixed eval set.

**Cloud Run deployment and infrastructure** — no staging environment, so
deployment behaviour cannot be exercised without affecting production. Day 7
covers the CI gate that precedes deployment, not the deployment itself.

**Load and performance testing** — single-user portfolio site, no representative
traffic profile, no safe environment to generate load against.

**Visual regression testing** — no baseline, and the design is still changing.
Screenshot diffs would produce noise rather than signal.

> **Declared contradiction.** BE-LOGIN-01 and BE-CHAT-02 are P1 abuse risks whose
> consequences are load-shaped, while load testing is out of scope. This is
> deliberate: both are tested as absence-of-control assertions at unit level and
> filed as defects. Demonstrating that a control is missing does not require
> generating the load that would exploit it. Adding throttling would change this
> decision — revisit on Day 13.

---

## 8. Revision log

| Date | Change |
|---|---|
| Day 1 | Initial version. 72 rows, rubric established, baseline recorded. |
| Day 13 | *(pending — re-rate against what was actually found)* |
