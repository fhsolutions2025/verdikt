# 07 — Skills Library

**Audience:** AI Engineering, Product · **Read after:** 06-prompts · **Read before:** 08-tools, 09-workflows

---

## 1. What a skill is

A **skill** is a reusable, model-driven capability with a defined contract. Skills are the verbs the agents (05) use; workflows (09) compose skills into end-to-end processes. A skill is **not** a tool (08): a tool is an external integration; a skill is a capability that may *use* tools.

**Skill contract:** `Description · Trigger conditions · Required inputs · Process · Output format · Quality checklist · Failure cases · Evaluation criteria.`

Each skill maps to a primary agent and a set of allowed tools, and its output is always a versioned artifact or a memory record.

## 2. Skill registry (index)

| # | Skill | Primary agent | Tools | Produces |
|---|-------|---------------|-------|----------|
| S1 | Brand analysis | Research/Learning | web_search | Brand Memory |
| S2 | Competitor research | Research | web_search, meta_ads_library | Research artifact |
| S3 | Market research | Research | web_search, trends | Research artifact |
| S4 | Trend detection | Research | google_trends, web_search | Trend list |
| S5 | Campaign planning | Campaign Planner | (research) | Plan artifact |
| S6 | Offer creation | Copywriter | — | Offer artifact |
| S7 | Copywriting | Copywriter | — | Copy artifact |
| S8 | SEO writing | SEO+Copywriter | seo_keyword_tool | Optimised copy |
| S9 | Blog writing | Copywriter | — | Blog artifact |
| S10 | Social media writing | Copywriter | — | Social artifacts |
| S11 | Email writing | Copywriter | — | Email artifact |
| S12 | Landing page writing | Copywriter | — | Landing copy |
| S13 | Image prompt engineering | Image Gen | image_generation | Image artifact |
| S14 | Video prompt engineering | Video Gen | video_generation | Video artifact |
| S15 | Creative direction | Creative Director | — | Creative brief |
| S16 | Localization | Copywriter | — | Localized artifact |
| S17 | Translation | Copywriter | — | Translated artifact |
| S18 | Compliance review | Compliance | — | Compliance result |
| S19 | Publishing | Publisher | channel tools | Publish/export receipt |
| S20 | Performance analysis | Analytics | analytics_provider | Insight artifact |
| S21 | A/B testing | Analytics/Copywriter | analytics_provider | Variant + test plan |
| S22 | Learning from results | Learning | — | Learning Memory |

---

## 3. Skill specifications

