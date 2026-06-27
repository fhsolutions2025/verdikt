# 13 — Guardrails & Compliance

**Audience:** Compliance, Legal, AI Engineering, Product · **Read after:** 12-evals · **Read before:** 14-tech-arch

---

## 1. Overview

Verdikt markets a prediction-market / iGaming product across many jurisdictions with **materially different** advertising law. Compliance is therefore a **configurable, per-region engine** (P6), not a fixed ruleset. The engine decides, per artifact and per region: the **product framing** (regulated gambling vs skill/prediction-market vs restricted/blocked) and the **hard content rules**. The **Compliance Agent** (05) enforces it, **fails closed** (12 E8), and can **block**; only a human (L5) may override a block, with audited justification.

Defence in depth: prompt-level forbidden clauses (06) + runtime guardrails (PII/injection, reuse `app/api/chat/[agent]/route.ts`) + the region compliance engine + mandatory approval gates + audit (14).

## 2. ComplianceRegion model

A region is a configurable ruleset (`mkt_compliance_regions`):

```json
{
  "region": "NG",
  "framing": "regulated_gambling",         // regulated_gambling | prediction_market | restricted | blocked
  "min_age": 18,
  "license_disclosure": "required",        // required | optional | none
  "responsible_gaming": "mandatory",       // mandatory | recommended | none
  "rules": {
    "gambling_claims": {"guarantees":"block","risk_free":"block","easy_money":"block"},
    "bonus_promotion": {"allowed": true, "terms_required": true},
    "financial_claims": {"investment_framing":"block","returns_promise":"block"},
    "medical_claims": "block",
    "political_content": "block",
    "targeting_minors": "block",
    "celebrity_likeness": "block"
  },
  "platform_policy_pack": ["meta_gambling", "google_gambling", "x_ads"],
  "mandatory_disclaimers": ["18+", "Play responsibly", "T&Cs apply"],
  "human_approval": "required_for_all"      // required_for_all | required_high_risk | standard
}
```

- **framing = blocked** → no marketing may be generated/published for that region.
- **framing = restricted** → only specific content types; everything human-approved.
- Rules map a pattern/category → action: `allow | warn | block`.
- Regions are **data**, admin-editable in Settings, **versioned** (changes re-eval in-flight artifacts).

## 3. Guardrail categories (each per-region)

### 3.1 Brand safety
- No content damaging brand/users; no hate, harassment, illegal activity.
- Action: `block` globally; `warn` for borderline tone.

### 3.2 Copyright & IP
- No real logos, team/brand marks, celebrity likeness, copyrighted characters in creatives (reuse `lib/promptGuard.ts`).
- Action: image/video guard **hard block**; text claims referencing IP → `warn`/`block` per region.

### 3.3 Defamation
- No false/derogatory statements about people or competitors.
- Action: `block` on unverified negative claims about named entities.

### 3.4 Competitor claims
- No misleading/unverifiable comparative claims ("better odds than X").
- Action: `block` comparative claims without substantiation; `warn` on naming competitors.

### 3.5 Gambling & betting claims (core)
- **Block:** guarantees of winning, "risk-free", "easy money", "can't lose", chasing-losses encouragement, targeting self-excluded/minors.
- **Require (per region):** age statement, responsible-gaming message, T&Cs for bonuses, license disclosure.
- Action: per region `rules.gambling_claims`; mandatory disclaimers injected.

### 3.6 Financial claims
- For finance/prediction markets: **block** investment framing, guaranteed returns, "passive income".
- Action: `block` per `rules.financial_claims`; clarify "not investment advice" where required.

### 3.7 Medical claims
- No health/addiction-cure claims. Action: `block`.

### 3.8 Political content
- No political endorsement/electioneering in ads. Action: per region (often `block`).

### 3.9 Age-restricted content
- Enforce `min_age`; no minor-appealing imagery/language; age-gate messaging.
- Action: `block` minor-targeting; inject age statement.

### 3.10 Regional compliance
- The region ruleset is authoritative; the same artifact may `pass` in one region and `block` in another → localisation (S16) or region-specific variants.

### 3.11 Platform policy compliance
- Apply `platform_policy_pack` (Meta/Google/X gambling-ad policies) before publishing to that channel.
- Action: `block` channel publish if the artifact violates that platform's policy, even if region-legal.

## 4. Enforcement flow

```
Artifact generated
  → runtime guardrails (PII strip, injection check)   [hard]
  → IP guard for creatives (promptGuard)              [hard]
  → Compliance Agent: region rules + platform pack     [E8, fail-closed]
       pass  → eligible for approval
       warn  → eligible for approval WITH human sign-off + note
       block → BLOCKED: cannot approve/publish; human L5 override only, audited
  → human approval gate (per region human_approval policy)
  → publish/export only if pass/warn-justified AND approved
```

## 5. Human approval requirements

| Region policy | Effect |
|---------------|--------|
| `required_for_all` | Every artifact needs human approval (e.g. strict gambling regions) |
| `required_high_risk` | PR, paid, offers/claims, warn/block items need human; low-risk may auto-approve within policy |
| `standard` | Low-risk auto-approvable; publish always gated |

**Always human, regardless of region:** PR; paid-ad spend; offers/terms; any `warn`/`block`; brand-voice changes; compliance-block overrides.

## 6. Escalation rules
- **Ambiguous legality** → Compliance blocks + escalates to Compliance Officer (never auto-pass).
- **Region not configured** → treat as `blocked` (fail-closed); prompt admin to configure.
- **Override of a block** → requires L5 + written justification; recorded immutably (Approval Memory + AuditLog); flagged for periodic review.
- **Repeated blocks on a campaign** → pause campaign branch + notify Lead/Compliance.

## 7. Auditability
- Every compliance check, verdict, disclaimer injection, approval, and override is logged (AuditLog + Approval Memory) with actor, artifact version, region, rule, and justification.
- Compliance results are immutable on the `ArtifactVersion`.

## 8. MVP scope
- Core engine + 2–3 seeded regions (e.g. a strict `regulated_gambling`, a `prediction_market`, a `blocked`).
- Hard checks: gambling/financial guarantee language, minor-targeting, IP guard, PII/injection, mandatory disclaimers, fail-closed on unconfigured region.
- Platform-policy packs and full per-region rule libraries expand in V1+.

## 9. Edge cases, risks, dependencies
- **Edge:** multi-region campaign → generate region variants; never publish one region's artifact to another without re-check.
- **Edge:** disclaimer truncation on a length-limited channel → block publish if mandatory disclaimer cannot fit; require redesign.
- **Edge:** operator edits an approved artifact → re-run compliance on the new version (approval does not transfer across versions).
- **Risk:** under-blocking (legal exposure) → fail-closed + human gates + audit; recall-optimised red set (12 E8 ≥0.98).
- **Risk:** over-blocking (productivity) → tune precision; auditable human override.
- **Dependencies:** 12 (E8), 06 (Compliance prompt), existing PII/injection guardrails, `lib/promptGuard.ts`, AuditLog, `mkt_compliance_regions`.

## 10. Acceptance criteria
- No artifact publishes/exports without a region-scoped compliance `pass` (or audited L5 override of a `warn`).
- Unconfigured region ⇒ blocked (fail-closed).
- Mandatory disclaimers are present (or publish blocked) per region.
- Every compliance decision and override is immutably audited.
- IP/PII/injection guards run on every relevant artifact.
