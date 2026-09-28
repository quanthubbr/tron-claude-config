# Vue — high-severity implementation guidelines

Subordinate to Emil + Impeccable + Taste. Implementation correctness only; never visual direction.

## Reactivity

- **Access ref values with .value** — Do: Use .value in script · Don't: Forget .value in script

## Watchers

- **Clean up side effects** — Do: Return cleanup in watchEffect · Don't: Leave subscriptions open

## Props

- **Avoid mutating props** — Do: Emit events to parent for changes · Don't: Direct prop mutation

## Lifecycle

- **Use onMounted for DOM access** — Do: onMounted for DOM operations · Don't: Access DOM in setup directly
- **Clean up in onUnmounted** — Do: onUnmounted for cleanup · Don't: Leave listeners attached

## Templates

- **Avoid v-if with v-for** — Do: Wrap in template or computed filter · Don't: v-if on same element as v-for
- **Use key with v-for** — Do: Unique key for each item · Don't: Index as key for dynamic lists

## State

- **Use storeToRefs for destructuring** — Do: storeToRefs(store) · Don't: Direct destructuring

## Accessibility

- **Use semantic elements** — Do: button nav main for purpose · Don't: div for everything

## SSR

- **Handle hydration mismatches** — Do: ClientOnly for browser-only content · Don't: Different content server/client
