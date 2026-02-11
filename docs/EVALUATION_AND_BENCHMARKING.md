# Evaluation and Benchmarking (Inspired by DevAgentBench)

This document adapts ideas from **"Benchmarking Autonomous Software Development Agents: Tasks, Metrics, and Failure Modes"** (Samal, Palus, Padmam) to our **Observability Copilot**—an agent that plans, gathers signals, and proposes root causes rather than editing code.

## 1. Why This Matters for Our Project

- **Our agent is autonomous in the observability domain:** given a goal (e.g. "Why is checkout slow?"), it plans (scope → gather → correlate → similar incidents → root cause → remediations), uses tools (Elasticsearch, Kibana APIs), and produces actionable output with minimal step-level human guidance.
- **Rigorous evaluation** helps us improve reliability, cost, and trust before production use.
- **A shared metric and failure taxonomy** makes it easier to compare runs, debug failures, and communicate with stakeholders.

We adopt the paper’s principles: **(i)** coverage across realistic task types, **(ii)** metrics that combine task success with reliability and operational cost, and **(iii)** a structured failure taxonomy for root-cause analysis.

## 2. Task Families for the Observability Copilot

Our “benchmark” can be organized into task families analogous to DevAgentBench:

| Family | Description | Success criterion |
|--------|-------------|-------------------|
| **Root cause identification** | User asks “why is X slow/broken?”; agent returns a root cause consistent with evidence. | Root cause text matches or is validated against known ground truth (or human audit). |
| **Evidence correlation** | Agent gathers logs, traces, metrics and links them correctly. | Findings include relevant evidence; links open correct Kibana/APM context. |
| **Remediation suggestion** | Agent proposes fixes (e.g. restart pod, scale DB). | Proposed actions are relevant and low-risk for the identified cause. |
| **Case creation (action)** | User clicks “Create Kibana Case”; agent creates a case with summary and evidence. | Case appears in Kibana with correct title, description, and links. |
| **Long-horizon / multi-service** | Question spans multiple services or time windows. | Agent maintains scope, does not drop context, and summarizes across services. |

These can be turned into concrete **scenarios** (e.g. “checkout latency spike with known DB pool exhaustion”) with expected root cause and evidence, then used for regression and A/B tests.

## 3. Three-Layer Metric Framework (Adapted)

We use a **three-layer** structure similar to the paper.

### Level 1: Core task metrics

| Metric | Definition | Unit | Use |
|--------|------------|------|-----|
| **Success rate** | Fraction of runs where the primary goal is achieved (correct root cause, valid evidence, case created). | % | Product, research |
| **Confidence calibration** | How well reported confidence matches human judgment or ground truth. | Correlation / ECE | Research |
| **Evidence relevance** | Fraction of evidence links that are relevant to the question and root cause. | % | Product |
| **Time to result** | Wall-clock time from request to first usable summary. | Seconds | Operations |
| **Step efficiency** | Number of tool calls (ES queries, LLM calls) per successful run. | Count | Cost, operations |

### Level 2: Reliability and robustness

| Metric | Definition | Unit | Use |
|--------|------------|------|-----|
| **Run-to-run variance** | Success-rate or confidence variance across runs with same question/scope. | %-points | Operations |
| **Recovery rate** | Fraction of runs that recover after a single transient failure (e.g. ES timeout, 429). | % | Operations |
| **Scope adherence** | Whether agent stays within requested service/env/time. | Pass/fail | Compliance |
| **Context dependency** | Change in success when context (e.g. time range or number of findings) is reduced. | %-points | Operations |

### Level 3: Operational and business

| Metric | Definition | Unit | Use |
|--------|------------|------|-----|
| **Token usage** | Average tokens per run (prompt + completion). | Count | Finance |
| **Cost per run** | Estimated cost from model pricing. | $ | Finance |
| **Kibana case creation rate** | Fraction of runs where user creates a case (proxy for usefulness). | % | Product |
| **Human oversight** | Manual corrections or re-runs needed before accepting the result. | Count | Product |

