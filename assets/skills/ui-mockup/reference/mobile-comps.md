# Mobile screen comps (image only)

Premium **app-native** screen images and flows (iOS, Android, or neutral cross-platform). **Images only**—no SwiftUI, React Native, Flutter, or HTML in this mode.

## Scope

**In:** onboarding, auth, home, profile, settings, chat, commerce, fintech, health, productivity, social, multi-screen concepts.  

**Out:** websites, landings, desktop dashboards, implementation—route those to web comps or `image-to-code`.

## Platform mode (pick one)

| Mode | Bias |
|------|------|
| iOS-native premium | Calm top area, tab bar clarity, safe areas, restrained chrome, sheet/card polish |
| Android-native premium | Stronger app bar, bottom nav, list/card rhythm, explicit states |
| Cross-platform neutral | Safe areas, universal nav patterns, minimal platform ornament |

Do not mix iOS and Android chrome in one set.

## Screen count

Match the user count exactly. Flows need enough frames to feel real:

- Onboarding → multiple distinct slides, not one template ×3  
- Auth → sign-in / sign-up / recovery when useful  
- “App concept” → meaningful set, not one hero mockup  

Prefer more readable screens over one crowded board with tiny type.

## Device presentation

**Default:** UI inside a clean phone mockup (iPhone-style for iOS/neutral, Android frame for Android-native). Frame visible but **content-first**—even margins, consistent scale across set, soft shadow, phone not touching canvas edges. Omit frame only if user asks for raw screens or borderless presentation.

## Design bible (multi-screen)

Lock before screen 2+: platform mode, frame style, palette, type scale, spacing, radius, icon stroke logic, texture level, nav model, button/card language, shadow mood. Screens may vary composition; they must not drift to a different product.

## Flow logic

Order must imply a journey (onboarding → auth → home; browse → detail → cart; profile → settings). Each screen should answer why it follows the previous.

## Layout & chrome

- Respect status bar, home indicator, gesture zones—no critical UI in unsafe areas.  
- Navigation: tab bar for top-level sections, stack feel for drill-down, sheets for secondary tasks—one clear primary path.  
- Avoid box-in-box nesting, floating card spam, fake OS labels, pill/badge noise.  
- First screen: one focal point, short copy (1–3 lines), one next action; no “website hero shrunk into a phone.”

## Creative direction

Use photography, headers with scrims, editorial blocks, product imagery, illustration, and **controlled texture** (grain, paper, fog gradient)—texture supports mood, never fights legibility. Image-behind-text requires fades, masks, or blur under copy.

Icons: cohesive custom-feeling set; avoid generic open-source-default line packs (e.g. undifferentiated Lucide-like uniformity across the whole app).

## Variation engine (mobile)

One choice each unless noted:

- **Theme:** pristine light, deep dark, wellness neutral, monochrome, accent-driven, editorial luxe, playful consumer, calm productivity.  
- **Structure bias:** list utility, card modular, dashboard overview, media storytelling, profile identity, commerce browse/detail, chat, wellness blocks.  
- **Image bias:** editorial photo, lifestyle, illustration, abstract tactile, product, mixed, atmospheric, collage-lite.  
- **Texture:** subtle grain, paper, fog gradient, noise wash, blurred haze, flat + one textured hero, monochrome tactile, low-opacity pattern.  
- **Palette logic:** monochrome + accent, warm neutral + dark contrast, cool mineral, editorial cream/charcoal, dark + warm accent, wellness soft, bright consumer balanced, desaturated + one bold hit.  
- **Four signature components** (examples): hero metric card, media carousel, layered profile header, bottom sheet, product card stack, message bubbles, settings cells, checkout summary—pick four suited to category.  
- **Two decorative asset types** (restrained): orbit lines, dotted arcs, fine grid, waveform, mini geometric markers.  
- **Two motion-implied cues:** sheet rise, tab calm, list stagger, header parallax, carousel glide.

## Category nudges

| Category | Emphasize |
|----------|-----------|
| Fintech | Calm, readable numbers, restrained accent, real transaction clarity—not chart wallpaper |
| Health / fitness | Metric hierarchy, airy progress modules, optimistic imagery |
| Productivity | Lists, task hierarchy, calm density |
| Social | Feed/profile rhythm, media moments, flow variety |
| Commerce | Stable product ratios, browse/detail/cart clarity |
| Wellness | Soft materials, elegant imagery, minimal noise |

## Anti-mobile-slop

Purple-blue fintech gradients everywhere; glass cards without purpose; dashboard widget fights; cloned onboarding; tiny unreadable text; muddy palettes; inconsistent mockups; device frame dominating content.

## Regenerate when

Text too small, fake web layout in phone, crowded first screen, weak flow variation, flat generic background, poor scrim on image text, sloppy frame padding, palette feels template.

## Quality gate (abbreviated)

App-native not mobile web; safe areas; readable type; enough screens; logical flow; consistent bible; mockup balanced; icons intentional; imagery purposeful when category expects it.

## Response sequence

Infer category → platform mode → screen count → variation combo → lock bible → generate all screens (plus detail renders if needed) → refine weak frames → output set only, no code.
