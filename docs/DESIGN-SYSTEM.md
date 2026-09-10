# WorkoutApp Design System

## Purpose

This document is the implementation reference for the WorkoutApp Hybrid Training System (HTS) UI. It documents the existing design tokens, component states, motion rules and accessibility conventions used across the web UI.

The goal is consistency and reuse, not a visual redesign.

## Source of truth

The canonical token definitions live in `src/theme/variables.css`.

Runtime CSS in `www/` may mirror or alias these values for the legacy web shell, but new UI work should prefer the `--hts-*` token vocabulary and avoid introducing parallel values when an existing token is appropriate.

## Token reference

### Brand and semantic color

| Token | Purpose |
| --- | --- |
| `--hts-primary` | Primary action / brand emphasis |
| `--hts-primary-soft` | Secondary primary emphasis |
| `--hts-primary-contrast` | Content placed directly on primary |
| `--hts-info` | Informational emphasis / focus |
| `--hts-info-soft` | Soft informational treatment |
| `--hts-success` | Positive state / completed action |
| `--hts-success-contrast` | Content on success surfaces |
| `--hts-danger` | Error / destructive state |
| `--hts-on-light` | Content used on light surfaces |

### Surfaces and content

| Token | Purpose |
| --- | --- |
| `--hts-background` | Default app background |
| `--hts-background-deep` | Deep/background variant |
| `--hts-background-elevated` | Elevated background layer |
| `--hts-surface` | Primary card / container surface |
| `--hts-surface-2` | Secondary surface |
| `--hts-surface-3` | Tertiary surface |
| `--hts-border` | Standard component border |
| `--hts-border-soft` | Low-emphasis separators |
| `--hts-text` | Primary text |
| `--hts-muted` | Secondary text |
| `--hts-muted-strong` | Stronger secondary text |

### Effects

| Token | Purpose |
| --- | --- |
| `--hts-overlay` | Modal / overlay backdrop |
| `--hts-scrim` | Strong page scrim |
| `--hts-glass` | Subtle translucent treatment |
| `--hts-glass-strong` | Stronger translucent treatment |
| `--hts-focus` | Keyboard focus indicator |
| `--hts-shadow-sm` | Small elevation |
| `--hts-shadow-md` | Medium elevation |
| `--hts-shadow-lg` | Large elevation |

### Shape and spacing

The base spacing scale is 8px increments:

| Token | Value | Use |
| --- | --- | --- |
| `--hts-space-1` | 8px | Tight internal spacing |
| `--hts-space-2` | 16px | Standard component spacing |
| `--hts-space-3` | 24px | Section spacing |
| `--hts-space-4` | 32px | Large section spacing |

Shape tokens:

| Token | Value | Use |
| --- | --- | --- |
| `--hts-radius-card` | 16px | Standard cards |
| `--hts-radius-card-lg` | 24px | Large cards / hero surfaces |
| `--hts-radius-xl` | 26px | Extra-large containers |
| `--hts-radius-control` | 12px | Inputs / controls |
| `--hts-radius-pill` | 999px | Pills / badges |

## Typography hierarchy

The current UI relies on the browser/system font stack already defined by the application. New screens should preserve the existing hierarchy rather than introduce arbitrary font families.

Recommended semantic roles:

- Page title: one clear primary heading.
- Section heading: groups a related set of information.
- Body: default readable content.
- Muted/supporting text: secondary context, never the only place critical information appears.
- Label: identifies an input or compact metric.
- Status/live text: communicates state changes without replacing the primary visual state.

Do not use font size alone to communicate a critical state. Pair hierarchy with semantic markup, labels and/or status indicators.

## Component principles

### Cards

Cards group related information. Prefer one clear purpose per card. Avoid nesting multiple competing primary actions inside a single card.

### Buttons and actions

Use an actual `<button>` for interactive actions. Primary actions should have one visually dominant treatment per surface. Icon-only controls require an accessible name.

### Inputs

Every form control needs an explicit accessible label. Validation should be tied to the relevant control and should remain understandable without color alone.

### Disclosure

Use native `<details>` / `<summary>` when content is optional to inspect and does not need custom interaction semantics. The control must remain keyboard accessible and clearly communicate its expanded/collapsed state.

### Status and feedback

Use the existing success/error/info tokens consistently. Save and async feedback should update a live region where appropriate while keeping the persistent visual state understandable.

## Interaction states

Interactive components should account for:

- default
- hover / pointer affordance
- focus-visible
- pressed / active
- disabled
- loading
- success
- error
- empty / unavailable

Do not rely on hover as the only indication of an available action.

## Focus and accessibility

Keyboard focus uses `--hts-focus` and should remain visible against the current surface.

Recommended pattern:

```css
:focus-visible {
  outline: 3px solid var(--hts-focus);
  outline-offset: 3px;
}
```

Interactive targets should preserve a comfortable touch area; 44px is the baseline used by the current UI-11 dashboard disclosure and primary action.

Use semantic headings, landmarks, native controls and descriptive labels before adding ARIA. ARIA should supplement semantics, not replace them.

## Motion

Motion tokens are semantic rather than component-specific:

| Token | Value | Intended use |
| --- | --- | --- |
| `--hts-duration-fast` | 150ms | Micro state changes |
| `--hts-duration-normal` | 250ms | Standard component transitions |
| `--hts-duration-state` | 350ms | Visible state transitions |
| `--hts-duration-emphasis` | 600ms | Deliberate emphasis |

Preferred easing tokens:

- `--hts-ease-standard`
- `--hts-ease-emphasized`
- `--hts-ease-linear`

Respect `prefers-reduced-motion`. The canonical token file reduces motion durations when the user requests less motion, and feature CSS should preserve that behavior rather than hard-coding competing animations.

## Semantic transitions

Reuse these predefined transition groups when they fit the interaction:

```css
transition: var(--hts-transition-color);
transition: var(--hts-transition-surface);
```

Do not create a new transition token for a one-off effect unless the same behavior is expected to be reused across multiple components.

## Layout and density

WorkoutApp is mobile-first. Optimize the first viewport around the user's immediate training decision, then progressively reveal secondary detail.

Prefer:

1. one primary task;
2. essential status/context;
3. progressive disclosure for secondary information;
4. detailed history or configuration after the immediate action.

This principle was applied in UI-11 by removing duplicated dashboard information and collapsing the weekly microcycle behind a native disclosure.

## Content rules

UI copy should:

- describe the action before the implementation detail;
- use consistent terms for the same concept;
- keep status messages concise;
- avoid exposing internal identifiers to users;
- distinguish unavailable data from zero values.

## Implementation checklist

Before merging a new UI component:

- Reuse an existing `--hts-*` token where possible.
- Use semantic HTML first.
- Cover focus-visible and keyboard interaction.
- Define all meaningful component states.
- Respect reduced motion.
- Keep the primary action visually dominant.
- Avoid duplicated sources of truth.
- Add regression tests for important behavior and state changes.
- Update this document only when the system-level rule itself changes.

## Related implementation

- `src/theme/variables.css` — canonical token definitions.
- `www/index.css` — legacy/runtime CSS layer.
- `www/accessibility.css` — accessibility styles.
- `www/micro-interactions.css` — interaction/motion patterns.
- `www/dashboard-cognitive-load.css` — example of token-based, accessible progressive disclosure.
- `docs/ui-11-dashboard-cognitive-load.md` — cognitive-load refactor rationale.
