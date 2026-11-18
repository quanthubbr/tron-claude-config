---
name: issue-create
description: Cria issues no GitHub seguindo o padrão do time (título, modelo de descrição, labels, assignees, campos do GitHub Project v2, sub-issue nativa) e valida antes de criar. O padrão mora em config.json, por pessoa, a partir de um preset. Use quando o usuário pedir "abre uma issue", "cria a task", "registra isso no board", "quebra em sub-issues", "cria o épico".
---

# Issue Create

Use `exonous issue-create` (Node 18+), com `gh` autenticado com escopo `project`. O engine valida o rascunho offline; só `create` chama o `gh`.

A skill não conhece nenhum time. O padrão (formato do título, templates de descrição, labels por repo, assignees obrigatórios, board e campos obrigatórios) mora em `config.json`, que é por pessoa e nunca vai versionado. O time mantém o seu arquivo de padrão no próprio repo e cada pessoa instala com `init --from`.

## 1. Pré-requisitos

Trate pelo código de saída:

1. **Código 4: sem `gh`.** Peça para instalar o GitHub CLI (https://cli.github.com) e pare.
2. **Código 2: sem auth ou sem escopo.** Pare e mande o usuário rodar no prompt `! gh auth refresh -s project` (ou `! gh auth login -s project`). Não contorne.
3. **Código 3: padrão não definido.** Pergunte onde está o arquivo de padrão do time e rode `exonous issue-create init --from <arquivo.json>`. Sem arquivo, `exonous issue-create init` copia `config.example.json`; ajuste com o usuário. Para trocar um padrão já instalado, `--force`.

## 2. Fluxo

```bash
exonous issue-create standard            # leia antes de escrever o rascunho
# escreva o rascunho num arquivo temporário FORA do repo (ex.: $TMPDIR/issue.json)
exonous issue-create check <issue.json>  # violações do padrão, ou a issue como vai ficar
# mostre título, labels, campos e corpo ao usuário e espere o ok
exonous issue-create create <issue.json>
```

Rascunho:

```json
{
  "repo": "owner/repo",
  "template": "bug",
  "title": "Order Pad: campo Total deve ficar fixo ao digitar a quantidade",
  "sections": { "Problema": "...", "Onde acontece": "...", "Critérios de aceite": "- [ ] ..." },
  "labels": ["bug"],
  "assignees": ["@me"],
  "fields": { "Status": "Ready to Dev", "Priority": "P1", "Size": "S", "Start date": "2026-11-17" },
  "parent": 823
}
```

- `sections`: chaves = nomes das seções do template (`standard` lista). A ordem do corpo segue o template; seção vazia sai do corpo. Seção obrigatória vazia reprova.
- `labels`: o engine põe a label de tipo do template se faltar, espelha label de prioridade quando o padrão manda (`labels.mirror`) e reprova label fora da lista do repo. **Nunca crie label nova.**
- `assignees`: `requiredAssignees` do padrão entram sozinhos.
- `fields`: por **nome**, como aparecem no board. O engine resolve os IDs na hora e recusa opção que não existe. **Nunca crie opção ou coluna nova.** Datas em `YYYY-MM-DD`.
- `parent`: número (mesmo repo), `owner/repo#n` ou URL. Liga como sub-issue nativa; rodar de novo não duplica.

## 3. Como escrever

- Título: o formato de `title.hint`. Bug descreve o **sintoma observável**; feature, o **resultado** para quem usa. Prefixo de commit (`fix(...)`) só em sub-issue que é 1:1 com um PR empilhado.
- Corpo: evidência (log, query, horário, conta, ambiente) vale mais que texto. Critérios de aceite em `- [ ]`, cada um verificável.
- Campos de julgamento (prioridade, tamanho e notas 1–5): valor sensato pelo `fieldHints`, dizendo ao usuário o que escolheu para ele ajustar.
- Trabalho maior que o maior tamanho razoável vira épico (`template: epico`) e uma issue por PR com `parent`.
- Não invente o que não sabe: causa não confirmada vai como hipótese ou fica de fora.

## 4. Falha no meio

Se a issue foi criada e o board ou o pai falharam, o erro traz o comando para completar **sem duplicar**:

```bash
exonous issue-create create <issue.json> --issue <url>
```

`--dry-run` valida e imprime a issue normalizada em JSON sem chamar o `gh`.

## 5. Depois de criar

- Responda com a URL e uma linha com o que foi preenchido (labels, campos, pai).
- Ao abrir o PR, siga `pr` do padrão quando existir: referência simples (`pr.reference`), sem `Closes/Fixes` se `pr.forbidClosingKeywords`, e branch vinculada no campo Development (`pr.developmentLink`).
- Status anda conforme o trabalho, até onde o padrão permite ao agente; quem fecha é humano.
