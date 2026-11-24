# Requirement Studio

A local-first personal requirements workspace for business analysts, product owners and project managers. Version 0.1.0 is a deliberately small, dependency-free MVP with deterministic validation rather than generated diagrams or AI content.

## Run

Requires Node.js 22 or newer. Clone the repository, then run:

```sh
npm start
```

Open http://127.0.0.1:4173. No npm install, external API, database or account is required. Run `npm test` for domain tests.

## Workflow

1. Create a workspace or load the clearly marked synthetic sample.
2. Register business objectives, business requirements, functional/non-functional requirements, business rules, user stories, use cases, acceptance criteria and test cases.
3. Record an owner, evidence reference, verification method and MoSCoW priority. Connect allowed upstream artifacts.
4. Review deterministic quality findings. Approval requires required fields, confirmed source classification with reference, and approved upstream artifacts. Warnings are heuristic and require judgment.
5. Review RTM and downstream effects. Editing an approved artifact requires returning it to review; approved descendants are reset automatically.
6. Export a CSV register, CSV RTM, JSON backup or approved Markdown specification. Print the A4 Times New Roman specification via the browser.

## Design decisions

- Enterprise-minimal UI: compact navigation, restrained palette, tables and accessible form labels. No gradients or decorative dashboard cards.
- Data model and validation are isolated from the DOM. No AI dependency and no network data transfer in the application.
- Allowed upstream artifact types are an internal convention, not a mandated BABOK or ISO taxonomy.
- Source references and approvals are manual attestations, not verified stakeholder identity. History is local and editable via backups, not a tamper-proof enterprise audit log.
- Coverage only checks whether an approved acceptance criterion and approved test case exist downstream; it does not demonstrate test execution or completeness.
- Local storage is browser/profile/origin-specific, not encrypted or synced. Back up before switching devices or clearing data. Use authorized non-sensitive data; do not use on shared devices for confidential work.
- This release has one active workspace; use JSON backups to switch projects. Diagram generation, DOCX export, Jira integration, team access and AI-assisted analysis are out of scope.

## Repository layout

- `src/core.mjs`: domain model, validation, traceability, revision history and export helpers.
- `src/app.mjs`: application UI and browser persistence.
- `src/styles.css`: responsive design and A4 print styling.
- `test/core.test.mjs`: deterministic unit tests.
- `server.mjs`: loopback-only static server.

## Acceptance checks

Run the automated domain tests, then manually verify the sample, mobile layout, keyboard navigation, save/reload, JSON round trip, CSV opening, approval gates, and A4 print preview. Production readiness requires additional browser and visual regression testing.

Reference reading (not a claim of compliance): [IIBA Business Analysis Standard](https://www.iiba.org/business-analysis-standards-and-resources/business-analysis-standard/), [Scrum Guide](https://scrumguides.org/).
