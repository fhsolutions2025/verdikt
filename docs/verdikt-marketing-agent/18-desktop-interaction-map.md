# 18 — Desktop Campaign Workspace · Complete Interaction Map

> Status: **design spec — not yet implemented.** Per the `before_coding_instruction`,
> every visible control, state, and outcome is defined here BEFORE any code is written.
> This expands `verdikt_desktop_ui_interaction_spec` into a build-ready contract.

---

## 0. Honest current-state vs. target (read first)

The reference layout is a **5-region workspace**. What exists today (`components/company/
marketing/director/*`) is a **2-pane Director** (icon rail + chat | creation canvas) plus
slide-over panels. Concrete deltas:

| Region (target) | Today | Gap |
|---|---|---|
| Left sidebar (16 items) | 10-item icon rail | Missing Copy/Image/Video Studio, Dashboard, Calendar split, Billing, Help, org switcher, credits card |
| Campaign Explorer | none (interview only) | Entire panel missing — no browse/search/tabs/cards |
| Director Chat | MCQ interview + basic chat | No recommendation/approval/comparison/progress message cards; no slash commands; no @mentions; no streaming/stop |
| Asset Workspace | grid + filter tabs | No list/timeline/kanban views, no right-click menu, no multi-select/bulk, no drag, no per-card hover actions; **asset taxonomy is wrong (per-channel "Copy")** |
| Inspector | modal (AssetInspector) | Not a persistent right panel; missing tabs (Details/Versions/Comments/Activity/Publishing/Analytics), no zoom/scrub/compare |
| Bottom agent bar | none | Missing entirely (agent statuses live only inside canvas now) |
| Command palette (⌘K) | none | Missing |
| Topbar (breadcrumb/agents dropdown/create/bell/help) | none | Missing |

**Conclusion:** this is a **ground-up workspace rebuild**, not a tweak. The map below
is the contract for that rebuild; we phase it (§17) and you approve before coding.

---

## 1. Global rules

### 1.1 Layout
- Five resizable, independently-scrollable regions: `LeftSidebar | CampaignExplorer |
  DirectorChat | AssetWorkspace | InspectorPanel`, with a fixed `BottomAgentStatusBar`.
- Panel **widths persist per user** (localStorage key `verdikt_ws_layout` + server mirror
  on `user_preferences`). Collapsed/expanded state persists across refresh.
- **No long-running task blocks the UI.** All AI work is async; the UI shows task state,
  never a frozen view. Every action yields immediate optimistic feedback < 100ms.

### 1.2 Visual style
- Dark-first, purple accent, high-information density. Token set already exists
  (`director/theme.ts` + `globals.css`); extend, don't fork.

### 1.3 Universal states (apply to EVERY data surface)
| State | Required elements |
|---|---|
| **Loading** | Skeleton rows/cards OR streaming text OR agent-activity progress. **No indefinite spinners.** |
| **Empty** | Icon + one-line explanation + **primary CTA** + **secondary CTA** + an example action. |
| **Error** | Human-readable message + recommended fix + **Retry** + **Contact support**. Raw stack/HTTP hidden. |
| **Disabled** | Control dimmed + **tooltip on hover explaining why** (e.g. "Approve enabled after generation completes"). |
| **Success** | Confirmation toast + immediate in-place UI update (no full reload). |

---

## 2. Left Sidebar

Items (in order): Home/Dashboard · Campaigns · Campaign Director · Assets · Copy Studio ·
Image Studio · Video Studio · Brand Kit · Knowledge Base · Publishing · Analytics ·
Calendar · Notifications · Settings · Billing · Help.

| Control | Trigger | Outcome | States |
|---|---|---|---|
| Nav item | click | Navigate; selected item highlighted (purple left-bar + bg); main region swaps | active/hover/disabled-by-permission (tooltip) |
| Nav item (collapsed rail) | hover | Tooltip with label | — |
| Collapse button | click (or ⌘B) | Toggle icon-only; **persist** | — |
| Org dropdown | click | Menu: Switch organization · Org settings · Billing · Logout | loading orgs = skeleton |
| User profile | click | Menu: Profile · Preferences · Theme · Logout | — |
| AI Credits card | click | Open Usage & Billing page; card shows used/total + reset countdown | low-credit (<10%) = amber warning state |

---

## 3. Campaign Explorer

| Control | Trigger | Outcome | States |
|---|---|---|---|
| Search input | typing | Instant client filter of campaign list (debounced 150ms) | empty-result = "No campaigns match" + Clear |
| Search input | clear | Reset list | — |
| Filter button | click | Popover: Status · Owner · Date · Tag · Health-score; multi-apply; active filters shown as removable chips | — |
| New Campaign | click | Open **Campaign Director onboarding**; **draft created only after user confirms** | — |
| Tabs (All/Active/Archived) | click | Filter list; count badge per tab | — |
| Campaign card | click | Load campaign → Director loads conversation, Asset Workspace loads assets, Inspector shows campaign overview | loading = skeleton card |
| Campaign card | double-click | Pin to top (persist) | pinned badge |
| Campaign card | right-click | Menu: Rename · Duplicate · Archive · Delete · Export | Delete → confirm dialog |
| Campaign card | hover | Reveal quick actions + last-updated + owner avatar | — |
| Card displays | — | thumbnail, name, status pill, date range, progress bar, health % | health<60 = amber, <40 = red |
| List empty | — | "No campaigns yet" + **New Campaign** (primary) + Import (secondary) + example | — |

