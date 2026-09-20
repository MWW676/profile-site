# Testing Project Devlog

14-day test-engineering build-out on `profile-site`. Separate from the build
project's `DEVLOG.md`, which also numbers its days 1–14.

---

## Day 1 — Risk-based analysis and test harness

**Date:** 2026-09-20

### Intent (logged before starting — shift-left)

No tests exist in either half. Enumerate every surface, rate the failure modes
by risk, and let that ranking decide what Days 2–5 cover. Then stand up the
minimum harness: `pytest.ini`, `tests/`, `conftest.py`, and smoke tests that
prove the app can be imported and served at all.

### What was built

- `backend/pytest.ini` — markers (`smoke`, `integration`, `slow`),
  `--strict-markers`, coverage scoped to `app`
- `backend/tests/conftest.py` — dummy environment variables injected in
  `pytest_configure`, shared `client` fixture
- `backend/tests/smoke_tests/` — 6 tests: app imports, `/health`, `/`,
  route registration, CORS allowed origins, CORS disallowed origin
- `docs/test-strategy.md` and `docs/risk-table.xlsx` — 72 risk rows

### Numbers for Day 14

| Metric | Value |
|---|---|
| Coverage baseline | **49%** |
| Statements | 300 |
| Missing | 154 |
| Tests | 6 |
| Risk rows | 72 |
| P1 rows | *(fill after the P1 cut)* |
| Assertions on business logic | 0 |

The 49% is entirely import-time execution — `def` statements, decorators,
constants, route declarations. `leaderboard.py` reads 45% with no test of its
own. Worth remembering as the clearest available illustration of what coverage
does and does not measure.

### Findings raised during analysis

| ID | Finding |
|---|---|
| BE-SCORE-01 | Anti-cheat sits inside `if previous is not None`, so a first submission under a fresh name accepts any score up to 100,000 |
| BE-BOOT-01 | `os.environ[...]` read at import time; app unimportable without full production config |
| BE-BOOT-03 | `CORS_ORIGINS` unset yields `[""]` — allows nothing, fails only in browsers, invisible to server-side tests |
| BE-HEALTH-01 | `/health` returns ok unconditionally; cannot fail while dependencies are down |
| BE-ADMDEL-02 | `zrem` on an absent member returns success anyway |
| BE-BOOT-04 | Chroma is per-instance local disk, re-ingested on every cold start |
| — | `.venv` tracked in git (17,925 files) — untracked this session |
| — | `app/rag/query_test.py` matched pytest's `*_test.py` glob — removed |

### Decisions

**Test environment bootstrapping.** Chose dummy environment variables in
`conftest.py` over refactoring the app to lazy initialisation. Reasoning:
production code stays untouched on day one, and the same values work locally,
in CI, and for anyone cloning the repo. The trade-off is that the import-time
coupling stays as a documented finding rather than being fixed.

**Working directory.** Tests run from `backend/`, matching the Dockerfile
(`WORKDIR /app`, `uvicorn app.main:app`). This resolves the `app` package
consistently and makes the CWD-relative paths in `chat.py` and the Chroma client
behave the same in tests as in production.

**Risk table format.** Started with a test-case inventory, then rebuilt it around
failure modes with likelihood and impact scored separately from six sub-factors.

### What went wrong

*(your notes — what cost time, what you'd do differently)*

- PyCharm's "add content roots to PYTHONPATH" made a broken test pass. Patched
  `backend.` onto every import to satisfy the IDE, which would have broken the
  container build, since `backend/` does not exist inside the image. Fixed by
  setting the run configuration's working directory instead. Rule taken away:
  when tooling cannot resolve an import, fix the tooling's path, not the source.

### Lessons

*(your words — this is the Day 14 material)*

1.
2.
3.

### Open for tomorrow

- Cut the P1 list to a workable Day 2–5 set and defend the cut line
- Add `("/api/admin/leaderboard", "DELETE")` to the route registration test
- Parametrize the CORS origin test; derive origins from `CORS_ORIGINS`
- Decide whether to stand up a second Upstash database for Day 4

---
