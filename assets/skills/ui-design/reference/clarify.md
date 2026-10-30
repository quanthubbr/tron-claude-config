> **Gather:** audience literacy and emotional context for the flow.

Rewrite unclear UI copy so users know what happened, what matters, and what to do next. Keep facts, product terms, and brand voice.

## Audit language


```clarify-body
Walk the full path—not isolated strings. Flag:

- ambiguous nouns/verbs/actions;
- jargon or assumed knowledge;
- vague labels, outcomes, states;
- missing consequences, recovery, timing;
- inconsistent terms/capitalization;
- redundant headings, intros, helpers, confirmations;
- copy that breaks at realistic widths or in translation;
- tone mismatched to stress, risk, success, urgency.

Infer audience from product and surrounding UI. Ask before changing claims, legal meaning, or possibly domain-specific terms.

## Message hierarchy per state

1. the one fact needed now;
2. next action;
3. context that changes the decision;
4. tone for the moment.

Say each idea once. If the heading states the state, the intro adds new info or goes away.

## Rewrite by function

### Actions and navigation

Specific verb + object when outcome isn’t obvious. Labels describe what happens—not the gesture. Same noun/verb for the same concept everywhere.

Destructive: name object and consequence. Prefer undo when safe. Confirmations: name the action on message and button— not Yes/No/OK/Submit alone.

### Forms

Persistent labels; placeholders are examples. Requirements before submit. Explain non-obvious asks. Consistent required/optional.

Validation: what to fix and how—no blame. Instructions near fields; errors announced accessibly.

### Errors and permissions

Actionable errors answer: what failed; why (if known/useful); recovery or alternative.

No raw internal codes as primary message. No false promises. Serious domains (privacy, payment, deletion, access, blocked work): warmth OK, jokes not.

### Loading, empty, success

Loading names real work; honest timing; determinate progress when available—never fake progress.

Empty: distinguish first use, no results, filters, permissions, failure—state + next action.

Success: confirm outcome; mention next step only if behavior changes. Routine success stays brief.

### Help

Helper text answers implicit questions—not restates the control. Progressive disclosure for rare detail. Link text meaningful alone; icon controls need accessible names.

## Voice, a11y, i18n

Consistent voice; tone adapts to moment. Plain language without dumbing domain terms the audience knows.

- Complete translatable sentences—not concatenated fragments.
- Structured variables/numbers for translators.
- Room for expansion.
- Alt text carries information; empty alt for decoration.
- SR names match visible labels/outcomes.
- Message not carried by punctuation/color/icon alone.

Glossary when terms drift. No synonym roulette in UI.

## Verify

In context: comprehension without insider knowledge; actionability at errors/empty/decisions; accuracy and terms; scanability at width and 200% zoom; long names, i18n, plurals, dynamic values; accessible names and announcements; tone vs consequence.

As short as possible without losing meaning or recovery.

Then `/ui-design polish`.

```
