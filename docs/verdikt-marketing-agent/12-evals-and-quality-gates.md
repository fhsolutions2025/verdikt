# 12 — Evals & Quality Gates

**Audience:** AI Engineering, Product, Compliance · **Read after:** 06-prompts, 11-llm-config · **Read before:** 13-compliance

---

## 1. Why evals matter

Agent output is non-deterministic and the domain is regulated. Evals are the **quality gates** that decide whether an artifact may advance (to human approval, then publish), and the **regression guard** that prevents prompt/model/skill changes from degrading quality. Without evals, the system cannot be trusted to fan out autonomously or to change its own prompts/models safely.

**Principles:** every artifact is scored before human review; every prompt/model/skill change is regression-tested against golden datasets; compliance evals **fail closed**; thresholds are explicit and versioned.

## 2. Evaluation types

| Type | When | Who | Purpose |
|------|------|-----|---------|
| **Automated (inline)** | On every artifact, in-run | Reviewer/Compliance agents + deterministic checks | Gate progression |
| **Automated (offline)** | On prompt/model/skill change (CI) | Eval harness vs golden datasets | Regression detection |
| **Human (sampled)** | Periodic + high-risk always | Operator/Lead/Compliance | Calibrate auto-evals, final judgement |
| **Regression tests** | CI on change | Harness | Block merges that drop scores |
| **A/B (V1+)** | Live | Analytics | Real-world outcome validation |

## 3. Scoring model

- Each eval returns a **score 0–1** per dimension and an **overall**; gates compare to a **threshold**.
- Verdicts: `pass` (≥ threshold) · `regenerate` (below; bounded retries) · `escalate` (repeated/ambiguous) · `block` (compliance/safety).
- Scores stored on `ArtifactVersion` and `EvaluationRun`; visible in the canvas (03) before approval.

## 4. Eval catalogue

| ID | Eval | Method | Threshold | Gate |
|----|------|--------|-----------|------|
| E1 | Brand voice consistency | LLM-judge vs Brand Memory + rubric | ≥0.85 | Pre-review |
| E2 | Factual accuracy | LLM-judge + claim/citation check; placeholders flagged | ≥0.9; **no uncited stat** | Pre-review; **hard for PR/claims** |
| E3 | SEO quality | Deterministic (keyword/meta/structure) + LLM-judge | ≥0.8 | Pre-review (blog/landing) |
| E4 | Campaign completeness | Schema + rubric (goal/audience/channels/KPIs/graph) | ≥0.85 | Plan approval |
| E5 | Creative relevance | LLM-judge image↔brief/brand | ≥0.8 | Pre-review (creative) |
| E6 | Image prompt quality | Rubric (specificity/IP-safety/brand) + guard | ≥0.8 + guard pass | Before generation |
| E7 | Video prompt quality | Rubric (shotlist/duration/IP) | ≥0.8 | Before generation (V1) |
| E8 | Compliance safety | Rule-match + LLM-judge, **fail-closed** | recall ≥0.98 on red set | **Hard block** |
| E9 | Duplicate content | Similarity vs prior artifacts (embedding/shingle) | < 0.85 similarity | Pre-review |
| E10 | Hallucination detection | Claim extraction → support check | 0 unsupported high-risk claims | Pre-review; hard for claims |
| E11 | Publishing accuracy | Format/target/transform validation | 100% structural | Before publish/export |
| E12 | Analytics reasoning | Rubric (no fabricated metrics; causation discipline) | ≥0.8 | Advisory (V1) |
| E13 | Memory retrieval quality | Precision@k of injected context vs task | ≥0.8 | Offline + sampled |

## 5. Automated evals (inline)

- Run after generation, before `needs_review`: E1, E2, E3 (text); E5, E6 (creative); E9, E10 always; E8 (compliance) always and **last word**.
- Failing a non-compliance eval → bounded **regenerate** (≤2) with the eval's feedback injected; persistent fail → **escalate** to human.
- E8 failure → **block** (no auto-retry); requires resolution/human override (L5).

## 6. Human evals

- **Always human:** PR, paid spend, terms/offers, anything E8 flags `warn`/`block`, brand-voice changes.
- **Sampled:** a configurable % of auto-passed artifacts reviewed to calibrate auto-evals (detect drift between auto-score and human judgement).
- Human verdicts feed `agent_feedback` (reuse existing table) and recalibrate thresholds.

## 7. Regression tests & golden datasets

- **Golden datasets** per skill/agent: representative inputs + reference outputs/expected score bands + a **red set** (must-block examples for E8).
- On any change to a prompt version, model routing, or skill: run the offline harness; **block the change** if any golden score regresses beyond tolerance or any red-set item is not blocked.
- Datasets are versioned alongside prompts (06 §17); reuse the existing `app/api/agents/evals` harness pattern and `agent_configs` versioning.

## 8. Scoring rubrics (examples)

**E1 Brand voice (0–1):** tone match (0.3) · lexicon/do-don't adherence (0.3) · no forbidden phrasing (0.2) · channel-appropriateness (0.2). Any forbidden phrase (e.g. "risk-free", guaranteed win) caps at ≤0.4.

**E8 Compliance (fail-closed):** for each region rule → matched? severity? If any `high` severity match or any uncertainty → `block`. Score is informational; the **verdict** gates.

**E2 Factual:** every quantitative claim must be cited or marked `[PLACEHOLDER]`; uncited stat → automatic fail.

## 9. Thresholds & gating policy

| Gate | Requires |
|------|----------|
| Plan → execution | E4 ≥0.85 (+ approval) |
| Artifact → needs_review | E1/E3/E5 ≥ threshold, E9 pass, E10 pass |
| Artifact → approved | human approval + E8 pass/warn-with-justification |
| → publish/export | E8 pass + E11 pass + approval |

Thresholds are config (admin Settings) and **versioned**; raising a threshold triggers re-eval of in-flight artifacts.

## 10. Eval observability
- `EvaluationRun` records: eval id, target version, scores, verdict, model used, dataset version, timestamp.
- Canvas shows scores + verdicts per artifact; activity feed logs `eval.scored`.
- Dashboard: pass rates by eval, regeneration rate, human-vs-auto agreement, cost of evals.

## 11. Edge cases, risks, dependencies
- **Edge:** LLM-judge variance → low temperature, fixed judge prompt, ensemble or rubric anchoring for stability.
- **Edge:** judge gaming (artifact written to please judge) → keep judge rubric private; human sampling cross-checks.
- **Risk:** over-blocking (E8 too aggressive) → tune on red+green sets; measure precision; humans can override blocks with justification (audited).
- **Risk:** eval cost → cache eval runs on unchanged inputs; cheap models for deterministic checks.
- **Dependencies:** 06 (schemas), 11 (deterministic routing for judges), 13 (compliance rules), existing evals route + `agent_feedback`.

## 12. Acceptance criteria
- Every artifact carries eval scores + verdict before human review.
- No artifact reaches `approved`/publish without E8 pass (or audited L5 override).
- A prompt/model change that regresses a golden dataset or misses a red-set block is **rejected** by CI.
- Human-vs-auto agreement is tracked; thresholds are versioned and admin-editable.
