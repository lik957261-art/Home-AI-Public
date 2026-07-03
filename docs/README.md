# Home AI Docs Entry

Use `docs/DOCS_INDEX.md` as the authoritative documentation routing index.

This file exists so continuation bootstraps and human operators that start at
`docs/README.md` land on the same current doc entrypoint.

Project-level delivery-thread governance is indexed in
`docs/DOCS_INDEX.md`. The authoritative contract is
`docs/PLATFORM_CONTRACTS/autonomous-delivery-loop-contract.md`: the ordinary
Home AI implementation thread coordinates Home AI-owned work, Worker threads
are durable task-card targets with terminal returns, sub-agents are temporary
same-turn helpers only, and duplicate repair approvals/Web Push notifications
are idempotency defects.
