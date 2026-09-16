---
name: doc
description: Acha o vault Obsidian de documentação do repositório atual e, com base no resumo da última sessão (ou na conversa atual), aponta o que precisa mudar na documentação e aplica o que o usuário aprovar. Sem vault, alerta e sugere criar um. Genérica para qualquer projeto. Use quando o usuário pedir "/doc", "atualiza a doc", "o que mudar na documentação", "revisa o vault do projeto".
---

# Doc

Mantém o vault Obsidian **do projeto** (dentro do repo, versionado com o código) em dia com o que a sessão mudou.

Esta skill não conhece nenhum projeto. O vault é qualquer pasta do repo que contenha `.obsidian/`. A parte mecânica fica em `doc.mjs`, ao lado deste arquivo, e só depende de Node 18+ e git. Nos comandos abaixo, `<skill>` é o diretório desta skill (o Claude Code mostra como "Base directory"). Use o caminho absoluto: `~` não expande no PowerShell.

Não confunda os dois vaults:

| | Vault do projeto | Vault de sessões |
|---|---|---|
| Onde | dentro do repo (ex.: `docs/<Projeto>/`) | fora de qualquer repo, definido na skill `session-handoff` |
| O quê | regras, arquitetura, invariantes, armadilhas | o que aconteceu numa sessão |
| Esta skill | **lê e edita** | **só lê** a última nota, como fonte |

## 1. Localizar

```bash
node "<skill>/doc.mjs" locate
```

A saída é um JSON com `repo`, `vaults` (caminho, número de notas e a nota de entrada, como `_CONTEXTO` ou `README`) e `session` (última nota de sessão do repo). Trate pelo código de saída:

- **2 (fora de um repo git):** diga isso e pare.
- **3 (nenhum vault):**
  - se `vaultsInMainCheckout` veio preenchido, você está num worktree cuja branch saiu antes de o vault existir. Não crie vault: diga isso e sugira atualizar a branch a partir da base (`git merge` ou `rebase`);
  - senão, vá para a seção 5.
- **Mais de um vault:** um repo pode documentar a si mesmo e a um sistema vizinho. Escolha pelo assunto da sessão. Se não der para saber, pergunte com AskUserQuestion.

## 2. Montar o resumo da sessão

Fonte, nesta ordem:

1. **A conversa atual**, se nela houve mudança de código, decisão ou descoberta.
2. **A nota em `session.note`**, quando a conversa atual não tem esse conteúdo (ex.: `/doc` logo depois de um `/clear`). Diga ao usuário qual nota usou e a data dela.
3. Nenhuma das duas: use `git log --since=<data> --stat` e peça ao usuário o período.

Extraia só o que pode afetar a documentação:
- **decisões do usuário** (mudam regra de negócio ou de arquitetura);
- **comportamento alterado** (commits e PRs, com os arquivos tocados);
- **armadilhas** confirmadas;
- a seção **"Candidatos a promoção"** da nota, que já é uma lista pronta;
- **arquivos-chave** tocados.

Ignore status de tarefa, autorizações e passos de operação: isso é da sessão, não do projeto.

## 3. Achar o que ficou desatualizado

1. Leia a nota de entrada do vault (`vaults[].entry`) para entender a organização e as convenções: frontmatter, callouts, numeração, como cita código. Com `entry: null`, leia a lista de pastas da raiz do vault e as notas alteradas mais recentemente (`git log -5 --name-only -- "<vault>"`).
2. Cruze as referências `arquivo:linha` das notas com o que mudou:
   ```bash
   node "<skill>/doc.mjs" refs "<vault>" --since <git-ref ou AAAA-MM-DD do início da sessão>
   ```
   - `notasQueCitamArquivosAlterados`: notas que provavelmente descrevem código que mudou. O cruzamento inclui mudanças ainda não commitadas e arquivos novos. **Abra cada `arquivo:linha` citado e confira se a linha ainda diz o que a nota afirma**: estar fora de `quebradas` só prova que a linha existe, não que está certa.
   - `quebradas`: referência a arquivo inexistente ou a uma linha além do fim do arquivo. Antes de propor correção, veja se o arquivo mora em **outro repo** que o vault também documenta; nesse caso não está quebrada.
   - `ambiguas`: nome citado sem caminho que casa com mais de um arquivo (`candidatos`). Só mexa se a nota tocar o assunto da sessão.
   - `ignoradasPorParecerHost`: `host:porta` e `ip:porta`, que não são arquivo. Não proponha corrigir.