### S1 — Brand analysis
- **Description:** Distil a brand into voice, positioning, do/don't, and visual identity.
- **Triggers:** Brand onboarding; brand-voice drift detected.
- **Inputs:** Brand kit, sample approved content, competitor positioning, region(s).
- **Process:** Ingest → extract tone/lexicon/values → summarise positioning → produce Brand Memory record.
- **Output:** Brand Memory (voice rules, lexicon, do/don't, palette tokens).
- **Quality checklist:** Voice is specific (not generic); do/don't actionable; lexicon present.
- **Failure cases:** Sparse inputs → produce partial with flagged gaps, not invented voice.
- **Eval:** Brand-voice eval downstream improves vs baseline; human accepts ≥80%.

### S2 — Competitor research
- **Description:** Map competitor positioning, offers, creatives, and messaging.
- **Triggers:** Campaign planning; quarterly refresh.
- **Inputs:** Competitor list, region, channels.
- **Process:** Search + ads-library scan → extract offers/claims/creative styles → matrix + gaps.
- **Output:** Competitor matrix artifact (per competitor: positioning, offers, notable creative, claims).
- **Quality checklist:** Each row cited; gaps/opportunities identified.
- **Failure cases:** Blocked sources → note coverage gaps.
- **Eval:** Research usefulness rubric ≥0.8; citations present.

### S3 — Market research
- **Description:** Audience, demand, and category landscape analysis.
- **Inputs:** Topic, region, audience hypotheses.
- **Process:** Search + trends → audience insights, demand signals, seasonality.
- **Output:** Research artifact (audience insights, demand, risks).
- **Quality checklist:** Region-specific; cited; actionable.
- **Failure/Eval:** As S2.

### S4 — Trend detection
- **Description:** Surface timely topics/hashtags/events to ride.
- **Triggers:** Scheduled; campaign kickoff.
- **Inputs:** Category, region, time window.
- **Process:** Trends + search → ranked trend list with relevance + decay estimate.
- **Output:** Trend list (term, momentum, relevance, suggested angle).
- **Quality checklist:** Freshness; relevance to brand; not stale.
- **Eval:** Human relevance ≥0.8; recency verified.

### S5 — Campaign planning
- **Description:** Brief → executable strategy + task graph + schedule + KPIs.
- **Inputs:** Brief, brand/competitor memory, budget, region.
- **Process:** See 06 §4. Decompose into tasks with dependencies.
- **Output:** Plan artifact.
- **Quality checklist:** Goal/audience/channels/KPIs present; budget realistic; graph acyclic.
- **Failure cases:** Missing brief fields → return needs[].
- **Eval:** Campaign-completeness eval (12) ≥0.85.

### S6 — Offer creation
- **Description:** Craft a compliant promotional offer (bonus, contest) and terms summary.
- **Inputs:** Goal, region rules, budget, audience.
- **Process:** Generate offer + headline + key terms; flag region-restricted mechanics.
- **Output:** Offer artifact (offer, headline, terms summary, compliance flags).
- **Quality checklist:** Terms clear; region-legal; no prohibited inducements.
- **Failure cases:** Region prohibits offer type → refuse with reason.
- **Eval:** Compliance pass mandatory; clarity rubric.

### S7 — Copywriting
- **Description:** General persuasive copy on-brand.
- **Inputs:** Format, brief, brand voice, region.
- **Process:** Draft → self-check voice + claims → mark factual placeholders.
- **Output:** Copy artifact (per 06 §7).
- **Quality checklist:** Voice match; no guarantees; CTA present; length within limits.
- **Failure cases:** Risky claim → defer to Compliance; missing voice → request.
- **Eval:** Brand-voice ≥0.85; compliance pass.

### S8 — SEO writing
- **Description:** Copy optimised for target keywords without stuffing.
- **Inputs:** Keyword map (S8/SEO), brief, region.
- **Process:** Integrate primary/secondary keywords naturally; meta + headings.
- **Output:** Optimised copy + meta.
- **Quality checklist:** Keyword in title/H2/intro; density natural; meta within limits.
- **Failure cases:** Keyword tool down → heuristic + flag.
- **Eval:** SEO-quality eval ≥0.8.

### S9 — Blog writing
- **Description:** Long-form article with structure, meta, internal links.
- **Inputs:** Outline (SEO), brief, voice, region.
- **Process:** Expand outline → sections → CTA → meta; mark facts as placeholders.
- **Output:** Blog artifact (title, body_markdown, summary, meta, placeholders).
- **Quality checklist:** Logical structure; scannable; no fabricated stats; CTA.
- **Failure cases:** Topic too thin → request angle.
- **Eval:** SEO + clarity + brand-voice; duplicate-content check.

### S10 — Social media writing
- **Description:** Platform-native posts (caption, hashtags, media hint) per channel.
- **Inputs:** Campaign, platforms[], voice, trends.
- **Process:** Per platform: native format, length, tone, hashtags, media hint.
- **Output:** One social artifact per platform.
- **Quality checklist:** Platform length/tone; hashtags relevant; CTA; on-brand.
- **Failure cases:** Platform policy conflict → defer to Compliance.
- **Eval:** Platform-policy pass; engagement-intent rubric.

### S11 — Email writing
- **Description:** Lifecycle/campaign email (subject, preview, body, CTA).
- **Inputs:** Segment, goal, voice, region (consent rules).
- **Process:** Subject A/B options → body → CTA; consent/footer compliance.
- **Output:** Email artifact.
- **Quality checklist:** Subject ≤ limit; preview present; unsubscribe/consent; personalised.
- **Failure/Eval:** Anti-spam/consent pass; open-intent rubric.

### S12 — Landing page writing
- **Description:** Conversion-focused landing copy (hero, benefits, proof, CTA, FAQ).
- **Inputs:** Offer, audience, voice, region.
- **Process:** Hero → value → proof → CTA → FAQ; claims controlled.
- **Output:** Landing copy artifact (sectioned).
- **Quality checklist:** Single clear CTA; benefits concrete; compliant claims.
- **Eval:** Clarity + compliance.

### S13 — Image prompt engineering
- **Description:** Brief → IP-safe provider prompt → generate → re-host.
- **Inputs:** Image brief, aspect, style, brand kit.
- **Process:** Compose prompt → IP guard (`lib/promptGuard.ts`) → `ideogram-proxy` → re-host to Storage → alt/SEO.
- **Output:** Image artifact (url, prompt, alt, tags, dimensions).
- **Quality checklist:** IP-safe; on-brand palette; correct dimensions; alt present.
- **Failure cases:** Guard trip → rewrite; provider error → fallback/placeholder.
- **Eval:** Image-prompt-quality + creative-relevance.

### S14 — Video prompt engineering (V1+)
- **Description:** Brief → video prompt + shotlist → generate.
- **Inputs:** Video brief, duration, aspect, brand kit.
- **Process:** Prompt + shotlist → provider → thumbnail; cost gate.
- **Output:** Video artifact.
- **Quality/Eval:** Video-prompt-quality; cost within gate.

### S15 — Creative direction
- **Description:** One concept + variant matrix + image briefs.
- **Inputs:** Campaign brief, brand kit, formats.
- **Process:** Concept → palette → variants → per-variant image brief + alt.
- **Output:** Creative brief artifact.
- **Quality checklist:** Coherent concept; IP-safe; valid dimensions.
- **Eval:** Creative-relevance.

### S16 — Localization
- **Description:** Adapt content to a locale (idiom, culture, region rules), not literal translation.
- **Inputs:** Source artifact, target locale, region rules.
- **Process:** Re-express tone/idiom; swap region-illegal claims; localise CTAs/currency/date.
- **Output:** Localized artifact version.
- **Quality checklist:** Culturally apt; region-compliant; meaning preserved.
- **Failure cases:** Untranslatable claim illegal in locale → flag/replace.
- **Eval:** Localization adequacy rubric; compliance pass.

### S17 — Translation
- **Description:** Faithful translation preserving meaning + brand voice.
- **Inputs:** Source text, target language.
- **Process:** Translate → preserve terms/lexicon → QA check.
- **Output:** Translated artifact version.
- **Quality checklist:** Accurate; voice preserved; no added claims.
- **Eval:** Back-translation consistency; human spot-check.

### S18 — Compliance review
- **Description:** Region-scoped pass/warn/block (see 06 §14, 13).
- **Inputs:** Artifact, region rules.
- **Process:** Rule match → severity → fix; fail closed.
- **Output:** Compliance result (verdict, violations, requires_human).
- **Quality checklist:** Excerpts cited; severity correct; fail-closed honoured.
- **Failure cases:** Ambiguity → block + escalate.
- **Eval:** Compliance-safety eval (recall on red set ≥0.98).

### S19 — Publishing
- **Description:** Export (MVP) / publish (V1+) approved+compliant artifacts.
- **Inputs:** Approved artifact version, channel, slot.
- **Process:** Transform → idempotent deliver → receipt.
- **Output:** Publish/export receipt.
- **Quality checklist:** Approved+compliant only; idempotent; receipt stored.
- **Failure cases:** Auth/policy failure → escalate; never force.
- **Eval:** Publishing-accuracy eval (format/target correctness).

### S20 — Performance analysis (V1+)
- **Description:** Explain results, recommend actions.
- **Inputs:** Metrics, baseline, campaign.
- **Process:** Compute → drivers → recommendations → confidence/caveats.
- **Output:** Insight artifact.
- **Quality/Eval:** Analytics-reasoning eval; no fabricated metrics.

### S21 — A/B testing (V1+)
- **Description:** Generate variants + a valid test plan; later read results.
- **Inputs:** Base artifact, hypothesis, metric, audience split.
- **Process:** Produce ≥2 variants differing on one lever → define metric/sample/duration.
- **Output:** Variant artifacts + test plan.
- **Quality checklist:** Single-variable; measurable; sufficient sample plan.
- **Eval:** Test-design validity rubric.

### S22 — Learning from results (V1+)
- **Description:** Extract durable insights into Learning Memory.
- **Inputs:** Campaign results, prior learnings.
- **Process:** Derive insights w/ evidence + confidence; flag conflicts.
- **Output:** Learning Memory records.
- **Quality checklist:** Generalizable; evidenced; conflicts flagged.
- **Eval:** Insight usefulness; no overfitting (sample-size check).

## 4. Skill governance
- Skills are **versioned** and **eval-gated** (12); a skill change must not regress golden datasets.
- A skill declares its **allowed tools**; the runtime enforces (08/13).
- Skill outputs are **always** artifacts or memory records (never ephemeral).

## 5. Acceptance criteria
- Each skill produces schema-conformant output and passes its named eval.
- Compliance review (S18) provably fails closed.
- Skills reuse existing Verdikt capabilities where present (S13 → `ideogram-proxy` + IP guard; S11 segments → existing segments route).
