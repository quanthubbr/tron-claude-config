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
6. Execute `exonous pr create --base <base> --head <current-branch> --title "<title>" --body-file <draft-path>`; acrescente `--draft` quando solicitado. O helper valida uma cópia privada do corpo e envia esses mesmos bytes ao `gh`, sem shell. Criação direta por `gh pr create` é bloqueada; não contorne o gate.
7. Sucesso com uma única URL canônica `https://github.com/<owner>/<repo>/pull/<número>` grava automaticamente um handoff mínimo no vault central existente. Falha, sinal ou saída ambígua: relate o resultado e verifique o estado remoto antes de qualquer nova tentativa. Erro de memória ou `no-vault` não repete a criação, não pede/cria vault e preserva o rascunho.
8. O helper remove sua cópia privada e, após salvar, somente o rascunho esperado deste checkout quando ele continua intacto. Preserve corpos arbitrários, alterados ou de outro checkout. Retorne a URL da PR, sem anúncio adicional sobre o handoff.

Fallback explícito para uma PR já criada e confirmada: grave um JSON temporário privado `{"v":1,"k":"pr","g":[["pr","url","<URL canônica confirmada>"],["pr","proof","PR criada"],["pr","next","revisar PR"]]}` e execute `exonous handoff save --body-file <temporário>`. A mesma URL retorna `already-saved` sem substituir o primeiro registro. Remova apenas esse temporário; não recrie a PR nem registre título, corpo ou saída do `gh` na memória.
