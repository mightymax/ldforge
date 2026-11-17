---
'@ldforge/editor': minor
---

Expand the share toolbar action into a localized, responsive inline panel with individually copyable editor links, SPARQL GET URLs, shell-quoted POST/GET cURL commands and a one-line query representation. Populate host-shortened links automatically, optionally including an explicitly opted-in execution variant. Retain the full link during shortening failures, reject stale snapshots, and report retryable service and clipboard errors. Preserve getShareLink() and copyShareLink() semantics; opening or copying from the panel does not edit or execute the query. Related: #14 and #11.

Use compact single-line fields and accessible clipboard icons that temporarily show an animated checkmark after copying, with reduced-motion support and screen-reader confirmation. Keep endpoint-dependent entries visible but disabled when no endpoint is configured. Safely remove comments and convert multiline literals for the one-line query, with an original-source fallback for incomplete literals.

Match Prefixes, sharing, settings and keyboard shortcuts as mutually exclusive inline panels with consistent styling, highlighted toolbar toggles, Escape handling and focus restoration. The toolbar icon replaces separate Close buttons; keyboard help no longer opens a modal.
