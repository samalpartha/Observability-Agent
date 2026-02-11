# Strategy to Win: Elasticsearch Agent Builder Hackathon

**Hackathon:** [Elasticsearch Agent Builder Hackathon](https://elasticsearch.devpost.com/) (Deadline: Feb 27, 2026)  
**Prize focus:** Technical Execution (30%), Potential Impact & Wow (30%), Demo (30%), Social (10%).

---

## 1. Alignment with requirements

| Requirement | How we meet it |
|-------------|----------------|
| **Multi-step AI agent** | Our copilot runs a deterministic multi-step workflow: scope → gather signals (logs, metrics, traces) → correlate → similar incidents → root cause → remediations. Each step uses tools (search, propose_fix) and validators. |
| **Use Agent Builder** (reasoning + tools) | We integrate with [Elastic Agent Builder](https://www.elastic.co/docs/explore-analyze/ai-features/elastic-agent-builder) via the [Kibana APIs](https://www.elastic.co/docs/explore-analyze/ai-features/agent-builder/kibana-api): optional "Chat with Agent Builder" mode calling `POST /api/agent_builder/converse`, and we expose our investigation as a **reliable action** (Create Case). |
| **Elastic Workflows / Search / ES|QL** | We use **Elasticsearch** (search + aggregations) for all evidence. We add a sample **Elastic Workflow** (YAML) for an observability step and document import into Kibana per [elastic/workflows](https://github.com/elastic/workflows). |
| **Real-world task** | **Problem:** Engineers waste time correlating logs, traces, and metrics to find root cause. **Solution:** One question → one run → summary, evidence tabs (Logs, Metrics, APM Traces, Alerts, Cases), confidence, deep links to Kibana/APM, and **Create Case** so the agent takes action. |
| **Open source** | Repo is public with an OSI-approved license. |

---

## 2. Positioning and narrative

**One-liner:**  
*"Observability Copilot: a multi-step AI agent that uses Elasticsearch and Kibana to run root-cause investigations and create Kibana Cases—from question to actionable case with one click."*

**Tracks we hit (from Devpost):**
- **Automate messy internal work:** Incident response and triage (observability).
- **Tool-driven agents:** Our agent uses tools (search logs, search traces, search metrics, find similar incidents, propose fix); we add a Kibana Cases API tool for "Create Case."
- **Narrow agent:** Built for observability (logs, metrics, traces, APM, alerts).
- **Let agents take reliable action:** **Create Case** in Kibana with summary, timeline bullets, evidence links, and suggested next steps.

---

## 3. Concrete technical strategy

### 3.1 Already in place (no pivot)

- **Elasticsearch:** All evidence from ES (logs, metrics, traces, incidents). Hybrid search, RRF, confidence scoring.
- **Connect Elastic Cloud:** UI for endpoint, Kibana URL, API key; Test/Save; 5 data sources (Logs, Metrics, APM Traces, Alerts, Cases).
- **Scope guardrails:** Service/env autocomplete (terms agg, env filtered by service); Analyze disabled until question + time + service + env.
- **Results shell:** Run header, tabs (Summary, Evidence, Timeline, Actions), Evidence sub-tabs with deep links to Kibana/APM.
- **History & Saved prompts:** Full scope, compare two runs, one-click Run.

### 3.2 Add for judging (Agent Builder + Wow action)

| Item | Action | Ref |
|------|--------|-----|
| **Agent Builder in the loop** | Add optional "Ask Agent Builder" path: call `POST ${KIBANA_URL}/api/agent_builder/converse` with `agent_id` and user question; show response in UI. Use same API key as connection. | [Kibana API](https://www.elastic.co/docs/explore-analyze/ai-features/agent-builder/kibana-api) |
| **Create Case (wow action)** | Button "Create Case" in run view: call Kibana Cases API to create a case with title, description (summary + timeline), and comment with evidence links. Agent "takes action" in Kibana. | Cases API (see below) |
| **One Elastic Workflow** | Add a YAML workflow (e.g. `workflows/observability/fetch-logs-and-metrics.yaml`) that runs an ES query for a service/time range. Document: "Import in Kibana → Management → Workflows." | [elastic/workflows](https://github.com/elastic/workflows) |

### 3.3 Kibana Cases API (Create Case)

- **Endpoint:** `POST /api/cases` (or internal Cases API). See [Kibana Cases](https://www.elastic.co/docs/explore-analyze/alerts-cases/configure-access-to-cases).
- **Payload (conceptually):** `title`, `description` (run summary + confidence), `tags` (service, env), and a comment with evidence links. This gives a clear "agent took action" story in the demo.

### 3.4 Elastic Workflow example (observability)

- One YAML file: trigger `manual`, one step `elasticsearch.search` or `elasticsearch.esql.query` for logs in a time window filtered by service. Import via Kibana UI or `POST /api/workflows` with the YAML. Mention in README and demo.

---

## 4. Demo script (for 3-min video)

1. **Problem (15 s):** "When something breaks, we jump between logs, traces, and metrics. It’s slow and easy to miss the root cause."
2. **Connect (20 s):** Show Connect Elastic Cloud: paste Elasticsearch URL, Kibana URL, API key → Test → Save. Data sources turn green.
3. **Run (45 s):** Enter question, service, env → Analyze. Show Results: Summary tab (confidence, bullets), Evidence tab (Logs, Metrics, APM Traces) with "Open in Kibana" links. Scroll to Actions.
4. **Wow action (40 s):** Click "Create Case." Case appears in Kibana with summary and evidence links. "The agent didn’t just answer—it created the case where the team works."
5. **Agent Builder (30 s):** Optional: show "Ask Agent Builder" or a second tab that sends the same question to an Agent Builder agent via the Kibana API and displays the reply.
6. **Outro (10 s):** "All on Elastic Cloud: one agent, multi-step, evidence-first, with a real action in Kibana."

---

## 5. Submission checklist

- [ ] **Description (~400 words):** Problem (observability noise), solution (multi-step agent, evidence, deep links, Create Case), 2–3 features/challenges (e.g. hybrid search + RRF, confidence scoring, Kibana deep links).
- [ ] **~3 min video:** Follow demo script above; show Connect, Run, Evidence tabs, Create Case, and optionally Agent Builder.
- [ ] **Public repo:** OSI license, README with architecture and "Elastic Agent Builder Hackathon" section, link to this strategy doc.
- [ ] **Social (extra points):** Post about the project and tag @elastic or @elastic_devs; add link in submission.

---

## 6. References

- [Elastic Agent Builder](https://www.elastic.co/docs/explore-analyze/ai-features/elastic-agent-builder) — framework, agents, tools, chat.
- [Work with Agent Builder using the APIs](https://www.elastic.co/docs/explore-analyze/ai-features/agent-builder/kibana-api) — Kibana REST API for tools, agents, converse.
- [Elastic Cloud Serverless](https://www.elastic.co/docs/deploy-manage/deploy/elastic-cloud/serverless) — deployment option.
- [elastic/workflows](https://github.com/elastic/workflows) — workflow YAML examples and import.
- [Hackathon rules & judging](https://elasticsearch.devpost.com/).
