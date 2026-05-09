# Third-Party Notices

Hermes Mobile includes and depends on third-party software. Dependency metadata
is recorded in `package-lock.json`.

## PDF.js

The static preview shell includes vendored PDF.js browser assets under
`public/vendor/pdfjs/`:

- `pdf.min.js`
- `pdf.worker.min.js`

PDF.js is copyright Mozilla Foundation and is licensed under the Apache License,
Version 2.0. The bundled files retain their upstream license headers.

## npm Dependencies

Runtime dependencies are installed through npm:

- `pdfjs-dist`
- `web-push`

Development and optional transitive dependency licenses are tracked by npm
metadata in `package-lock.json`. Review dependency license metadata before
redistributing modified bundles.
