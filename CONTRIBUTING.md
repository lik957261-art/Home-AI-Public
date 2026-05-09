# Contributing

Hermes Mobile is a mobile-first web client for a local Hermes Gateway. Keep
changes inside the product boundary: the web app may schedule Gateway runs,
manage local product state, and bridge optional integrations, but it should not
reimplement Hermes agent semantics or patch official Gateway source for product
UI behavior.

## Development Setup

```powershell
npm install
npm test
npm run productization:check
```

Node.js `>=22` and Python `>=3.12` are expected by the test and bridge compile
checks.

## Change Guidelines

- Keep secrets, runtime data, generated files, and deployment-specific adapter
  config out of the repository.
- Prefer providers/adapters for integration boundaries instead of hardcoding
  deployment paths in `server.js` or the frontend.
- Update README or docs in the same change when behavior, configuration, or
  installation steps change.
- Add focused tests for route contracts, adapter behavior, public export rules,
  and mobile UI behavior.

## Public Export

Public releases should be created from a clean export:

```powershell
npm run productization:check
npm run export:public -- --out workspace\public-export\hermes-mobile-public-smoke --force
```

The export command copies tracked source files, excludes runtime/private
directories, writes `.public-export-report.json`, and runs the privacy scan
against the exported tree.
