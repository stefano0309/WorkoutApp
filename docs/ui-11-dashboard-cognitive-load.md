# UI-11 — Dashboard / Cognitive Load

## Problem

The legacy dashboard presented repeated information in several cards plus a full seven-day microcycle table on the initial viewport. The same today/tomorrow state appeared both in the hero plan and in the separate `Attività di Oggi` timeline.

## Decision

Keep the existing dashboard data, routing and persistence contracts, but reduce the initial information density:

- remove the duplicated today/tomorrow timeline;
- keep the existing primary start action visually dominant;
- collapse the full weekly microcycle behind a native `<details>` disclosure;
- preserve all weekly session data and access to each session.

No business logic, storage model, remote sync or training rules are changed.

## Accessibility

The weekly disclosure uses native `details/summary` keyboard semantics. Existing buttons and labels remain intact. Focus indication and reduced-motion behavior reuse the existing HTS token vocabulary.

## Scope

This is a cognitive-load refactor, not a visual redesign. The existing legacy dashboard remains the source of truth and the new layer only changes its presentation.
