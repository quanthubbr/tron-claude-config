# tron-claude-config

## What This Is

`@tron/claude-config` é o harness de enforcement do Claude Code para repos da tron: um pacote npm que, uma vez instalado como devDependency, injeta hooks (`pre-commit`, `pre-push`), permissions, skills (`/commit-changes`, `/make-pr`), agent isolation e ECC coding rules em qualquer repositório Node.js. O objetivo é padronizar como Claude trabalha em todos os projetos da empresa (e de qualquer time externo que queira adotar o mesmo padrão), sem depender de instruções soltas repetidas em cada repo.

## Core Value

Instalar o pacote deve, de forma automática e sem esforço manual, fazer Claude seguir o fluxo de trabalho do time (commits revisados, PRs com template, isolamento de agentes) em qualquer repo — enforcement via hooks, não via boa vontade do modelo.

## Requirements

### Validated

- ✓ Hooks de `pre-commit`/`pre-push` bloqueando commit/push direto no terminal — existing
- ✓ Skills `/commit-changes` e `/make-pr` como único caminho legítimo para commit/PR (via bypass token) — existing
- ✓ Instalação global (uma vez por máquina) de ECC rules, Karpathy principles, agent isolation contract — existing
- ✓ Auto-update diário via `bootstrap-check.sh` comparando SHA instalado vs remoto — existing
- ✓ `postinstall` script auto-detecta gerenciador de pacotes (npm/bun/pnpm) — existing
- ✓ Todo PR via `/make-pr` em repos com o pacote usa o template padronizado (5 seções PT-BR) — **Phases 2–3:** `managed/skills/make-pr/SKILL.md` + validação `bypass-check.sh` em `.claude/.pr-body-draft.md`
- ✓ Enforcement do template de PR é parte do harness instalável (hook + skill gerenciada), não só README — **Phases 2–3:** `installMakePrSkill()`, `postinstall` gitignores draft, README/MAINTAINER/HARNESS-GUIDE

### Active

- [ ] **Opcional (TPL-01 residual):** extrair template canônico para um único arquivo-fonte no pacote (`PR-TEMPLATE.md` ou equivalente), referenciado por skill e validação sem duplicar array no bash — Phase 1 plan 01-01

### Out of Scope

- Instalação automática de `.github/PULL_REQUEST_TEMPLATE.md` no repo consumidor durante `postinstall` sem o repo já ter GitHub como remoto — o template do PR body é aplicado pela skill `/make-pr` (que já roda `gh pr create`), não por escrita direta no `.github/` do repo consumidor nesta fase; repos que também querem o arquivo `.github/PULL_REQUEST_TEMPLATE.md` local podem copiá-lo manualmente.
- CI/CD workflows (lint/typecheck em PR) — fora do escopo deste harness, que cobre apenas hooks e skills locais.

## Context

- Repo é 100% infraestrutura de tooling: `.claude/` (hooks, settings, skills), `.superpowers/`, `managed/`, `scripts/` (postinstall, setup-claude-harness.sh).
- `package.json`: `@tron/claude-config`, private, `node >=18`, único script é `postinstall`.
- Distribuído via `git+https://github.com/zaqueu-1/tron-claude-config.git` como devDependency — não publicado em registry.
- Repos consumidores adicionam a dependency e rodam install; o `postinstall` faz o resto.
- Duas camadas de enforcement documentadas no README: ECC rules (prioridade em padrões de código) e Karpathy principles (prioridade em comportamento/abordagem).
- `/make-pr` é skill gerenciada (`managed/skills/make-pr/`), install-if-missing em `~/.claude/commands/make-pr.md`; corpo da PR via `--body-file .claude/.pr-body-draft.md`; hook `PreToolUse` valida token + headers.

## Constraints

- **Compatibilidade**: precisa funcionar com npm, bun e pnpm (auto-detectado por lockfile) — não pode assumir um gerenciador específico.
- **Não invasivo**: não deve sobrescrever `CLAUDE.md`, `.claude/commands/` ou `.claude/settings.local.json` do repo consumidor — só adiciona/mescla o que é do harness.
- **Enforcement, não convenção**: qualquer regra nova (como o template de PR) precisa ser aplicada via hook/skill, não apenas documentada em README — do contrário não é "enforced".

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Template de PR vive dentro do fluxo da skill `/make-pr` (não como arquivo estático `.github/PULL_REQUEST_TEMPLATE.md` instalado no repo consumidor) | Skill monta o corpo via `gh pr create --body-file`; hook garante estrutura | **Adopted** — skill gerenciada + `bypass-check.sh` modo `pr` |
| Body-file fixo `.claude/.pr-body-draft.md` em vez de `--body` inline | Hook lê arquivo; evita parse frágil de shell | **Adopted** |
| Lista de seções co-versionada em SKILL + bash até existir arquivo único | Sem shared import entre markdown e bash | **Adopted** (TPL-01 residual opcional) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-27 after Phases 2–3 validated (research reconciled)*
