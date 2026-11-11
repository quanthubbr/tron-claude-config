---
name: issue-board
description: Mostra no terminal, em tabelas, as issues abertas que o dev tem para fazer em qualquer GitHub Project (v2), separadas por tipo, prioridade, dificuldade, status, repo ou um campo do board. O agente classifica o que o board não classifica. Use quando o usuário pedir "minhas issues", "o que tenho pra fazer", "mostra o board", "rankeia as issues", "separa as issues por dificuldade/tipo".
---

# Issue Board

Use `exonous issue-board` (Node 18+), com `gh` autenticado para buscar o board. O renderizador e a classificação funcionam offline sobre o cache.

A skill não conhece nenhum projeto. O board (owner e número), os nomes dos campos e a lista de tipos moram em `config.json`, que é por pessoa e nunca vai versionado. Sem `types` no config, valem os tipos neutros embutidos: bug, feature, interface, dados, performance, segurança, infra, outros.

## 1. Pré-requisitos

O `fetch` checa a auth antes de tudo e depois o board. Trate pelo código de saída:

1. **Código 4: sem `gh`.** Peça para instalar o GitHub CLI (https://cli.github.com) e pare.
2. **Código 2: sem auth.** Pare e mande o usuário rodar no prompt:
   ```
   ! gh auth login -s read:project
   ```
   Se a mensagem citar escopo, é `! gh auth refresh -s read:project`. Não contorne, não use token de outra pessoa, não continue sem auth.
3. **Código 3: board não definido ou inválido.**
   - descubra o owner pelo remote do repo atual (`gh repo view --json owner -q .owner.login`), ou pergunte;
   - liste os boards com `gh project list --owner <owner>`;
   - pergunte qual usar com AskUserQuestion;
   - copie `config.example.json` para `config.json` e preencha `owner` e `projectNumber`.

   Para olhar outro board sem mexer no config, passe `--owner x --project-number n` em qualquer comando.
4. **Campos do board (opcional).** Rode `gh project field-list <n> --owner <owner>` e ajuste `fields` no config se os nomes forem outros:
   - `status`, `priority` e `size` são os nomes dos campos no board;
   - `group` é um campo single-select extra que vira coluna e agrupamento (ex.: "Área", "Squad").

   Só campos **single-select** são lidos; campo de texto, número ou iteration é ignorado.

   Quando os valores de prioridade ou tamanho não forem P0–P3 / High / Low ou XS–XL / Small / Large, mapeie em `priorityMap` (valor → `P0..P3`) e `sizeMap` (valor → `1..3`). Valor sem mapa aparece cru na coluna.
5. **Tipos (opcional).** Se o usuário quiser outras categorias, grave em `types` uma lista de `{ id, name, hint }`.

## 2. Fluxo

```bash
exonous issue-board fetch
exonous issue-board pending
# classifique (seção 3), grave num arquivo temporário FORA do repo (ex.: $TMPDIR) e aplique:
exonous issue-board classify <arquivo.json>
exonous issue-board render
exonous issue-board render --json
exonous issue-board render --markdown
```

Rodado dentro de um repo git que tem issues no board, o escopo padrão é esse repo (casado pelo nome dos remotes, então fork e upstream valem). Fora de um repo, ou num repo que não está no board, vale o board inteiro. O cabeçalho do `render` diz qual repo está no escopo.

Flags de escopo e filtro (valem para `pending` e `render`):

| Flag | Efeito |
|---|---|
| `--all` | todas as pessoas, não só as suas |
| `--todos-repos` | todos os repos do board, ignorando o repo atual |
| `--user login` | issues de outra pessoa |
| `--por tipo\|prioridade\|dificuldade\|campo\|status\|repo` | agrupamento (padrão `tipo`); `campo` usa `fields.group` |
| `--prioridade P0,P1` · `--dificuldade facil` · `--tipo bug` · `--campo valor` · `--repo nome` · `--status ready` | filtros: vários valores separados por vírgula; casam por trecho, sem diferenciar maiúscula nem acento (`--status ready` também pega "Not ready"); `--tipo` aceita id ou nome; `--repo` substitui o escopo do repo atual |

O cache fica em `data/<owner>-<número>/` dentro da skill compartilhada em `~/.agents/skills/issue-board`; instalações antigas em `~/.claude/skills/issue-board` continuam legíveis. `--skill-dir <pasta>` seleciona outra cópia explicitamente.

A saída do Bash nem sempre aparece para o usuário. Para colar na resposta, rode `exonous issue-board render --markdown` e cole a saída como markdown, fora de bloco de código, exatamente como saiu, sem reformatar. A tabela corta o título para caber em `--width` (padrão 100) e deixa a URL fora; os links vêm numa lista `- #n url` abaixo de cada grupo. Tabela mais larga que o terminal vira lista vertical no Claude Code, então não junte colunas nem ponha a URL de volta. Nunca cole a tabela de bordas no chat.

A tabela de bordas é para o terminal. Com cor, a coluna Link é `↗ abrir`, clicável (OSC 8). Sem cor, ela mostra a URL sem `https://` no lugar das colunas ID e Repo.

## 3. Como classificar

Cada issue do `pending` vira `{ "key", "type", "priority", "difficulty", "note" }`:

- `type`: um `id` da lista `types` que o `pending` devolve. Use o `hint` de cada tipo. Não invente tipo; se nada encaixa, use o mais genérico da lista.
- `priority`:
  - **P0**: quebra dado ou fluxo principal do usuário agora, ou bloqueia receita/entrega;
  - **P1**: bug visível ou risco sério (segurança, vazamento de dados);
  - **P2**: melhoria importante, sem dano em curso;
  - **P3**: pode esperar.
- `difficulty`: **1** até um dia · **2** poucos dias · **3** uma semana ou mais, ou depende de decisão.
- `note` (opcional, até ~40 caracteres): o que ajuda a ordenar ("duplica #123", "decisão de produto", "só print, confirmar").

Leia título **e** corpo antes de classificar. Issue com título vago e só imagem: classifique pelo título e anote "só print, confirmar".

**O board vence.** Se `Priority` ou `Size` já estão preenchidos no board, o `render` usa esse valor. A sugestão do agente só aparece onde o campo está vazio, marcada com `~`. Não altere campos do board sem o usuário pedir.

A classificação é gravada por `owner/repo#número` e reaproveitada nas próximas vezes: rode `pending` de novo e classifique só o que vier. Issue transferida muda de chave e volta ao `pending`.

## 4. Resposta ao usuário

1. A saída do `render --markdown`, começando pelo cabeçalho (total, contagem por prioridade e repo). Não escreva outra linha de total antes dela: repete o cabeçalho.
2. Uma linha dizendo o que pegar primeiro: a issue de maior prioridade e, entre elas, a de menor dificuldade.
