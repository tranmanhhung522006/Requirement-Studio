# Requirement Studio

A local-first personal requirements workspace for business analysts, product owners and project managers. Version 0.3.0 adds multiple projects, structured editors, change control and bilingual UI to the private cloud MVP with deterministic validation rather than generated diagrams or AI content.

## Run

Requires Node.js 22 or newer. Clone the repository, then run:

```sh
npm start
```

Open http://127.0.0.1:4173. Local mode requires no npm install, external API, database or account. Run `npm test` for domain tests.

## Workflow

1. Create a workspace or load the clearly marked synthetic sample.
2. Register business objectives, business requirements, functional/non-functional requirements, business rules, user stories, use cases, acceptance criteria and test cases.
3. Record an owner, evidence reference, verification method and MoSCoW priority. Connect allowed upstream artifacts.
4. Review deterministic quality findings. Approval requires required fields, confirmed source classification with reference, and approved upstream artifacts. Warnings are heuristic and require judgment.
5. Review RTM and downstream effects. Editing an approved artifact requires returning it to review; approved descendants are reset automatically.
6. Export a CSV register, CSV RTM, JSON backup or approved Markdown specification. Print the A4 Times New Roman specification via the browser.

## Design decisions

- Enterprise-minimal UI: compact navigation, restrained palette, tables and accessible form labels. No gradients or decorative dashboard cards.
- Data model and validation are isolated from the DOM. No AI dependency. Cloud mode sends data only to the same-origin backend and configured PostgreSQL database.
- Allowed upstream artifact types are an internal convention, not a mandated BABOK or ISO taxonomy.
- Source references and approvals are manual attestations, not verified stakeholder identity. History is editable via backups, not a tamper-proof enterprise audit log.
- Coverage only checks whether an approved acceptance criterion and approved test case exist downstream; it does not demonstrate test execution or completeness.
- Local storage is browser/profile/origin-specific, not encrypted or synced. Cloud mode uses separate PostgreSQL-backed project snapshots shared across authorized devices. Back up before switching devices or clearing data. Use authorized non-sensitive data; do not use on shared devices for confidential work.
- This release supports multiple projects with independent workspaces; JSON backups apply to the selected project. Basic DOCX specification and XLSX RTM are supported; diagram generation, specialized document templates, Jira integration, team access and AI-assisted analysis remain out of scope.

## Repository layout

- `src/core.mjs`: domain model, validation, traceability, revision history and export helpers.
- `src/app.mjs`: application UI and browser persistence.
- `src/styles.css`: responsive design and A4 print styling.
- `test/core.test.mjs`: deterministic unit tests.
- `server.mjs`: local or authenticated cloud HTTP server.

## Acceptance checks

Run the automated domain tests, then manually verify the sample, mobile layout, keyboard navigation, save/reload, JSON round trip, CSV opening, approval gates, and A4 print preview. Production readiness requires additional browser and visual regression testing.

Reference reading (not a claim of compliance): [IIBA Business Analysis Standard](https://www.iiba.org/business-analysis-standards-and-resources/business-analysis-standard/), [Scrum Guide](https://scrumguides.org/).

## Deploy to Render + Neon (private personal web app)

1. Create a dedicated Neon project/database and choose a nearby region. In Neon **Connect**, copy the pooled PostgreSQL connection string.
2. Merge the PR, open Render Dashboard, create a **Blueprint** from this repository and select the main branch. The included render.yaml creates a free Node web service in Singapore.
3. Fill DATABASE_URL with the Neon connection string and APP_PASSWORD with a unique, random password of at least 24 characters. APP_USERNAME defaults to owner. Never commit these values or include them in screenshots. Render supplies RENDER_EXTERNAL_URL; for a custom domain set APP_ORIGIN to its HTTPS origin.
4. Deploy. The server creates the legacy workspace and rs_projects / rs_project_events tables on first startup, and migrates the old workspace to the default project if necessary. Open the actual Render URL and enter the configured credentials in the browser prompt.
5. Verify /healthz, save a synthetic record, reload in another authorized browser and confirm persistence. Import a JSON backup from local mode if desired.

Manual Render Web Service settings: Node runtime; build command npm install --omit=dev; start command npm start; health check /healthz; NODE_VERSION=22; NODE_ENV=production; DATABASE_URL, APP_PASSWORD, APP_USERNAME. Render supplies PORT. Cloud configuration errors stop startup instead of falling back to unauthenticated local mode.

Cloud security and scope: single owner using HTTP Basic over Render HTTPS, no public registration, same-origin JSON writes, server-side validation, optimistic revision check and TLS certificate verification for PostgreSQL. The JSONB workspace is a snapshot, not a normalized multi-tenant schema or tamper-proof audit. No cloud fallback to localStorage. Browser Basic credentials may remain cached until the browser session closes. Use dedicated strong credentials and authorized data; enterprise authentication, rate limits, independent audit and normalized artifact tables remain future work. Free hosting may cold-start. Database and hosted app must be tested in the target environment before using real data.

See [Professional Foundation notes](docs/PROFESSIONAL.md) for v0.3 details and limitations.
