# Expo & React Native motion

Mobile constraints: no hover (press instead), two runtimes (keep motion on UI thread via Reanimated worklets), finger on glass (interruptibility and velocity are baseline).

## Hard rules

1. Gate purpose/frequency first.
2. Reanimated over core `Animated` for gestures.
3. Table springs/easing — no guesses.
4. Reduced motion ships with the feature.
5. Verify on **release build**, slowest supported device — not Expo Go alone.

## Build sequence

### 1–2. Gate & purpose

| Frequency | Decision |
| --- | --- |
| 100+/day tabs, keyboard, scroll | No animation / platform default |
| Tens/day press, row pick | &lt;150ms subtle or none |
| Occasional sheet, modal, toast | Standard |
| Rare success / empty / celebration | Delight |

Tab switches: **`animation: 'none'`** — peers, not depth stack.

### 3. Tool ladder

| Need | Tool |
| --- | --- |
| Two-state press/toggle/color | Reanimated CSS `transitionProperty` |
| Loop / mount-only | Reanimated CSS keyframes |
| Mount/unmount/list reflow | Layout animations (`entering`/`exiting`/`itemLayoutAnimation`) |
| Finger or scroll-driven | `useSharedValue` + `Gesture` + `useAnimatedStyle` |
| Screen change | Expo Router native stack options |
| Sheet as route | `presentation: 'formSheet'` |
| Tab bar | `NativeTabs` |
| Keyboard-attached UI | `react-native-keyboard-controller` |
| Illustration | Lottie (not UI state) |
| Canvas-heavy | Skia |

Install with `npx expo install <pkg>` for SDK-aligned versions.

| Package | Role |
| --- | --- |
| react-native-reanimated + react-native-worklets | Animation |
| react-native-gesture-handler | Gestures |
| expo-router | Nav, sheets, native tabs |
| expo-haptics | Tactile feedback |
| react-native-keyboard-controller | Keyboard sync |

### 4. Properties

- `transform` + `opacity` default; layout props re-run Yoga for siblings every frame.
- Exception: absolute pill/bar with no children — animating `width` preserves corner radius vs `scaleX`.
- Transform array order matters: translate before scale unless intentional.
- No animated `BlurView` intensity or Android `elevation` — crossfade static layers.
- `translateY('100%')` = own height.

### 5. Spring vs timing

**Finger involved → spring** with Apple-style params:

| Case | Config |
| --- | --- |
| Settle, no overshoot | `{ duration: 400, dampingRatio: 1 }` |
| Snap after drag | `{ duration: 400, dampingRatio: 0.8, velocity }` |
| Sheet | `{ duration: 300, dampingRatio: 0.8, velocity }` |
| Hard edge | `overshootClamping: true` |

Timing without finger — same easing table as web; Reanimated:

```js
import { Easing } from 'react-native-reanimated';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);
const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);
```

Durations: press 100–150ms; toggle 150–200ms; sheets ~300ms spring feel; navigation — platform default.

### 6. Stay off JS thread

- No `setState` per frame from pan/scroll — shared value + `useAnimatedStyle`.
- `scheduleOnRN` (Reanimated 4) only on `onEnd` or threshold — not every `onUpdate`.
- Never read/write shared values during render — `.get()` / `.set()` in worklets/handlers/effects.
- Worklet functions need `'worklet'` first line.

### 7–9. Press, haptics, reduced motion

Press-in feedback 0.97 scale 100–150ms; 44pt targets + `hitSlop`; `pressRetentionOffset`.

Haptics: selection on detents; light impact on snap; medium on heavy commit; notification on success/error — same frame as visual, once per action, never sole feedback. From worklet: `scheduleOnRN(Haptics.selectionAsync)`.

```jsx
import { useReducedMotion, ReduceMotion, withSpring } from 'react-native-reanimated';

const reduce = useReducedMotion();
withSpring(target, { duration: 300, dampingRatio: 0.8, reduceMotion: ReduceMotion.System });
```

Screen transitions → `animation: 'fade'` when reduced.

## Setup pitfalls

- `GestureHandlerRootView` at root.
- Reanimated 4 needs New Architecture; worklets Babel plugin via `babel-preset-expo`.
- ProMotion: `CADisableMinimumFrameDurationOnPhone: true` in app config when missing.

## Shared worklets

```js
function project(velocity, decel = 0.998) {
  'worklet';
  return ((velocity / 1000) * decel) / (1 - decel);
}

function rubberband(overshoot, size, k = 0.55) {
  'worklet';
  return (overshoot * size * k) / (size + k * Math.abs(overshoot));
}
```

## Recipes

Assume:

```bash
npx expo install react-native-reanimated react-native-worklets react-native-gesture-handler expo-haptics
```

Root wrap:

```jsx
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack />
    </GestureHandlerRootView>
  );
}
```

### Press scale (CSS transition on Animated.View)

```jsx
function ScaledPressable({ onPress, children }) {
  const [down, setDown] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      hitSlop={12}
      pressRetentionOffset={16}
    >
      <Animated.View style={[styles.chip, down && styles.chipDown]}>{children}</Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    transform: [{ scale: 1 }],
    transitionProperty: 'transform',
    transitionDuration: '120ms',
    transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
  },
  chipDown: { transform: [{ scale: 0.97 }] },
});
```

### Draggable sheet (custom — prefer formSheet when route-level)

Capture start offset; rubber-band upward; project velocity for dismiss; pass velocity into spring; backdrop opacity from same `translateY`.

### Swipe-to-delete row

Prefer `ReanimatedSwipeable` for action buttons; custom pan when commit-on-flick. `activeOffsetX` so vertical scroll wins. List reflow: `itemLayoutAnimation={LinearTransition.duration(200)}` at module scope.

### Collapsing header

Fixed header height; translate/opacity inner content from scroll shared value — never animate header `height` on scroll.

### List entrances

Memoize `FadeInDown.delay(index * 40)` per row; **no `entering` on virtualized rows** — container once or reflow-only animation.

### Keyboard footer

`KeyboardProvider` at root; `useReanimatedKeyboardAnimation()` → `translateY` on footer.

### Tab pill

Measure tab layouts once; animate `translateX` + `width` on absolute pill; `Haptics.selectionAsync()` on press.

### Stack / formSheet

```jsx
<Stack screenOptions={{ animation: reduce ? 'fade' : 'default' }}>
  <Stack.Screen name="detail" options={{ animation: 'slide_from_right', animationMatchesGesture: true }} />
  <Stack.Screen name="picker" options={{
    presentation: 'formSheet',
    sheetAllowedDetents: 'fitToContents',
    sheetGrabberVisible: true,
  }} />
</Stack>
```

Android: max three detents; grabber iOS-only; formSheet content must have intrinsic height for `fitToContents`.

### Toast

Module-scope `FadeInDown` / `FadeOutDown` ~300ms / 250ms; exit same axis as enter; respect safe area insets.

### Threshold haptic

`useAnimatedReaction` on boolean threshold — schedule haptic only when value crosses, not every frame.

## Never ship

PanResponder; per-frame `scheduleOnRN`; shared value in render; core Animated for pans; sliding tabs; distance-only dismiss (use velocity &gt; ~0.11); haptic without visual.
