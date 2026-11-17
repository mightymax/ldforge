---
'@ldforge/editor': minor
---

Add an optional shortenShareUrl callback for host-owned synchronous or asynchronous URL shortening. Share actions wait for a valid HTTP(S) URL, report recoverable failures without copying, and discard stale results when the share context changes. Expose pending state for shortening and document integration and an ORM service example.