---

## 4. Topbar

| Control | Trigger | Outcome |
|---|---|---|
| Breadcrumb "Campaigns" | click | Return to campaigns overview |
| Campaign title | click | Inline rename input (Enter saves, Esc cancels) |
| Favorite star | click | Toggle favorite (optimistic) |
| AI Agents dropdown ("12 Active") | click | Active-agents menu (live statuses; links to bottom bar detail) |
| Create button | click | Menu: New campaign · New asset · New copy · New image · New video |
| Search / ⌘K | click or ⌘K | Global command palette (§9) |
| Notification bell | click | Notification center (§10); unread badge |
| Help icon | click | Help drawer (docs search, shortcuts, contact) |

---

## 5. Campaign Director Chat

### 5.1 Message types (each is a distinct renderer)
`text` · `markdown` · `asset_card` · `approval_card` · `recommendation_card` ·
`progress_card` · `comparison_card` · `checklist` · `table` · `error_card` ·
`agent_status_card`.

| Type | Renders | Interactions |
|---|---|---|
| text/markdown | streamed text | copy on hover |
| recommendation_card | title + reasoning + est. time + action buttons | each button → create task / update plan → confirmation + agent starts |
| asset_card | thumb + title + status | click → open in Inspector + highlight in Workspace; Open/Duplicate/Edit/Export |
| approval_card | preview + Approve/Reject/Request-changes | Approve→status+activity; Reject→reason prompt; Request-changes→revision task |
| progress_card | agent + % + N/of/M + ETA | live; non-blocking |
| comparison_card | A/B/C side by side | Select / Compare / Merge / Regenerate |
| checklist / table | structured data | row actions where relevant |
| error_card | business-language error + Retry/Alternative/Modify | never shows raw error |
| agent_status_card | which agents engaged + state | click → bottom-bar detail |

### 5.2 Conversation behavior
| Trigger | Outcome |
|---|---|
| Send message (click or ⌘Enter) | User msg appears instantly; assistant **streams**; tasks created if intent implies generation |
| While streaming | Show active-agent activity; **send button becomes Stop** |
| Stop generation | Halt stream; partial text retained; user can continue |

### 5.3 Prompt composer
| Control | Trigger | Outcome |
|---|---|---|
| Textarea | type | auto-expand; multiline; `/` opens command menu; `@` opens agent selector |
| Send | click/⌘Enter | submit |
| Attach | click | Upload file/image/video · Add from Knowledge Base |
| Voice | click | start capture (fast-follow if unsupported → disabled+tooltip) |
| Slash commands | `/ads /blog /email /image /video /review /translate /publish /seo` | each routes to the matching generation/flow |
| @mentions | `@Copywriter @Designer @VideoProducer @BrandGuardian …` | route request to that agent |

---

## 6. Asset Workspace

### 6.1 Tabs & views
- Tabs: **Assets · Activity · Agents · Insights**.
- View modes: **Grid** (default) · **List** (copy-heavy) · **Timeline** (progression) ·
  **Kanban** (workflow status: Draft→Review→Approved→Published).
- Filters: All · Image · Video · Copy · Design · Approved · Draft · Generating · Failed.

### 6.2 Asset card
Displays: thumbnail · title · **asset type** · format · duration/size · status ·
quality score · version.

| Trigger | Outcome |
|---|---|
| click | Select + open Inspector |
| double-click | Full preview overlay |
| hover | Reveal: Preview · Edit · Duplicate · Approve · Export · Delete |
| right-click | Menu: Open · Rename · Duplicate · Create variants · Regenerate · Approve · Send for review · Export · Delete |
| drag | Reorder / move to collection |
| shift-click / checkbox | Multi-select → bulk action bar (Approve/Export/Delete/Move) |

### 6.3 New Asset button
Menu: Copy · Image · Video · Landing Page · Email · Carousel · Ad Set.
**(This is where the corrected asset taxonomy lives — see §6.5.)**

### 6.4 Generation state
Per generating card: progress % · current step · active agent · ETA. Thumbnail
placeholder appears immediately; final preview replaces it.

### 6.5 ⚠ Corrected asset taxonomy (fixes the "YouTube Copy" defect)
Assets are **channel-native deliverables**, NOT "copy × every channel". The Director's
plan derives, per selected channel, only that channel's real deliverables:

