# BuzzU Repo Split Plan (World‑Class)

## Executive Summary
BuzzU will move from a monorepo into four production-grade repositories under the buzzu-p2p organization. Each repo will have clear ownership, independent CI/CD, and a shared-contracts package to guarantee compatibility. This plan follows best practices used by mature open-source projects: clear governance, explicit contribution paths, codified security reporting, rigorous quality gates, and transparent roadmaps.

## Goals and Non‑Goals

### Goals
- Decouple frontend, backend (Cloudflare Workers), and WASM into independent repos
- Stabilize cross‑repo interfaces via shared contracts and versioning
- Enable independent release cadence and CI/CD pipelines per repo
- Establish community governance, contribution flow, and quality standards

### Non‑Goals
- Redesign product features or UX
- Replace the current tech stack (Vite, React, Rust Workers, WASM)
- Expand scope beyond the required four repos

## Current Project Baseline (Monorepo Snapshot)

### Major Components Today
- Frontend web app: apps/web
- Cloudflare Workers: apps/signaling-worker, apps/matchmaker-worker, apps/reputation-worker
- WASM core + JS bridge: packages/wasm

### Architecture Characteristics
- Frontend consumes signaling, matchmaking, and reputation services
- WASM package provides crypto and networking helpers for the web client
- Cloudflare Workers are the backend control plane for signaling and reputation

## Target Repository Architecture

### Repository Map
| Repo | Responsibility | Source Path | Primary Runtime | Deployment |
|---|---|---|---|---|
| buzzu-frontend | UI, routing, PWA, client logic | apps/web | React + Vite | Cloudflare Pages |
| buzzu-backend | Signaling, matchmaking, reputation Workers | apps/signaling-worker, apps/matchmaker-worker, apps/reputation-worker | Rust + Workers | Cloudflare Workers |
| buzzu-wasm | Rust WASM core + JS bridge | packages/wasm | Rust + wasm-pack | npm/GitHub Packages |
| buzzu-shared-contracts | Shared types and protocol contracts | new extraction | TypeScript | npm/GitHub Packages |

### Target Repo Structure (Example)
```
buzzu-frontend/
  README.md
  CONTRIBUTING.md
  CODE_OF_CONDUCT.md
  SECURITY.md
  ROADMAP.md
  docs/
  src/
  e2e/
  .github/
    workflows/
    ISSUE_TEMPLATE/

buzzu-backend/
  README.md
  CONTRIBUTING.md
  CODE_OF_CONDUCT.md
  SECURITY.md
  ROADMAP.md
  workers/
    signaling/
    matchmaker/
    reputation/
  .github/
    workflows/
    ISSUE_TEMPLATE/
```

## Documentation and Governance Standards

### Required Top‑Level Documents (Each Repo)
- README.md with purpose, quick start, support links, and status badges
- CONTRIBUTING.md with contribution workflow and PR checklist
- CODE_OF_CONDUCT.md aligned to Contributor Covenant or CNCF/ASF equivalent
- SECURITY.md with vulnerability reporting process and supported versions
- ROADMAP.md with current focus, milestones, and release plan
- LICENSE with project license (current repo license: AGPL‑3.0 unless changed)

### Developer Experience Must‑Haves (Each Repo)
- One‑command local dev setup (documented)
- Clear environment variable list with defaults and examples
- Minimal, fast “hello world” path in README
- Troubleshooting section with top 5 common issues
- PR checklist aligned to CI checks and tests

### Recommended Organization‑Level Docs
- GOVERNANCE.md defining decision‑making and maintainer roles
- SUPPORT.md listing help channels and expected response times
- MAINTAINERS.md or OWNERS listing code owners and review responsibilities

## Branching and Release Strategy

