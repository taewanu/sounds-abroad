# ADR-0025: Base UI under the repo's own base components

**Status:** Accepted (2026-11-25).

## Context

Every interactive element was assembled from raw classes and hand-wired behavior at its call site. The focus ring, the press effect and the transition list were restated per button, and each overlay (chart sheet, commentary card, country list, volume popover, tour) wired its own Escape, outside-click and focus-return logic. Two lint rules held fixed bugs back (`transition-all`, and Escape checks outside `useEscapeLayer`), because no component owned the right behavior and made it the default.

Moving those decisions into components needs headless UI primitives: components that bring keyboard, focus and ARIA behavior and no styles, since the visual decisions already live in the theme's tokens.

## Decision

**Base UI (`@base-ui/react`) is the headless primitive layer, and feature code never uses it directly: it composes the repo's base components in `src/components/ui/`, which wrap Base UI and own the focus ring, the press effect and the transition list on top of the theme tokens.**

- Base UI is headless: its components render unstyled elements and expose state as `data-*` attributes (`data-disabled`, `data-pressed`), so the tokens stay the only source of how controls look.
- The button-level components are `IconButton` and `PillButton` on Base UI `Button`, and `IconToggle` on Base UI `Toggle`, which sets `aria-pressed` from its `pressed` prop.
- The composite controls are `ToggleGroup` on Base UI `ToggleGroup` and `Tabs` on Base UI `Tabs`. `Tabs` keeps the tab stop on the selected tab, as the WAI-ARIA APG Tabs pattern asks; Base UI alone leaves it on the last-focused tab.
- A link that looks like a button stays an `<a>` (`IconLink`) and shares only the styling. Base UI's Button docs ("Rendering links as buttons") say links must not be rendered through `Button`, which enforces button semantics.
- Callers pass color and state classes; size is a prop. A caller writing a transition, focus-ring or press class is a sign the component is missing something.
- The pin is exact (`1.9.0` at adoption), since a headless library's behavior changes reach every control at once.

### Alternatives rejected

- **Radix.** Its `Dialog` traps focus even at `modal={false}`: `react-dialog` hardcodes `loop: true` on its FocusScope with no opt-out (verified against 1.1.15, recorded in [ADR-0004](0004-dynamic-home-route-for-server-painted-chart.md)'s amendment). That trap is why the chart sheet left Radix, and it would return with any Radix dialog or popover the sheet is built on.
- **Hand-rolled components only.** Each one re-derives keyboard, focus and ARIA behavior, which is the per-call-site drift this record removes; the overlays' hand-wired Escape handling is the example.
- **Native `<dialog>` and `popover` alone.** They fit the country list and the volume popover, but not the sheet or the tour. The sheet collapses rather than closes, and cancelling the close is allowed only with history-action user activation, so a second Escape closes it. The tour opens on page load, and the HTML spec merges a close watcher created without user activation into the last group, so one Escape would close the tour and the layer below it.

## Consequences

- A new runtime dependency, with `@floating-ui/*` and `@base-ui/utils` under it. Its cost to first-load JavaScript was not measured at adoption.
- The chart sheet and the tour stay off Base UI (#517). `Drawer` and `Dialog` popups require a portal, which renders nothing on the server, and the server-rendered sheet needs to be in that HTML; the tour would become a dialog that takes focus. So `useEscapeLayer` stays for them, and the Popover wrapper defers to it: a Base UI popover passes Escape on while a higher layer is open.
- Row-sized press targets use `RowButton`, and one-off round controls use `IconButton`'s size and `press` variants. The country list's close button still carries its own classes until `IconButton` has its size.

## Revisit if

- A Base UI popup can render in the server HTML without a portal, or open without taking focus, so the chart sheet or the tour could move onto it.
- A Base UI release changes focus or keyboard behavior that the base components' tests do not catch.
- First-load JavaScript grows noticeably on a release that adds Base UI components.
