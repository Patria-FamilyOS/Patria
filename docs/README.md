# Patria docs

* `PRD.md`: what Patria is, who it is for, and why (Product Requirements Document).
* `FEATURES.md`: every feature with its flow, rules, edge cases and acceptance criteria (Feature Requirements Document).
* `DECISIONS.md`: product and engineering choices that clarify or override the PRD and features. This file wins where it is more specific.
* `BUILD_LOG.md`: running log of what we built, in what order, and why we chose each option. Append an entry after every slice.
* `design/`: exported Figma screens. See `design/README.md`.
* `FIRST_PROMPTS.md`: the prompts to paste into Cursor, in order, to build the first slice.

Project rules for Cursor live in `.cursor/rules/patria.mdc` at the repository root.

When a decision changes (stack, scope, a feature rule), update these files first, then ask Cursor to follow the updated version. They are the single source of truth for the app.