### Branching Model
- main: always releasable, protected branch
- release/x.y: active release branches for hotfixes and patch backports
- feature/*: short‑lived feature branches

### Release Cadence
- Frontend: continuous delivery to Pages with tagged releases
- Backend: weekly or biweekly releases, emergency hotfixes from release branches
- WASM and Shared Contracts: semantic versioning with changelogs

### Example Release Flow
1. Merge PRs into main
2. Cut release/x.y branch
3. Run release CI
4. Tag vX.Y.Z
5. Publish artifacts and release notes

## Contribution Model

### Entry Points
- Good‑first‑issue labels for onboarding
- Issue templates that enforce reproducible steps and environment data
- PR templates with checklists and scope clarity

### First‑Time Contributor Flow (Checklist)
1. Clone repo and run one command to start dev
2. Confirm local build and tests pass
3. Pick a good‑first‑issue with clear acceptance criteria
4. Make changes and update docs/tests as needed
5. Open PR with checklist and link to issue

### Review Standards
- Two approvals for core changes, one approval for docs
- Mandatory CI green on lint, tests, and typecheck
- Security‑sensitive changes require maintainer approval

### Example PR Checklist
- [ ] Tests added or updated
- [ ] Docs updated (if behavior changes)
- [ ] Backward compatibility considered
- [ ] Security implications reviewed

## Issue and PR Templates

### Bug Report Template (Example)
```
Expected behavior:
Actual behavior:
Steps to reproduce:
Environment:
  - OS:
  - Browser/Runtime:
  - Version:
Logs/screenshots:
```

### Feature Request Template (Example)
```
Problem statement:
Proposed solution:
Alternatives considered:
Impact and risks:
```

## CI/CD and Quality Gates

### Frontend CI
- Lint/typecheck
- Unit tests
- E2E tests (Playwright)
- Build artifacts and preview deploy

### Backend CI
- cargo test
- worker build validation
- wrangler dry‑run or preview deploy

### WASM CI
- cargo test
- wasm-pack build
- package integrity checks

### Shared Contracts CI
- typecheck
- compatibility tests against frontend/backend

## Security Policy

### Reporting
- Dedicated security contact and private disclosure process
- Clearly documented response timeline and supported versions

### Supported Versions
- Define supported versions per repo and EOL policy
- Backport security fixes to active release branches

## Maintenance Procedures

### Triage and Support
- Weekly triage rotation
- Clear label taxonomy (bug, enhancement, security, priority)
- Response targets for new issues

### Dependency and Supply Chain
- Dependabot or Renovate configuration per repo
- Signed releases and checksums for WASM artifacts

## Roadmap (12‑Month)

### Phase 1: Foundations (Weeks 1‑4)
- Create repos in buzzu-p2p
- Extract frontend, backend, and wasm
- Establish shared contracts package

### Phase 2: Stabilization (Weeks 5‑8)
- Wire CI/CD for all repos
- Publish @buzzu/wasm and @buzzu/shared-contracts
- Update frontend and backend dependencies

### Phase 3: Governance and Quality (Weeks 9‑12)
- Add governance docs and maintainers list
- Define release cadence and version policy
- Standardize issue and PR templates

## Migration Plan

### Step‑By‑Step
1. Create repos and baseline documentation
2. Split code into repo roots
3. Publish shared contracts and WASM packages
4. Update frontend/backend to consume published packages
5. Deploy backend Workers
6. Deploy frontend Pages with new endpoints

### Rollback Strategy
- Keep monorepo as source of truth until all deploys succeed
- Tag stable releases for each repo before cutover

## Repository‑Specific Action Items

### buzzu-frontend
- Update package.json and remove workspace dependencies
- Configure Cloudflare Pages build and env vars
- Add API endpoint configuration via env vars

### buzzu-backend
- Standardize wrangler.toml across workers
- Document Durable Objects migrations and schemas
- Add deployment pipeline for each worker

### buzzu-wasm
- Establish published artifact versioning
- Document wasm-pack build and integration steps
- Provide compatibility matrix with frontend versions

### buzzu-shared-contracts
- Export signaling/matchmaking/reputation types
- Provide schema validation and versioned changelog

## Licensing
BuzzU currently declares AGPL‑3.0 at the monorepo level. All split repos must carry an explicit LICENSE file. Any license change should be decided once at the organization level and applied consistently across all repos.

## Success Criteria
- All repos build and deploy independently
- Frontend and backend interoperate via shared contracts
- CI green and release pipeline functioning per repo
- Clear governance and contribution flow for new contributors
