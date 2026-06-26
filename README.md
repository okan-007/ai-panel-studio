# AI Panel Studio -- AI Driven Roundtable Discussion Studio

> Let AI experts engage in deep, multi-perspective dialogue on any topic you choose.

[![CI](https://github.com/ai-panel-studio/ai-panel-studio/actions/workflows/test.yml/badge.svg)](https://github.com/ai-panel-studio/ai-panel-studio/actions/workflows/test.yml)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

---

## Project Overview

AI Panel Studio is an AI-powered roundtable discussion studio. Users input a topic, and the system automatically:

1. **Generates an expert lineup** (1 host + N guests, each with name, title, stance, and color identity)
2. **Runs a multi-round structured discussion** driven by Deepseek's large language model
3. **Streams the transcript in real-time** via Server-Sent Events
4. **Extracts consensus and disagreement points** after each round
5. **Produces a final Markdown summary** of the entire discussion

---

## Project Architecture

```
ai-panel-studio/
├── client/                    # Frontend -- React 18 + Vite + TypeScript + Zustand
│   ├── src/
│   │   ├── pages/             #   HomePage, ConfirmLineupPage, StudioPage
│   │   ├── components/        #   discussion/, agent/, layout/, studio/
│   │   ├── stores/            #   Zustand: discussion, agent, transcript
│   │   ├── api/               #   REST client + SSE connection manager
│   │   ├── types/             #   Shared TypeScript type definitions
│   │   └── styles/            #   CSS Modules + design tokens
│   └── e2e/                   #   Playwright E2E tests (3 scenarios, 21 tests)
├── server/                    # Backend -- Node.js + Express + SQLite + SSE
│   └── src/
│       ├── index.ts           #   Express entry point (routes + discussion engine)
│       ├── db/
│       │   └── init.ts        #   Database initialization + 5 preset discussions
│       ├── schemas/           #   Zod Schema definitions (shared contract)
│       └── services/          #   Core business logic (TDD)
│           ├── guest-generation/     # Agent lineup generation (Deepseek + fallback)
│           ├── speech-scheduler/     # Speech ordering state machine
│           └── consensus-extractor/  # Consensus/clustering from speech text
├── docs/                      # Design & reference documentation
│   ├── PRD.md                 #   Product Requirements Document
│   ├── ERD.md                 #   Entity-Relationship Diagram
│   ├── architecture.md        #   System Architecture
│   └── api.md                 #   API Reference
├── .github/workflows/         # CI/CD pipeline (lint -> unit -> e2e)
├── .gitignore
├── .env.example               # Environment variable template
└── README.md
```

---

## Quick Start

### Prerequisites

- **Node.js** >= 20 (LTS)
- **npm** >= 9
- **Deepseek API Key** ([get one here](https://platform.deepseek.com/))

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/ai-panel-studio/ai-panel-studio.git
cd ai-panel-studio

# 2. Install all dependencies + Playwright browsers
npm run setup

# 3. Configure environment variables
cp .env.example .env
# Edit .env and set your DEEPSEEK_API_KEY

# 4. Initialize the database with preset discussions
cd server && npx tsx src/db/init.ts && cd ..

# 5. Start development servers (frontend + backend)
npm run dev
```

- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:3001
- **API Health Check**: http://localhost:3001/api/health

---

## Environment Variables

Create a `.env` file in the project root (copy from `.env.example`):

```bash
# Required: Deepseek API Key
DEEPSEEK_API_KEY=sk-your-api-key-here

# Optional: Customize configuration
DEEPSEEK_API_BASE=https://api.deepseek.com   # API base URL
DEEPSEEK_MODEL=deepseek-v4-pro               # Model to use
PORT=3001                                     # Server port
CORS_ORIGIN=http://localhost:5173             # Allowed frontend origin
DB_PATH=./data/ai-panel.db                    # SQLite file path
```

**Important**: Never commit `.env` to version control. It is excluded via `.gitignore`.

---

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start frontend + backend development servers |
| `npm run build` | Build frontend + backend for production |
| `npm run lint` | Run ESLint on server + client |
| `npm run test` | Run 64 backend unit tests (vitest) |
| `npm run test:coverage` | Unit tests with coverage report |
| `npm run test:e2e` | Run 21 E2E tests (Playwright) |
| `npm run test:e2e:ui` | E2E tests in visual debug mode |
| `npm run test:all` | Lint -> Unit tests -> E2E tests |
| `npm run test:ci` | CI pipeline: lint -> coverage -> e2e |
| `npm run clean` | Remove all build artifacts |

---

## Testing Strategy

### Layered Test Pyramid

```
           E2E                  21 tests  (Playwright)
          /    \                 3 scenarios
         /------\
        /  Unit  \              64 tests  (vitest)
       /----------\              3 service modules
      /  Schema    \            Zod schemas
     /--------------\
```

| Layer | Tool | Count | Location |
|-------|------|-------|----------|
| Schema Contracts | Zod | 9 schemas | `server/src/schemas/` |
| Unit Tests | vitest | **64** | `server/src/services/**/*.test.ts` |
| E2E Tests | Playwright | **21** | `client/e2e/*.spec.ts` |

### Running Tests

```bash
# Unit tests only
npm test

# Coverage report (thresholds: lines 80%, branches 75%, functions 80%)
npm run test:coverage

# E2E tests
npm run test:e2e
npm run test:e2e:ui      # Playwright UI mode for debugging

# Full pipeline
npm run test:all          # lint -> unit -> e2e
```

---

## CI/CD

GitHub Actions workflow (`.github/workflows/test.yml`):

```
push/PR -> lint (server+client) -> unit-test (vitest) -> e2e-test (Playwright) -> all-checks
```

- **Lint** -- ESLint strict mode on both server and client
- **Unit Test** -- vitest with coverage thresholds
- **E2E Test** -- Playwright Chromium, 3 scenarios
- Artifacts uploaded on failure: coverage report, Playwright report, traces

---

## API Overview

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/discussions` | List discussions (with pagination, filtering, search) |
| `POST` | `/api/discussions` | Create discussion (auto-generates agent lineup) |
| `GET` | `/api/discussions/:id` | Get full discussion detail |
| `DELETE` | `/api/discussions/:id` | Delete discussion |
| `POST` | `/api/discussions/:id/agents` | Configure / regenerate agent lineup |
| `POST` | `/api/discussions/:id/start` | Start the discussion |
| `POST` | `/api/discussions/:id/pause` | Pause running discussion |
| `POST` | `/api/discussions/:id/resume` | Resume paused discussion |
| `POST` | `/api/discussions/:id/stop` | Stop discussion |
| `POST` | `/api/discussions/:id/next-round` | Advance to next round |
| `GET` | `/api/discussions/:id/events` | **SSE real-time event stream** |
| `GET` | `/api/discussions/:id/transcript` | Get transcript messages |
| `GET` | `/api/discussions/:id/messages` | Alias for transcript |
| `GET` | `/api/discussions/:id/consensus` | Get consensus/disagreement items |
| `POST` | `/api/discussions/:id/summarize` | Generate discussion summary |
| `GET` | `/api/discussions/:id/summaries` | Get existing summaries |
| `POST` | `/api/discussions/generate-lineup` | Generate lineup without creating discussion |
| `GET` | `/api/agent-templates` | List preset agent templates |
| `GET` | `/api/health` | Health check (uptime + SSE client count) |

Full API documentation: [docs/api.md](./docs/api.md)

---

## Discussion State Machine

```
draft -> ready -> running <--> paused
                    |
                    v
              completed / stopped
```

- **draft**: Created but no agents configured
- **ready**: Agents configured, ready to start
- **running**: Discussion engine active, SSE streaming
- **paused**: Temporarily halted (can resume)
- **completed**: Finished naturally (all rounds done)
- **stopped**: Terminated by user

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend Framework | React | 18.3 |
| Build Tool | Vite | 5.4 |
| Language | TypeScript | 5.6 |
| State Management | Zustand | 4.5 |
| Routing | React Router | 6.26 |
| Styling | CSS Modules | - |
| Backend Runtime | Node.js | 20 LTS |
| HTTP Framework | Express | 4.21 |
| Database | SQLite (better-sqlite3) | 11.7 |
| Real-time | Server-Sent Events (SSE) | - |
| AI Model | Deepseek V4 Pro | - |
| Data Validation | Zod | 3.23 |
| Unit Testing | vitest | 2.1 |
| E2E Testing | Playwright | 1.46 |
| CI/CD | GitHub Actions | - |

---

## Development Phases

| Phase | Content | Status |
|-------|---------|--------|
| **SDD** | Requirements analysis, database design, API contracts | Completed |
| **DDD** | UI/UX design, component tree, interaction logic | Completed |
| **TDD** | 3 modules x 64 unit tests + implementation | Completed |
| **E2E** | 3 scenarios x 21 end-to-end tests | Completed |
| **Implementation** | Full-stack page development | Completed |
| **Documentation** | PRD, ERD, Architecture, API docs | Completed |

---

## Completed Capabilities

- Full discussion lifecycle: create -> lineup -> start -> run -> summarize
- AI-generated expert lineups via Deepseek API with deterministic fallback
- Multi-round discussion engine with speech scheduling state machine
- Real-time SSE streaming with incremental transcript updates
- Consensus extraction after each round (agreed / contested / proposed)
- Pause / resume / stop discussion controls
- Independent discussion isolation (parallel discussions don't interfere)
- SSE auto-reconnection with exponential backoff
- Responsive layout (Desktop / Tablet / Mobile)
- 64 unit tests + 21 E2E tests
- CI/CD pipeline with GitHub Actions

## Future Improvements

- [ ] User authentication (OAuth 2.0)
- [ ] Persistent database (PostgreSQL) for production
- [ ] Discussion replay / playback feature
- [ ] Voice synthesis (TTS) for expert speeches
- [ ] Custom agent template marketplace
- [ ] Multi-language support (i18n)
- [ ] Discussion export (PDF, Markdown, SRT)
- [ ] Real-time audience interaction (voting, questions)
- [ ] Docker containerization
- [ ] Monitoring and observability (Prometheus + Grafana)

---

## Documentation

- [Product Requirements (PRD)](./docs/PRD.md) -- User flows, features, success metrics
- [Entity-Relationship Diagram (ERD)](./docs/ERD.md) -- Database schema design
- [System Architecture](./docs/architecture.md) -- Component architecture + data flow
- [API Reference](./docs/api.md) -- Complete REST API documentation

---

Built with passion by the AI Panel Studio Team
