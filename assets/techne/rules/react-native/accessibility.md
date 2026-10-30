---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---
# React Native accessibility

Label interactive controls (`accessibilityRole`, `accessibilityLabel`); icon-only buttons need labels. Use `accessibilityState` for disabled/selected/expanded.

Announce async errors/toasts; don't rely on color alone; WCAG AA contrast both themes.

Touch targets ~44pt iOS / 48dp Android; support dynamic type; respect reduced motion.

Test VoiceOver and TalkBack on devices; align tests with role/label queries.
