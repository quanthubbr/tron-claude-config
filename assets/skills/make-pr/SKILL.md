---
name: make-pr
description: Abre PR da branch atual com base detectada, template do projeto, texto humano em PT-BR e handoff compacto após sucesso. Use para "abrir PR", "make-pr" ou "criar pull request".
model: sonnet
---

1. Confirme que a branch não é `main`/`master`, está limpa e publicada/atualizada no origin. Trabalho pendente: use `/commit-changes` quando autorizado, ou informe o impedimento.
2. Resolva `<base>` nesta ordem; nunca assuma `main`:
   - Base explícita em `$ARGUMENTS`: respeite-a.
   - `hotfix/*` ou `revert/*`: produção (`main`, ou `master` se for a disponível).
   - Após `git fetch origin --quiet --prune`, compare as branches remotas com `HEAD` usando `git merge-base` e `git rev-list --count <merge-base>..HEAD`. Escolha a menor distância, excluindo a branch atual e `origin/HEAD`. Empate: `develop`, default do origin, `main`, `master`, demais em ordem alfabética. Isso preserva PRs empilhadas.
   - Sem candidata: `develop` se existir no origin; senão default via `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`.
   - Base automática `main`/`master` com `develop` existente: use `develop`, exceto em `hotfix/*`, `revert/*`, `release/*`.
   Informe a base e o motivo antes de criar.
3. Leia `git log origin/<base>..HEAD --oneline`, `git diff --stat origin/<base>...HEAD` e os hunks relevantes. Conte `git diff --name-only origin/<base>...HEAD`: máximo 30 arquivos. Acima disso, proponha divisão coesa antes de abrir PRs menores/empilhadas.
4. Execute `exonous template`. Escreva um corpo humano, conciso e em PT-BR, com todos os títulos na ordem do template. No padrão: `## Resumo`, `## Principais mudanças`, `## Arquitetura & implementação`, `## Antes → Agora`, `## Roteiro de teste`. Seção inaplicável mantém título e `_N/A — não aplicável a esta mudança_`. Relate apenas validação observada; sem menção a agentes/IA, créditos ou coautoria. Título convencional em inglês (`type: short description`); `$ARGUMENTS` pode orientar título/contexto.
5. Execute `exonous draft-path`, grave o corpo nesse caminho literal e execute `exonous validate-pr <draft-path>`. Corrija falhas antes de continuar.
6. Execute como comando isolado (opcionalmente após um `cd <dir> &&`):
   `gh pr create --base <base> --head <current-branch> --title "<title>" --body-file <draft-path>`
   Gate bloqueou: leia a razão, rode `exonous workflow pr`, corrija e tente novamente. Falha do `gh`: reporte; não grave handoff de PR criada.
7. **Só após sucesso do `gh`**, preserve a URL retornada e grave silenciosamente um JSON temporário privado com:
   `{"v":1,"k":"pr","g":[["pr","url","<URL retornada>"],["pr","did","<principal mudança concreta>"],["pr","proof","<comando e resultado realmente observado; ou validação pendente>"],["pr","next","<próxima ação concreta>"]]}`
   Resuma o que foi feito em uma tripla `did` curta e concreta. Use valores únicos e referências curtas, sem nós redundantes, narrativa ou segredos. Execute `exonous handoff save --body-file <temporário>`. O helper acrescenta instante/repo/branch/HEAD e salva no único vault central existente. Capture o resultado sem mostrá-lo; `no-vault`, helper ausente ou erro de gravação não transforma a PR criada em falha nem pede/cria vault.
8. Remova apenas os temporários desta execução (corpo e handoff). Retorne a URL da PR, sem anúncio adicional sobre o handoff.
