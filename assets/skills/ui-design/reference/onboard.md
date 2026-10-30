> **Gather:** the first “worth it” moment and typical user skill level.

Reach first value fast. Onboarding is not a product course—it proves the product is worth the user’s time.

## Assess

1. **Challenge**
   - user goal;
   - confusion or drop-off points;
   - target “aha” moment.

2. **Users**
   - skill level; motivation; time budget; prior tools/competitors.

3. **Success**
   - minimum learning for success;
   - key first action;
   - metrics: completion, time-to-value.

**CRITICAL:** Shortest path to value—not exhaustive teaching.

## Principles

### Show, don’t tell
Working examples in real UI; progressive disclosure; one concept at a time.

### Optional when possible
Skip for experts; never block the product; clear “explore on my own.”

### Time to value
Front-load the 20% that delivers 80%; defer advanced features to context.

### Context over ceremony
Teach when needed; empty states as teachable moments; point-of-use hints.

### Respect intelligence
Concise; assume standard pattern literacy.

## Patterns

### First run
- Welcome: value prop, honest time estimate, skip.
- Setup: minimal fields, explain asks, defaults, social login when fit.
- Concepts: 1–3 core ideas, interactive, progress (e.g. step 1 of 3).
- First win: real accomplishment, templates, light celebration, next steps.

### Discovery
- **Empty states:** what appears here, why it matters, CTA, template option.
- **Tooltips:** first encounter, point at control, dismiss + “don’t show again,” optional learn-more.
- **Announcements:** new features, try now, dismissable.
- **Progressive:** teach on encounter; badge unused features; unlock complexity gradually.

### Tours (complex UIs, big changes, domain-heavy tools)
- Spotlight; 3–7 steps; free navigation; skip; replay from help.
- Interactive real controls; workflow-focused copy; sample data.

### Tutorials (hands-on practice, high stakes)
- Sandbox data; clear objective; steps; validation; graduation.

### Help
Contextual `?`, shortcuts, searchable docs, videos for hard flows.

## Empty states need

What will appear; why it matters; how to start (CTA/template); visual interest; optional short tutorial link.

Types: first use, user cleared, no results, no permission, load failure.

## Implementation notes

Libraries: Tippy/Popper, Intro/Shepherd/Joyride; focus-trap modals; localStorage for seen state; analytics on completion/drop-off.

```javascript
localStorage.setItem('onboarding-completed', 'true');
```

Track dismissals—never repeat ignored onboarding.

**NEVER:** long blocking tours; patronizing copy; repeat tooltips; full UI block during tour; disconnected tutorial mode; upfront overload; hidden skip; re-show initial onboarding to returners.

## Verify

Completion time, comprehension, next action taken, skip rate, completion rate, time-to-value.

Then `/ui-design polish`.