Aggregation can be **by task family** (e.g. root cause vs. case creation), **by service/env**, and **overall**, with reliability metrics reported as distributions where appropriate.

## 4. Failure Mode Taxonomy (Observability Agent)

We adapt the paper’s **nine failure categories** to observability-agent behavior.

| Category | Description | Example in our agent | Remediation |
|----------|-------------|----------------------|-------------|
| **1. Problem understanding** | Misinterprets the user’s question or scope. | Answers “why is payment slow?” with auth issues because of ambiguous wording. | Improve goal parsing; optional confirmation step. |
| **2. Planning / decomposition** | Fails to plan or adapt (e.g. missing steps, no pivot after errors). | Does not query traces when the issue is latency; repeats same failed ES query. | Structured planning; plan-review before execution. |
| **3. Context / memory** | Loses or misuses earlier context. | Drops service/env after many steps; links evidence for wrong service. | Stronger state tracking; periodic context summary. |
| **4. Tool usage** | Wrong or inefficient use of tools. | Wrong index/alias; misreads ES response; ignores errors. | Clear tool contracts; validation and retries. |
| **5. Partial change / regression** | Fixes one aspect but breaks or ignores another. | Correct root cause but wrong or risky remediation; suggests restart without checking impact. | Broader validation; test runs; diff/remediation review. |
| **6. Safety / security** | Introduces or ignores security issues. | Logs or case description leak PII; prompt injection in user input. | Sanitization; static checks; safe defaults. |
| **7. Flakiness** | Outcome varies across runs with same input. | Confidence or root cause text changes significantly run-to-run. | Determinism (e.g. seed); reduce timing/env dependence. |
| **8. Incomplete work** | Partial or generic output. | Generic “check your DB” with no evidence links; case created with empty description. | Stricter completeness checks; required evidence count. |
| **9. Infrastructure** | Failures due to environment, not reasoning. | ES/Kibana down; timeout; wrong API key. | Health checks; retries; clear error handling. |

Every **failed run** (e.g. wrong root cause, no evidence, case creation failed) can be labeled with one or more of these categories to drive debugging and roadmap (e.g. “most failures are tool usage → improve ES tool docs and validation”).

## 5. How We Use This Today

- **Confidence and validators:** We already use validators and confidence scoring (e.g. trace/log alignment, evidence count); these align with **Level 1** (task success) and **reliability** (consistent confidence).
- **Create Case:** Success of “Create Kibana Case” is a **Level 1 + Level 3** action metric (task success + business action).
- **Run history and compare:** Storing runs and comparing two runs in the UI supports **run-to-run variance** and **failure analysis** (assigning failure-mode labels in post-hoc review).
- **Dashboard APIs:** Investigations, service health, and findings feed a **operational view** (Level 3) and can be extended with cost or token metrics later.

## 6. Optional: Minimal Benchmark Suite (ObsAgentBench)

To go further, we could add a small **ObsAgentBench**:

1. **Scenario definitions** (YAML or JSON): question, service, env, time range, optional ground-truth root cause and expected evidence keys.
2. **Runner script:** For each scenario, call `POST /debug`, capture response, and optionally “Create Case.”
3. **Grading:** Compare root cause text (embedding similarity or keyword match), check presence of evidence links, and validate case creation.
4. **Reporting:** Success rate by scenario family, basic reliability (e.g. run twice and compare), and token/cost if we log them.

This would live under `benchmarks/` or `tests/benchmarks/` and could integrate with CI to catch regressions.

## 7. References

- Samal, P.S., Palus, S.K., Padmam, S.K., “Benchmarking Autonomous Software Development Agents: Tasks, Metrics, and Failure Modes,” (DevAgentBench / DevAgentEval), 2025–2026.
- Related: SWE-bench, OmniCode, Anthropic agent evals, industry reports (Deloitte, Bain) on agent deployment.

---

**Summary:** We adopt the paper’s **task–metric–failure** structure for our observability agent: define task families, measure task success + reliability + business metrics, and label failures with a taxonomy. That supports both immediate improvements (validators, confidence, Create Case) and a path to a minimal benchmark (ObsAgentBench) and reproducible evals.
