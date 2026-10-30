---
paths:
  - "**/*.pl"
  - "**/*.pm"
  - "**/*.t"
  - "**/*.psgi"
  - "**/*.cgi"
---
# Perl Testing

> Builds on the shared rules in `../common/testing.md`.

## Framework

**Test2::V0** for new work.

```perl
use Test2::V0;
is($got, 42, 'computation');
done_testing;
```

## Runner

```bash
prove -l t/
prove -lr -j8 t/
```

Always `-l` so `lib/` is on `@INC`.

## Coverage

**Devel::Cover** — target ~80%: `cover -test`.

## Mocks

Test::MockModule / Test::MockObject.

End every file with `done_testing`.

Loop: `techne:quality` skill.
