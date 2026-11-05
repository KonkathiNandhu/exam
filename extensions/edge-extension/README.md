# Phase 2: acceptance gate

The optional Edge extension is intentionally deferred. The requested execution order requires Phase 1 to work and pass acceptance before Phase 2 implementation. Real permission-granted Windows Edge capture and live-provider extraction have not yet been verified.

After docs/EDGE-ACCEPTANCE.md passes, implement a separate Manifest V3 TypeScript extension with administrator-configured exact domain host permissions, no broad host access, visible user activation, an allowlisted content script and MutationObserver, and the shared session/AI contracts. Do not inject into third-party/restricted frames. This directory contains no installable extension and does not claim Phase 2 completion.
