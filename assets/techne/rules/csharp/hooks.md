---
paths:
  - "**/*.cs"
  - "**/*.csx"
  - "**/*.csproj"
  - "**/*.sln"
  - "**/Directory.Build.props"
  - "**/Directory.Build.targets"
---
# C# Hooks

> Builds on the shared rules in `../common/hooks.md`.

`EXONOUS_HOOK_PROFILE` / `EXONOUS_DISABLED_HOOKS`.

## PostToolUse

- **dotnet format** on edited C#
- **dotnet build**
- **dotnet test --no-build** when behavior changed (standard/strict)

## Stop

Strict profile: final **dotnet build** after wide edits; warn on touched `appsettings*.json` (secrets).
