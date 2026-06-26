# 03 — Workspace UX Specification

**Audience:** Design, Frontend · **Read after:** 02-PRD · **Read before:** 09-workflows, 16-API

---

## 1. Layout principle

The workspace shall use a **three-panel structure** on desktop, with a fourth collapsible panel:

```
┌──────────┬───────────────────────────┬───────────────────────────┬───────────────┐
│  LEFT    │   CENTER                  │   RIGHT                    │  FAR-RIGHT     │
│  Nav     │   Conversation / Command  │   Work Canvas              │  Activity Feed │
│          │   (control surface)       │   (live artifacts / detail)│  (collapsible) │
└──────────┴───────────────────────────┴───────────────────────────┴───────────────┘
```

- **Left — Navigation:** persistent; switches the primary view.
- **Center — Conversation:** the control surface (P1). Commands in, status + artifact references out. Never the place where final work is judged.
- **Right — Work Canvas:** where artifacts, campaign details, and version comparisons render. **This is where work is reviewed and approved.**
- **Far-right — Agent Activity Feed:** collapsible; append-only stream of every action (P3).

Default widths (desktop ≥1280px): Left 232px · Center flex (min 360px) · Right flex (min 480px) · Activity 320px (collapsed → 0 + toggle). The Right panel is the visual priority; Center may collapse to a slim command bar on demand.

## 2. Left navigation

Items (mirrors the mockup): **Home · Campaigns · Content Calendar · Asset Library · Blogs · Integrations · Analytics · Brand Voice · Settings.** Footer: agent status card ("Marketing Agent · Active") + "Chat with Agent" + user/account switcher.

| Item | MVP | Notes |
|------|-----|-------|
| Home | ✅ | Dashboard (KPIs, current campaigns, recent assets, agent progress, quick actions) |
| Campaigns | ✅ | List + detail |
| Content Calendar | Stub (read-only) | Full scheduling V1+ |
| Asset Library | ✅ | Images (MVP), all assets V1+ |
| Blogs | ✅ | Blog artifacts list |
| Integrations | Stub | Channel connections V1+ |
| Analytics | Stub | V1+ |
| Brand Voice | ✅ | Brand + voice editor |
| Settings | ✅ | Model routing, automation rules, regions (admin) |

States: active item highlighted (emerald, matching Verdikt tokens); badge counts (e.g. Approvals pending) on relevant items.

## 3. Conversation panel (control surface)

