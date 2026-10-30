# Audit (native)

Native **implementation audit** for **`ios` / `android` / `adaptive`**, reading SwiftUI/UIKit/Compose/React Native/Flutter sources directly. No browser tooling; HTML detector does not apply. Score using [ios.md](ios.md) and [android.md](android.md) (both on `adaptive`). Keep report skeleton aligned with [audit.md](audit.md) when editing either file.

## Five dimensions (0–4 each, total /20)

### 1 · Accessibility (VoiceOver / TalkBack)

**Look for:** missing labels/traits/state announcements; bad traversal order; fixed sizes blocking Dynamic Type / sp scaling; targets below 44 pt / 48 dp; ignored Reduce Motion; contrast failures in either appearance.

**Rubric:** 0 unusable · 1 major gaps · 2 partial · 3 good · 4 excellent

### 2 · Performance

**Look for:** heavy launch work; unvirtualized lists; main-thread jank; wasted re-renders/recomposition; oversized image decode; bundle/binary bloat.

**Rubric:** 0 janky · 1 major · 2 partial · 3 good · 4 excellent

### 3 · Appearance & theming

**Look for:** raw hex vs semantic system/Material roles; weak dark appearance; missing Dynamic Color fallback (Android 12+); off-platform materials.

**Rubric:** 0 literal everywhere · 1 minimal · 2 partial · 3 good · 4 semantic throughout

### 4 · Platform conformance (critical)

Against platform refs + slop tests: broken back gestures; content under notch/keyboard; wrong nav idioms; web-shaped controls; mixed icon sets; decorative drift.

**Rubric:** 0 web port · 1 heavy violations · 2 some · 3 mostly native · 4 fully native

### 5 · Adaptivity

**Look for:** stretched phone layouts on tablet; broken landscape; keyboard hiding fields; split-screen/fold breakage.

**Rubric:** 0 one size · 1 major breaks · 2 partial · 3 good · 4 excellent

## Report shape

Same table layout as web audit (swap dimension 3–4 labels). Lead with **platform conformance verdict**—native app or ported site?

Findings use P0–P3; cite HIG/Material where relevant; suggest `/ui-design` commands like web audit. Include patterns, positives, and prioritized action list.

**Avoid:** vague advice; false positives; missing impact text.


## Severity tags & command routing

Tag each finding **P0–P3**: P0 blocks tasks · P1 ship-risk · P2 annoyance · P3 polish.

Document location (screen/file/line), category, user impact, guideline cite, fix, and a `/ui-design` command from the SKILL table. Close recommendations with `/ui-design polish` when any fix is planned.

Closing copy for the user: offer one-at-a-time or batched fixes; suggest re-audit after changes.

---

## Dimension checklists (native)

### Accessibility — concrete probes

- Every tappable control has accessibility label (SwiftUI) / `contentDescription` (Compose) / RN `accessibilityLabel`
- Dynamic Type / font scaling: no fixed heights clipping multi-line body
- Focus order matches visual order on forms
- State changes announced (loading, error, selection)
- Color-only status → add icon or text
- Hit targets ≥ 44 pt (iOS) / 48 dp (Android); verify on smallest shipped device class

### Performance — concrete probes

- Main-thread work during scroll (profile if jank reported)
- Image decode size vs display size
- List virtualization on long feeds
- Avoid blocking launch story beyond platform norms
- Recomposition / re-render hotspots in state-heavy screens

### Theming — concrete probes

- Semantic colors (`Color.primary`, Material roles) vs hard-coded hex in views
- Dark appearance parity (legibility, separator contrast)
- Dynamic Color on Android 12+ with fallback path documented
- Avoid web-gray `#666` literals on native surfaces

### Platform conformance — concrete probes

- Back gesture / navigation stack behavior matches platform
- Safe area / display cutout / keyboard overlap handled
- Controls match platform idioms (not web `<select>` patterns)
- SF Symbols / Material icons consistent; no mixed metaphor sets
- Haptics where platform expects confirmation (destructive, success)

### Adaptivity — concrete probes

- Tablet uses width (split columns, sidebars)—not stretched phone layout
- Landscape rotation without clipped primary action
- Fold / split-screen if product claims support
- Keyboard does not hide primary field without scroll adjustment

---

## Report table (native labels)

| # | Axis | Score | Headline issue |
|---|------|-------|----------------|
| 1 | VoiceOver / TalkBack | ? | |
| 2 | Runtime smoothness | ? | |
| 3 | Semantic color & dark | ? | |
| 4 | Native idioms | ? | |
| 5 | Size classes & rotation | ? | |
| **Total** | | **??/20** | **Band** |

Open with **platform conformance verdict** (native-crafted vs ported web). Mirror web audit bands: 18–20 excellent · 14–17 good · 10–13 acceptable · 6–9 poor · 0–5 critical.

---

## Finding row format

```
**[P?] Short title**
- **Location:** Screen / file:line
- **Category:** a11y | perf | theme | platform | layout
- **Impact:** who loses what capability
- **Guideline:** HIG or Material cite when applicable
- **Fix:** specific API or pattern change
- **Command:** `/ui-design …` when a design-stack verb helps
```

End recommendations with `/ui-design polish` when any fix batch is planned.
