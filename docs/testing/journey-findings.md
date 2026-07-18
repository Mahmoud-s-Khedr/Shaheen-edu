# Journey findings

## JF-001 — README implementation inventory is stale

- Journey: discovery
- Endpoint/module: academic hierarchy and content-item controllers
- Expected documentation: README should match implemented API
- Actual: README states no business modules are implemented, but current controllers, migrations, services, and e2e tests implement hierarchy and content items.
- Severity: documentation
- Recommended fix: update README API surface and scope statement.

## JF-002 — Future media types can be stored without media infrastructure

- Journey: CONTENT-002
- Endpoint: `POST /api/v1/admin/content-items`
- Expected behavior: only backed content types should be authorable until storage/stream support exists.
- Actual: DTO/service permit VIDEO, PDF, IMAGE, DOCUMENT, and DOWNLOADABLE_FILE records without a source/upload reference.
- Severity: medium
- Recommended fix: restrict accepted types to TEXT/EXTERNAL_LINK until media metadata and upload flows are implemented.
