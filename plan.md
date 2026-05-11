# Pluto Plan

## 1. Product Goal
Build an MVP browser extension that preserves browsing context across time by:
- understanding sessions
- enabling semantic recall
- supporting continuity and resumption

Primary user feeling:
- calm, ambient, respectful
- privacy-first and local-by-default
- "I forgot, but Pluto remembered."

## 2. MVP Scope (Strict)
In scope:
1. Session understanding
2. Semantic recall
3. Continuity and resumption

Out of scope (MVP):
- autonomous agents
- chatbot-style copilot behavior
- aggressive productivity nudges
- broad automation workflows

## 3. Success Criteria
By MVP release, a user should be able to:
- recover why a page mattered in a prior session
- find prior browsing artifacts using natural language
- resume unfinished session threads with clear context

Example success moments:
- "Find the Redis article I used last week"
- "Continue Friday's job search"
- "Why did I open this recruiter profile?"

## 4. Architecture (MVP)
### Layer A: Event Layer
Capture raw browser events:
- page viewed
- tab switched
- search performed
- meaningful click/action events

Store as append-only timeline with timestamps and tab/session hints.

### Layer B: Session Layer
Group events into session objects with:
- title/label
- start/end windows
- entities (people, companies, products, technologies)
- actions taken
- unresolved items

Session object is the primary UX unit.

### Layer C: Recall Layer
Enable semantic retrieval over session memory:
- embeddings for session summaries and important events
- vector similarity lookup
- result ranking and explanation snippets

Knowledge graph can start minimal in MVP (optional lightweight schema), with full graph evolution post-MVP.

## 5. Suggested Tech Stack (Execution)
- Extension shell: Plasmo + TypeScript
- Storage: Postgres
- Vector search: pgvector
- Graph (phase 2+): Neo4j
- Embeddings: local model first

Note: Keep interfaces abstract so storage backends can evolve without rewriting extension logic.

## 6. Privacy and Trust Requirements
Non-negotiable controls:
- local-by-default storage policy
- sensitive domain blocklist enabled by default
- user memory controls: inspect, delete, export
- clear "what is stored" transparency UI

Default sensitive exclusions:
- banking
- health
- government
- authentication
- private communication

## 7. Delivery Phases
### Phase 0: Product and Data Contracts (Week 1)
Deliverables:
- event schema v1
- session schema v1
- recall query contract v1
- privacy policy and exclusion rules v1

### Phase 1: Extension Event Capture (Weeks 2-3)
Deliverables:
- Plasmo extension scaffold
- event ingestion pipeline
- local buffering and reliable writes
- domain exclusion enforcement

Acceptance:
- events captured with low overhead
- excluded domains never persisted

### Phase 2: Sessionization Engine (Weeks 4-5)
Deliverables:
- rule-based session grouping
- session labeling heuristics
- unresolved/open-loop marker extraction

Acceptance:
- sessions generated with useful labels
- user can view timeline -> session grouping clearly

### Phase 3: Semantic Recall (Weeks 6-7)
Deliverables:
- embedding pipeline for session summaries
- pgvector search endpoints
- natural-language query interface in extension

Acceptance:
- top results are contextually relevant for test queries
- response includes "why this matched" snippet

### Phase 4: Continuity and Resumption UX (Weeks 8-9)
Deliverables:
- "Resume session" UI
- open-loop reminders (calm, non-intrusive)
- "What happened last time" session digest

Acceptance:
- user can restart prior session in <=3 clicks
- reminders feel helpful and not noisy

### Phase 5: MVP Hardening (Week 10)
Deliverables:
- performance pass
- privacy audit checklist
- export/delete flows
- telemetry limited to non-sensitive product metrics

Acceptance:
- stable on common browsing patterns
- privacy controls pass internal review

## 8. Core Data Model (MVP Draft)
Event:
- event_id
- timestamp
- event_type
- url (redacted/normalized)
- title
- tab_id
- domain
- metadata (lightweight)

Session:
- session_id
- label
- started_at
- ended_at
- event_ids
- entities
- decisions
- unresolved_questions
- summary_text
- embedding_vector

RecallResult:
- session_id or event_id
- relevance_score
- explanation
- related_entities

## 9. UX Principles to Enforce
- quiet by default
- clarity over cleverness
- minimal interruptions
- explainability for every recall/resume suggestion
- always provide user control (dismiss, edit, delete)

## 10. Risks and Mitigations
Risk: false session grouping
- Mitigation: editable session boundaries and labels

Risk: weak semantic quality early
- Mitigation: hybrid ranking (vector + recency + entity overlap)

Risk: privacy trust erosion
- Mitigation: strict defaults, visible controls, sensitive-site exclusions

Risk: performance overhead in browser
- Mitigation: lightweight event capture, deferred processing, batching

## 11. Test Plan (MVP)
Scenario suites:
- Job search continuity flow
- Debugging/research continuity flow
- Product comparison open-loop flow

Validation checks:
- session grouping precision (manual eval set)
- semantic retrieval relevance@k
- resume task completion time
- false-positive reminder rate
- privacy exclusion correctness

## 12. Launch Readiness Checklist
- MVP scope lock respected
- privacy defaults on
- data inspect/delete/export functional
- semantic recall baseline quality met
- continuity UX is calm and non-intrusive
- clear positioning copy: "A browser that remembers what mattered"

## 13. Immediate Next Actions
1. Initialize Plasmo + TypeScript extension workspace.
2. Implement event schema and ingestion pipeline with exclusion rules.
3. Build sessionization service with deterministic heuristics.
4. Add embedding + pgvector retrieval for natural-language recall.
5. Ship first end-to-end demo: capture -> session -> recall -> resume.