3. Procure no vault (Grep) os termos do resumo: nomes de função, rota, tabela, flag, decisão. Assim aparecem as notas que falam do assunto sem citar arquivo.

## 4. Propor, confirmar, aplicar

**Verifique no código antes de propor.** Toda afirmação nova ou corrigida precisa de `arquivo:linha` conferido nesta sessão. O que não der para confirmar entra marcado como não verificado, no padrão do vault (ex.: `> [!todo] Não verificado`), nunca como fato.

Mostre a proposta numa tabela, a mais importante primeiro:

| # | Nota | Mudança | Por quê (evidência) |
|---|---|---|---|
| 1 | `<nota>` (exemplo) | adicionar a regra N+1: ... | decisão "..." + `src/x.ts:40` |

Pergunte o que aplicar com AskUserQuestion: **"Aplicar todas"**, **"Escolher por número"** ou **"Nenhuma"**. Na escolha por número, peça os números. Sem AskUserQuestion, faça a mesma pergunta em texto e espere a resposta: não aplique nada sem ela.

Ao aplicar:
- Siga as convenções do vault: idioma, frontmatter, callouts, `[[wikilinks]]` entre notas do **próprio** vault e a numeração existente (continue a sequência, não renumere).
- Se o vault usa um campo de data de atualização no frontmatter, atualize-o nas notas tocadas.
- Corrija referências `arquivo:linha` que ficaram erradas nas notas que você editar.
- Nota nova só quando nenhuma existente cobre o assunto; ligue-a na nota de entrada.
- Nunca copie segredo, token, credencial ou dado de cliente para o vault. Cite o nome da env var ou do secret.
- Nunca grave nota de sessão no vault do projeto.
- **Não faça commit.** No fim, liste os arquivos alterados e sugira o fluxo de commit do projeto (ex.: `/commit-changes`, se existir).

Se a proposta usou "Candidatos a promoção" de uma nota de sessão, acrescente ao item nessa nota ` — promovido em AAAA-MM-DD para <caminho>`. É a única escrita permitida no vault de sessões.

Nada a mudar: diga isso em uma linha e cite o que foi conferido (quais notas, qual intervalo do git).

## 5. Sem vault

Alerte o usuário:

> Este repositório não tem vault Obsidian de documentação. Sem ele, decisões e armadilhas descobertas nas sessões não ficam registradas junto do código.

Pergunte com AskUserQuestion se quer criar agora. Se não quiser, pare. Se quiser:

1. Proponha o local `docs/<Nome-Do-Repo>/`, ou use outro que o usuário indicar.
2. Proponha a estrutura mínima abaixo. Nomes de pasta, de arquivo e o idioma são sugestão: confirme com o usuário ou siga o idioma do repo.
   ```
   docs/<Nome>/
   ├── .obsidian/app.json          {}
   ├── .gitignore                  .obsidian/workspace*.json
   ├── 00 - Navegação/_CONTEXTO.md
   └── 01 - Validação/
       ├── _INVARIANTES.md
       └── _EDGE-CASES.md
   ```
3. `_CONTEXTO.md`: o que o projeto é, stack, tabela "área do código → o que ler antes de mexer" e as convenções do vault. Leia antes o README, o CLAUDE.md/AGENTS.md e a estrutura de pastas. Não invente: o que não der para confirmar fica marcado como não verificado.
4. `_INVARIANTES.md` (regras que não podem quebrar, `I-01`…) e `_EDGE-CASES.md` (comportamentos contra-intuitivos, `EC-01`…): comece com o que a sessão atual confirmou, cada item com `arquivo:linha`. Se não houver nada confirmado, deixe só o cabeçalho e a explicação do formato.
5. Mostre a árvore criada e sugira o fluxo de commit do projeto. Não faça commit.

Frontmatter mínimo de cada nota:

```yaml
---
title: <título>
tags: [<área>]
atualizado: AAAA-MM-DD
---
```
