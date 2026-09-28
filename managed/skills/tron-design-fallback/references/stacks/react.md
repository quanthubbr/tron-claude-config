# React — high-severity implementation guidelines

Subordinate to Emil + Impeccable + Taste. Implementation correctness only; never visual direction.

## State

- **Avoid unnecessary state** — Do: Compute derived values in render · Don't: Store derivable values in state

## Effects

- **Clean up effects** — Do: Return cleanup function in useEffect · Don't: No cleanup for subscriptions
- **Specify dependencies correctly** — Do: All referenced values in dependency array · Don't: Empty deps with external references
- **Avoid unnecessary effects** — Do: Transform data during render handle events directly · Don't: useEffect for derived state or event handling

## Rendering

- **Use keys properly** — Do: Use stable IDs as keys · Don't: Array index as key for dynamic lists

## Events

- **Pass event handlers not call results** — Do: onClick={handleClick} · Don't: onClick={handleClick()} causing immediate call

## Hooks

- **Follow rules of hooks** — Do: Hooks at component top level · Don't: Hooks in conditions loops or callbacks
- **Name custom hooks with use prefix** — Do: useFetch useForm useAuth · Don't: fetchData or getData for hook

## Context

- **Memoize context values** — Do: useMemo for context value object · Don't: New object reference every render

## Performance

- **Virtualize long lists** — Do: react-window or react-virtual · Don't: Render thousands of DOM nodes

## ErrorHandling

- **Use error boundaries** — Do: ErrorBoundary wrapping sections · Don't: Let errors crash entire app
- **Handle async errors** — Do: try/catch in async handlers · Don't: Unhandled promise rejections

## Accessibility

- **Use semantic HTML** — Do: button for clicks nav for navigation · Don't: div with onClick for buttons
- **Manage focus properly** — Do: Focus trap in modals return focus on close · Don't: No focus management
- **Label form controls** — Do: htmlFor matching input id · Don't: Placeholder as only label

## TypeScript

- **Type component props** — Do: interface Props with all prop types · Don't: any or missing types
