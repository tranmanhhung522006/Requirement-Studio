# Professional Foundation v0.3

This release extends the existing Node.js application rather than replacing the working stack.

- Cloud projects are stored independently in rs_projects; startup copies the former singleton workspace to the default project once. The legacy table remains intact.
- Ordinary save, rename, scope, stakeholder, change control and test execution operations are processed by the backend. Full snapshot imports and resets remain explicit replacement paths; the system is not a tamper-proof audit service.
- Project change events are recorded on successful cloud writes. Baselines are immutable through ordinary UI operations, but full backup imports can replace them.
- Structured fields support thirteen artifact types and 28 deterministic checks. Heuristic warnings are not standards certification.
- Test runs record evidence and the exact test-case version. Linked coverage is not proof of complete testing or UAT.
- English and Vietnamese UI selector persists per browser. Some dynamic notices, errors and export metadata remain English; user-authored content is never auto-translated.
- Basic DOCX specification and XLSX RTM exports use Office Open XML. Office application compatibility and pagination need acceptance testing.
- Render/Neon setup remains the same as v0.2. Single-owner HTTP Basic authentication remains, with bounded in-memory failed-attempt throttling. No public registration.
- Still outstanding: fully normalized relational artifact tables, Prisma migrations, secure session login/logout, complete translation, specialized BRD/FRD/SRS templates, full UAT workflow, richer prioritization, visual regression tests, AI and external integrations.

Before deployment, run npm test, verify both languages and project switching in desktop/mobile browsers, import an old backup, verify cloud isolation and concurrent writes, and open both Office exports in Microsoft Office. Test on a dedicated Neon database before using real records.