- **Input:** multiline command box; slash-commands (`/campaign`, `/blog`, `/image`, `/approve`); attachments (brief upload).
- **Output stream:** user turns; agent turns rendered as **status cards** (not walls of text) — "Decomposed campaign into 5 tasks", "Generated blog v1 →" with a link that focuses the artifact in the Right canvas.
- **Affordances:** every agent message that produced an artifact carries a **canvas link** and **quick actions** (Open, Approve, Regenerate).
- **Streaming:** token/step streaming with a live "agent is working" indicator and step checklist (mirrors mockup's progress panel).
- **Rule:** the conversation **shall not** be the only place an artifact exists; it always references a canvas artifact (P1/P2).

## 4. Work canvas (right panel)

Context-sensitive views:
- **Campaign detail:** header (name, goal, status chip, region), task graph/progress, artifact grid, approvals, schedule.
- **Artifact viewer:** rendered artifact (blog markdown, social post preview per platform, image), **version selector**, eval scores, compliance result, action bar (Approve / Request changes / Regenerate / Export).
- **Version compare:** side-by-side diff of two `ArtifactVersion`s (text diff for copy; metadata diff for images).
- **Creative grid:** image variants with dimensions, save/approve.

## 5. Agent activity feed (far-right)

- Append-only, reverse-chronological, grouped by run.
- Event types: `agent.started`, `agent.step`, `tool.called`, `artifact.created`, `artifact.versioned`, `eval.scored`, `compliance.checked`, `approval.requested`, `approval.decided`, `export.done`, `error`.
- Each row: icon · actor (agent/human/tool) · concise text · timestamp · link to target.
- Filterable by run, type, severity. Backed by `mkt_activity` + `AuditLog`.

## 6. Dashboard (Home)

Mirrors the mockup:
- Greeting + "Agent is working on…" line.
- **KPI tiles:** Campaigns Running · Assets Generated · Approvals Pending (links to queue) · Est. Reach (V1+; MVP shows artifacts-shipped). Each with 7-day delta.
- **Current Campaigns** table: name, type, status chip, progress bar, next action, reach/metric.
- **Marketing Agent panel:** live checklist of current run steps + overall progress + ETA.
- **Recent Assets** grid (with dimensions) → Asset Library.
- **Quick Actions:** New Campaign · Generate Blog · Create Social Post · Generate Image · Upload Brief · View Analytics.

## 7. Campaign detail page

Header (name, goal, status, region, dates) · progress/task graph · tabs: **Overview · Artifacts · Calendar · Approvals · Activity**. Artifacts grouped by type (Blog/Social/Image). Primary CTA contextual to state (Approve plan / Review artifacts / Export).

## 8. Asset library

Grid of assets (image thumb, dimensions, source campaign, tags, created). Search + filter (type, campaign, tag). Detail drawer: versions, prompt, alt text, SEO tags, reuse action. Reuses `marketing_assets` storage pattern.

## 9. Content calendar

Week/month grid; each cell = scheduled artifact (channel icon + thumbnail), mirroring the mockup's week strip. **MVP:** read-only view of artifacts with target dates. **V1+:** drag-to-schedule, publish queue binding.

## 10. Publishing queue (V1+)

List of artifacts queued to publish: channel, scheduled time, status (queued/publishing/published/failed), approval state. MVP shows **Export** actions instead.

## 11. Analytics page (V1+)

Channel/campaign performance, insight artifacts, agent commentary. MVP: stub with "coming in V1".

## 12. Review / approval flows

```
Artifact IN_REVIEW
  → reviewer opens in canvas
  → sees eval scores + compliance result
  → [Approve] → status=approved → unlocks export/publish → feed event
  → [Request changes] (comment) → status=changes_requested → re-generates new version
  → [Reject] → status=rejected → archived version
```
- Bulk approve for low-risk artifact sets (config). High-risk types (PR, paid, claims) **shall** require explicit single approval and a passing factual/compliance eval.
- Approval records actor, timestamp, decision, comment (`mkt_approvals`).

## 13. UI states

| State | Behaviour |
|-------|-----------|
| **Empty** | Friendly empty states per view ("No campaigns yet — start with a brief"); primary CTA; optional illustration slot |
| **Loading** | Skeletons for tiles/lists; streaming indicator + step checklist for agent runs; per-artifact shimmer while generating |
| **Error** | Inline, actionable ("Image provider timed out — retry / use fallback"); never silent; logged to feed |
| **Success** | Toast + canvas focus on the new/updated artifact; feed event |
| **Blocked (compliance)** | Red banner on artifact with the failing rule + region; cannot approve/export until resolved |
| **Capped (budget)** | Banner "Run reached budget cap"; partial results shown |

## 14. Mobile adaptation

- Single-column, view-switching: Conversation and Canvas become tabs; Activity is a sheet.
- Nav collapses to a bottom bar or hamburger.
- Approvals and review are fully usable; generation kicks off and streams.
- Heavy compare/calendar views are read-optimised on mobile (full edit on desktop).

## 15. Accessibility (WCAG 2.1 AA)

- Keyboard operable: all actions reachable; focus order matches reading order; visible focus rings.
- Colour contrast ≥ 4.5:1 (reuse Verdikt tokens, verified for AA in both themes).
- Status not by colour alone (icons + text on chips/feed).
- ARIA: live region for streaming agent status and feed; labelled controls; dialog semantics for approval modals.
- Screen-reader artifact summaries (type, status, eval, compliance) before raw content.
- Respect reduced-motion for streaming/progress animations.

## 16. Design tokens & consistency

- Reuse Verdikt CSS variables (`--bg-base`, `--bg-surface`, `--border`, `--text-strong`, emerald `#00C853`, etc.) and the existing dark/light theme + skin system.
- Component library: build under `components/company/marketing/`; reuse `ChatWidget`, `Toast`, `Tooltip`, `KpiCard` patterns.

## 17. Acceptance criteria (UX)

| # | Criterion |
|---|-----------|
| UX-1 | Desktop renders the three panels + collapsible activity feed; widths per §1 |
| UX-2 | A conversation command that produces an artifact creates a canvas item and a feed event, linked from the chat |
| UX-3 | An artifact cannot be approved without showing its eval + compliance result |
| UX-4 | Export is disabled until `approved` |
| UX-5 | All four state types (empty/loading/error/success) are implemented per view |
| UX-6 | Keyboard-only operation completes a full review→approve→export flow |
| UX-7 | Mobile renders Conversation/Canvas as tabs with Activity as a sheet |

## 18. Risks & dependencies

- **Risk:** three-panel density on smaller laptops → collapsible Center + Activity mitigates.
- **Risk:** streaming UX complexity → standardise on a single run-status component.
- **Dependencies:** 16 (API), 04/09 (what the canvas renders), Verdikt theme system.
