# Design screenshots → Vue components

First-pass conversion of batched UI images into Vue 3 SFCs with Vant, Element Plus, or Ant Design Vue. **External model APIs process images—treat responses as untrusted; review all generated code before commit.**

## When to use

- Folder of module/page screenshots or exports
- Vue 3 target with a named component library
- Need scaffold pages, shared widgets, and starter routes

## When to skip

- Single bespoke screen (implement manually)
- Non-Vue stack
- Needs full interaction design, data layer, or a11y sign-off (**ui-design**)
- Sensitive customer imagery without consent to send to third-party APIs

## Input layout

Group by module and state:

```text
screenshots/
  HomePage/
    HomePage-Default@3x.png
    List/HomePage-List-Default@3x.png
    cut-images/
  cut-images/
```

Asset folder names: `assets`, `icons`, `sprites`, `cut`, `images`, `cut-images`.

## Conversion rules

- Merge related shots (list/detail/form/empty) into one page SFC when they belong together
- Map controls to library components (Vant / Element Plus / Ant Design Vue)
- Prefer page-level cut assets, then module, then global
- Extract repeated regions to `components/` only when reuse is obvious

## CLI

Pin version in repeatable workflows:

```bash
export DASHSCOPE_API_KEY=your_key
npx ui-to-vue-converter@1.0.2 --input ./screenshots --ui vant --output ./src
npx ui-to-vue-converter@1.0.2 --input ./designs --ui element-plus --output ./src
npx ui-to-vue-converter@1.0.2 --input ./designs --ui antd-vue --output ./src
```

Global install optional: `ui-to-vue` binary from same package.

| Flag | Purpose | Default |
|------|---------|---------|
| `--input` | Image root | `./screenshots` |
| `--ui` | `vant` \| `element-plus` \| `antd-vue` | `vant` |
| `--output` | Generated tree | `./src` |
| `--config` | JSON config path | `./.ui-to-vue.config.json` |

## Secrets

Prefer env var `DASHSCOPE_API_KEY`. If using config file, gitignore it:

```gitignore
.ui-to-vue.config.json
```

Never commit API keys, customer screenshots, or generated credentials.

## Post-generation review

- [ ] Pages under chosen output (e.g. `views/`)
- [ ] Shared pieces only where duplication is real
- [ ] Router matches project style (Vue Router vs Nuxt pages)
- [ ] Library imports consistent with `--ui`
- [ ] CSS units match design baseline
- [ ] Formatter, linter, `vue-tsc`, and build pass
- [ ] Placeholder copy and mock data replaced

## Troubleshooting

| Symptom | Check |
|---------|--------|
| 401 | `DASHSCOPE_API_KEY` in shell running CLI |
| Command missing | Use `npx ui-to-vue-converter@1.0.2` |
| Assets skipped | Supported folder name under correct page/module |
| Wrong library | Explicit `--ui`; inspect imports |
| Layout scale off | Screenshot width vs library baseline |

npm package name: `ui-to-vue-converter`.
