---
name: issue-board
description: Mostra no terminal, em tabelas, as issues abertas que o dev tem para fazer em qualquer GitHub Project (v2), separadas por tipo, prioridade, dificuldade, status, repo ou um campo do board. O agente classifica o que o board não classifica. Use quando o usuário pedir "minhas issues", "o que tenho pra fazer", "mostra o board", "rankeia as issues", "separa as issues por dificuldade/tipo".
---

# Issue Board

Tudo roda por `node board.mjs`, ao lado deste arquivo. Não tem dependências: basta Node 18+ e `gh`.

Para ver, prefira `render.py`, também ao lado: desenha as mesmas tabelas com o pacote Python `rich` (badges de prioridade, cor por status, número da issue clicável). Aceita as mesmas flags do `render`. Sem `rich` instalado, ele avisa e cai no render do `board.mjs`. Para instalar: `pip install rich`.

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
S=~/.claude/skills/issue-board
node $S/board.mjs fetch        # lê o board; padrão = issues atribuídas a quem está logado
node $S/board.mjs pending      # JSON com os tipos válidos e as issues ainda sem classificação
# classifique (seção 3), grave num arquivo temporário FORA do repo (ex.: $TMPDIR) e aplique:
node $S/board.mjs classify <arquivo.json>
python $S/render.py           # tabelas agrupadas por tipo (python3 ou py -3 se python faltar)
node $S/board.mjs render       # mesmo conteúdo, sem rich; --json devolve a visão para outro renderizador
```

Flags de escopo e filtro (valem para `pending` e `render`):

| Flag | Efeito |
|---|---|
| `--all` | board inteiro, não só as suas |
| `--user login` | issues de outra pessoa |
| `--por tipo\|prioridade\|dificuldade\|campo\|status\|repo` | agrupamento (padrão `tipo`); `campo` usa `fields.group` |
| `--prioridade P0,P1` · `--dificuldade facil` · `--tipo bug` · `--campo valor` · `--repo nome` · `--status ready` | filtros: vários valores separados por vírgula; casam por trecho, sem diferenciar maiúscula nem acento (`--status ready` também pega "Not ready"); `--tipo` aceita id ou nome |

O cache fica em `data/<owner>-<número>/`, então boards diferentes não se misturam.

A saída do Bash nem sempre aparece para o usuário. **Depois de rodar o `render`, cole a tabela na resposta dentro de um bloco ```text```.** Outra opção é sugerir `! python ~/.claude/skills/issue-board/render.py`, que mostra direto, com cores e links.

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

1. Primeira linha: total de issues e quantas são P0.
2. A tabela.
3. Uma linha dizendo o que pegar primeiro: a issue de maior prioridade e, entre elas, a de menor dificuldade.