| Channel | Deliverables |
|---|---|
| Instagram | Image post (+caption), Carousel, Reel (video) |
| Facebook | Image post / ad (+caption) |
| X | Post (short text + optional image) |
| LinkedIn | Post (text + image) |
| TikTok | Short video |
| YouTube | Video (+ description) |
| Blog | Blog article (long copy) |
| Email | Email / sequence (copy) |
| Cross-channel | Landing Page, Google/Meta Ads, SEO Metadata, Banner Set |

Copy is an **ingredient** (a caption/script attached to a visual) except where text *is*
the deliverable (Blog, Email, X/LinkedIn post, Ads, SEO). No standalone "YouTube · Copy".

---

## 7. Inspector Panel (persistent right column)

Tabs: **Inspector · Details · Versions · Comments · Activity · Publishing · Analytics**.

| Area | Behavior |
|---|---|
| No selection | "Select an asset to inspect details." + primary CTA **Generate Asset** |
| Image preview | zoom · download · edit · compare |
| Video preview | play · pause · scrub · fullscreen · download |
| Copy preview | edit · copy text · export markdown · export docx |
| Action buttons | Preview · Download · Share (link) · Approve · Create variants · Send for approval · Delete (confirm) |
| Versions | version click → preview; Restore → new active version; Compare → side-by-side |
| Comments | add threaded · @mention notifies · resolve |

---

## 8. Bottom Agent Status Bar

Agents: Campaign Director · Copywriter · Creative Designer · Image Producer · Video
Producer · SEO Specialist · Brand Guardian · Compliance · QA Agent (+N more).
States: **idle · active · queued · failed · completed** (color-coded dot).

| Trigger | Outcome |
|---|---|
| click agent | Detail popover: current task · recent tasks · success rate · avg time · cost · last error |
| System Health (right) | overall status; click → diagnostics |

---

## 9. Command Palette (⌘K)
Searchable: campaigns · assets · agents · actions · settings · knowledge · templates.
Actions: New campaign · Generate image · Generate video · Upload knowledge · Publish
campaign. Esc closes; arrow-key nav; recent items on open.

## 10. Notifications
Click → open related object · Mark read · Dismiss · **group repeated AI updates**.
Examples: Video completed · Approval required · Publishing failed · Comment mentioned you
· Campaign health improved. Never interrupts the conversation.

## 11. Approvals flow
`draft → send_for_review → pending_review → {approve | reject | request_changes}`.
Approve→approved; Reject→returns to owning agent (+reason); Request-changes→revision task.
History permanently recorded on the asset + Activity tab.

## 12. Publishing
Publish button → **publishing preview** (selected assets · channels · schedule ·
versions · validation warnings). Confirm → create publishing jobs; Schedule → save jobs;
Cancel → close. Channel connection state gates live vs export (existing `publishers.ts`).

## 13. Keyboard shortcuts
⌘K palette · `/` focus composer · Esc close overlay · `n` new campaign · `shift+A` assets
· `shift+C` campaigns · `shift+P` publishing · ⌘Enter send · ⌘B toggle sidebar.

## 14. Permissions (per-control gating)
| Role | Capabilities |
|---|---|
| Owner | all |
| Admin | manage campaigns/users, publish, approve |
| Marketer | create campaigns, generate assets, comment, request approval |
| Designer | generate images, edit assets, comment |
| Reviewer | comment, approve, reject |
| Viewer | view only |

Controls the user can't use are **disabled with an explanatory tooltip** (never hidden
silently, except destructive actions which are hidden for view-only).

## 15. Responsive
- **Desktop:** five-region workspace.
- **Tablet:** Inspector → collapsible drawer; Campaign Explorer collapses.
- **Mobile:** dedicated layout; Director becomes primary; Assets + Inspector open as
  full-screen sheets; no five-column stacking.

---

## 16. State catalogue (every surface × 5 states)
Each region's components above must implement loading/empty/error/disabled/success per
§1.3. This section is the QA checklist at build time — no component ships without all
five states defined and screenshotted.

---

## 17. Recommended build phasing (for approval — not yet started)
1. **WS-1 Shell:** five-region resizable layout + sidebar + topbar + persistence. (new)
2. **WS-2 Campaign Explorer:** list/search/filter/tabs/card actions over `mkt_campaigns`. (new)
3. **WS-3 Director Chat upgrade:** message-card renderers (recommendation/approval/
   comparison/progress) + streaming + stop + slash + @mentions. (extends existing chat)
4. **WS-4 Asset taxonomy fix + Workspace:** corrected channel→deliverable plan (§6.5) +
   grid/list/timeline/kanban + card menus + multi-select + new-asset types. (rewrites
   `derivePlannedAssets`; extends AssetGrid)
5. **WS-5 Inspector panel:** persistent right column with all tabs (folds in existing
   AssetInspector logic). (refactor modal → panel)
6. **WS-6 Bottom agent bar + Command palette + Notifications.** (new)
7. **WS-7 Publishing preview + Approvals UI + Permissions gating + Responsive.** (extends)

Each phase: one reviewable PR, `tsc`+`build` clean, merged to `main` on your say-so.
**Nothing in §1–§16 is implemented until you approve this map.**
