# Events diagnostics

Maintainer-only event diagnostics live here. They are not public Examples and are not listed by OpenDesk Examples.

`clipboard-changed-smoke.js` observes one clipboard change event, writes bounded metadata under `.runtime/tests/`, and restores the prior text value. It still mutates the real clipboard temporarily, so use it only as an explicit diagnostic.
