# Agentic Observability Copilot

An AI-powered observability assistant that correlates logs, traces, and metrics, retrieves similar past incidents, and proposes root causes and remediations with evidence links to Kibana/APM.

## Architecture

- **Elasticsearch** (Elastic Cloud): indices for logs, traces, metrics, and incidents with vector search
- **Hybrid retrieval**: lexical + vector search with RRF fusion
- **Agent**: deterministic workflow (scope → gather signals → correlate → similar incidents → root cause candidates → remediations) with validation and confidence scoring
- **Evidence links**: Kibana Discover, APM trace, Metrics dashboard URLs for every finding

## Repo layout

```
/app          - FastAPI app, config, auth
/ingest       - OTEL config, sample generator, log enricher
/elastic      - ES client, mappings, bootstrap, ingest pipelines
/retrieval    - embedder, hybrid query, rerank, evidence links, similar incidents
/agent        - tools, planner, validators, confidence
/playbooks    - runbooks, actions catalog
/api          - routes (debug, ingest), schemas
/ui           - minimal console (CLI)
/frontend     - Next.js web UI
/tests        - hybrid query, evidence, confidence, validators
```

## Setup

1. **Elastic Cloud**: Create a deployment; set `ELASTIC_CLOUD_ID` and `ELASTIC_API_KEY` (or `ELASTIC_URL` for non-Cloud).
2. **Environment**:
   ```bash
   cp .env.example .env
   # Edit ELASTIC_*, EMBEDDING_MODEL, OPENAI_API_KEY (for LiteLLM/agent)
   ```
3. **Install**: `pip install -r requirements.txt`
4. **Bootstrap indices**: On first run, the app ensures indices and aliases exist.
5. **Run**: `uvicorn app.main:app --reload`
6. **Optional**: Generate sample data: `python -m ingest.sample_app_generator`

## API

- `POST /debug` – question, service, env, time_range → findings, proposed fixes, confidence, evidence links
- `POST /ingest/incident` – add resolved incident to obs-incidents-current

## Frontend (Next.js)

```bash
cd frontend
cp .env.local.example .env.local   # set NEXT_PUBLIC_API_URL if backend not on :8765
npm install
npm run dev
```

Open http://localhost:3000 (or 3001). **Log in** with demo credentials, then enter a question and optional service/env; view findings, evidence links, root causes, and proposed fixes.

### UI/UX (UI/UX Pro Max)

Frontend UI/UX follows the **UI/UX Pro Max** skill and the project design system. Design system: `design-system/copilot-observability/MASTER.md`. Cursor rule: `.cursor/rules/ui-ux-pro.mdc` (applies to `frontend/**`). For new pages or design changes, use the skill workflow: design system first, then Next.js + Tailwind implementation and the pre-delivery checklist (contrast, cursor-pointer, transitions, a11y, responsive).

### Demo login

| Username | Password |
|----------|----------|
| **demo** | **demo123** |

Set `DEMO_USER` and `DEMO_PASSWORD` in backend `.env` to change (defaults: demo / demo123).

## Minimal UI (CLI)

```bash
python -m ui.minimal_console
```

Prompts for question and filters; prints findings, evidence links, fix recommendations, and confidence.

## Tests

```bash
pytest tests/ -v
```

## Tech stack

- **Backend**: FastAPI, LiteLLM (LLM), Elasticsearch, sentence-transformers (embeddings), hybrid search + RRF, rerankers
- **Agent**: Tools as pure functions; planner runs deterministic workflow; validators enforce citations and evidence count; confidence from rules (trace/log alignment, similar incident score, evidence count)

## Elastic Agent Builder Hackathon

This project is built for the [Elasticsearch Agent Builder Hackathon](https://elasticsearch.devpost.com/) (Feb 2026). It uses:

- **Elasticsearch** for logs, metrics, traces, and incidents (hybrid search, ES|QL-ready).
- **Multi-step agent**: scope → gather signals → correlate → similar incidents → root cause → remediations, with tools and confidence scoring.
- **Create Kibana Case**: from the **Actions** tab, **Create Case** creates an Observability case in Kibana with the run summary, root causes, and evidence links (Kibana Cases API).
- **Elastic Workflows**: sample workflow YAML in `workflows/observability/` (e.g. fetch logs for a service); import in Kibana under Management → Workflows.
- **Kibana deep links**: every finding links to Discover or APM; connection uses `KIBANA_URL` and optional `ELASTIC_SPACE_ID`.

See **docs/HACKATHON_STRATEGY.md** for judging alignment, demo script, and submission checklist. To enable Create Case, set `KIBANA_URL` and `ELASTIC_API_KEY` in backend `.env`.

## Evaluation and benchmarking

We apply evaluation principles from *Benchmarking Autonomous Software Development Agents* (DevAgentBench/DevAgentEval) to our observability agent: task families (root cause, evidence correlation, remediation, case creation), a three-layer metric framework (task success, reliability, operational cost), and a failure-mode taxonomy adapted for observability (problem understanding, planning, context, tool usage, partial change, safety, flakiness, incomplete work, infrastructure). See **docs/EVALUATION_AND_BENCHMARKING.md** for the full mapping and optional ObsAgentBench outline.
