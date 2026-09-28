# React Native — high-severity implementation guidelines

Subordinate to Emil + Impeccable + Taste. Implementation correctness only; never visual direction.

## Styling

- **Use StyleSheet.create** — Do: StyleSheet for all styles · Don't: Inline style objects

## Navigation

- **Handle back button** — Do: useFocusEffect with BackHandler · Don't: Ignore back button

## Lists

- **Use FlatList for long lists** — Do: FlatList for 50+ items · Don't: ScrollView with map
- **Provide keyExtractor** — Do: keyExtractor with stable ID · Don't: Index as key
- **Optimize renderItem** — Do: React.memo for list items · Don't: Inline render function

## Images

- **Specify image dimensions** — Do: width and height for remote images · Don't: No dimensions for network images

## Forms

- **Handle keyboard** — Do: KeyboardAvoidingView · Don't: Content hidden by keyboard

## Animation

- **Run on UI thread** — Do: Run animations on UI thread · Don't: JS thread animations

## Async

- **Handle errors gracefully** — Do: Error UI for failed requests · Don't: Crash on error
- **Cancel async operations** — Do: AbortController or cleanup · Don't: Memory leaks from async

## Accessibility

- **Add accessibility labels** — Do: accessibilityLabel for all interactive · Don't: Missing labels
- **Support screen readers** — Do: Test with screen readers · Don't: Skip accessibility testing

## Testing

- **Test on real devices** — Do: Test on iOS and Android devices · Don't: Simulator only

## Native

- **Use native modules carefully** — Do: Batch native calls · Don't: Frequent bridge crossing
- **Handle permissions** — Do: Check and request permissions · Don't: Assume permissions granted
