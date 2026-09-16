---
name: session-handoff
description: Resume a sessão atual numa nota acionável dentro de um vault Obsidian central de sessões, para o próximo agente ler e sair executando; também retoma a partir da última nota. Use quando o usuário pedir "handoff", "resume a sessão", "salva a sessão no obsidian", "retoma a última sessão" ou antes de /compact ou /clear.
---

# Session Handoff

Dois modos. Escolha pelo pedido:

- **salvar** (padrão): "resume a sessão", "handoff", "salva no obsidian", antes de compactar.
- **retomar**: "retoma a última sessão", "continua de onde parou", "lê o handoff".

A nota é para um agente que **não viu esta conversa**. Ele precisa conseguir agir só com ela.

Esta skill é genérica: não conhece projeto, linguagem nem layout de repo. Tudo que é específico mora em `config.json`, ao lado deste arquivo.

---

## 1. Achar o vault de sessões

As notas ficam num **vault central, fora de qualquer repositório** — nunca dentro do repo em que a sessão rodou.

1. Leia `config.json` ao lado deste arquivo. O campo `sessionsVault` é o caminho absoluto do vault.
2. Sem `config.json`, sem esse campo, ou caminho inexistente: pergunte o caminho ao usuário com AskUserQuestion, crie a pasta com um `.obsidian/` vazio dentro e grave a resposta em `config.json`.
3. Dentro do vault, cada repositório tem a sua pasta: `<vault>/<nome-do-repo>/`. O nome do repo é o nome da pasta do checkout principal (`git rev-parse --show-toplevel`; em worktree, a primeira linha de `git worktree list`). Fora de um repo, use `avulsas/`.
4. Crie a pasta do repo se faltar.

> Nunca escreva nota de sessão dentro de um repositório de código. Se o usuário pedir explicitamente, avise que ela vai aparecer no `git status` de quem trabalha ali.

---

## 2. Modo salvar

### 2.1 Coletar estado real (não confie na memória da conversa)

Rode, para **cada repo tocado na sessão** (em paralelo):

```bash
git -C <repo> worktree list
git -C <repo> status --short --branch
git -C <repo> log --oneline -5
gh pr list --repo <owner/repo> --author @me --state open
```

Também:
- `date '+%Y-%m-%d %H:%M'` para data e hora.
- `.claude/todo.md` de cada worktree tocado, se existir.
- Issues e PRs citados: `gh issue view N` / `gh pr view N` para o status atual.
- Processos em background ainda úteis (monitores, port-forwards): liste o que está rodando e diga se morre com a sessão.

Se um fato da conversa diverge do estado coletado, **o estado coletado vence**. Anote a divergência.

### 2.2 Escrever a nota

Arquivo: `<vault>/<repo>/AAAA-MM-DD HHmm — <tema curto>.md`. Use o template da seção 4.

Regras de conteúdo:
- **"Comece por aqui" é a primeira coisa**: um comando, arquivo ou pergunta exata. Nada de "continuar o trabalho".
- Cite pedidos e decisões do usuário **entre aspas, literais**. Decisão tomada não é para ser rediscutida.
- Pendências em checklist ordenado, cada item com `verificar:` (como saber que terminou).
- Caminhos absolutos de worktree; `arquivo:linha` para código.
- Autorizações dadas pelo usuário valem só para aquela ação daquela sessão. Registre como histórico, nunca como permissão vigente.
- **Referência a documentação do projeto vai como caminho, não como `[[wikilink]]`** — o vault de sessões é outro vault, e o link não resolveria. Ex.: `docs/Tron-Backend/00 - Navegação/_CONTEXTO.md` (no `tron-charts-backend`).
- `[[wikilink]]` só entre notas do próprio vault de sessões (ex.: a nota anterior).
- Inclua o caminho do transcript (`~/.claude/projects/<projeto>/<session-id>.jsonl`) para quem precisar do detalhe.

### 2.3 Sem segredos

Antes de gravar, procure na nota: chaves de API, tokens, senhas, bearer, private keys, connection strings com senha, IPs pessoais fora de contexto de regra de rede, e-mails de clientes. Troque por `<redacted>` e diga onde o segredo mora (nome da env var, nome do secret K8s), nunca o valor.

Segredo exposto durante a sessão: registre em "Riscos abertos" que precisa de rotação, sem o valor.

### 2.4 Atualizar os ponteiros

1. `<vault>/_ULTIMA-SESSAO.md`: reescreva inteiro com o template da seção 5 (aponta e embute a nota nova, seja de qual repo for).
2. `<vault>/_Sessões — Índice.md`: adicione uma linha no topo da tabela (crie o arquivo se faltar, template da seção 6).

### 2.5 Promover aprendizados

Armadilha nova (comportamento contra-intuitivo confirmado) ou regra que não pode quebrar: **não edite** a documentação do projeto sozinho. Liste em "Candidatos a promoção" na nota, com o caminho do arquivo que deveria receber, e ofereça ao usuário em uma linha no final.

### 2.6 Responder ao usuário

Três linhas: caminho da nota, a ação de "Comece por aqui", quantas pendências ficaram.

---

## 3. Modo retomar

1. Ache o vault (seção 1).
2. Trabalhando num repo: leia a nota mais recente de `<vault>/<repo>/`. Sem repo, ou querendo a última de todas: leia `<vault>/_ULTIMA-SESSAO.md`.
3. Leia a documentação que a nota indicar em "Leitura obrigatória" (caminhos dentro do repo).
4. **Revalide o estado** com os comandos da seção 2.1. Branch mergeado, PR fechado, worktree removido: atualize a pendência antes de agir.
5. Autorizações da sessão anterior **não** valem. Escrita em prod, commit, push e PR pedem confirmação de novo.
6. Diga ao usuário em até 5 linhas: o que mudou desde a nota e qual ação vai executar. Depois execute "Comece por aqui".
7. Ao terminar a sessão retomada, rode o modo salvar. A nota nova linka a anterior em `sessao_anterior`.

---

## 4. Template da nota de sessão

````markdown
---
title: "AAAA-MM-DD HHmm — <tema>"
tipo: sessao
data: AAAA-MM-DD
status: em andamento | concluída | bloqueada
repos: [<repo>, ...]
branches: [<branch>, ...]
issues: ["owner/repo#N", ...]
prs: ["owner/repo#N", ...]
sessao_anterior: "[[<nota anterior ou vazio>]]"
transcript: "<caminho do .jsonl>"
tags: [sessao, handoff]
---

# <tema>

> [!todo] Comece por aqui
> 1. `<comando ou arquivo exato>` — <por quê, uma frase>
> 2. <segunda ação, se depender da primeira>

> [!info] Leitura obrigatória antes de agir
> - `<caminho do doc no repo>` — <o que cobre>

## Estado atual (coletado em AAAA-MM-DD HH:MM)

| Repo | Worktree | Branch | HEAD | Não commitado | PR |
|---|---|---|---|---|---|
| | | | | | |

## Objetivo

<1–3 frases. O que o usuário quer no fim, não o que foi feito.>

## Pedidos e decisões do usuário

| Quando | Pedido/decisão (literal) | Efeito |
|---|---|---|
| | "..." | |

## Feito e verificado

- <resultado> — evidência: <query, teste, PR, saída>

## Pendente

- [ ] <ação> — verificar: <como saber que terminou>

## Aguardando o usuário

- <pergunta aberta, com as opções já levantadas>

## Restrições vigentes

- <regras de segurança, o que não pode ser feito sem confirmação, arquivos que não devem ser lidos>

## Histórico de autorizações (não valem para a próxima sessão)

- "<frase do usuário>" → <ação autorizada, já executada ou não>

## Armadilhas encontradas

- **<sintoma>** — causa: <...> — solução: <...>

## Riscos abertos

- <segredo exposto a rotacionar, regra temporária de rede, recurso de prod alterado>

## Arquivos, scripts e comandos-chave

- `<caminho:linha>` — <papel>

## Candidatos a promoção

- `<caminho do doc que deveria receber>`: <o aprendizado>
````

---

## 5. Template de `_ULTIMA-SESSAO.md`

````markdown
---
title: Última Sessão
tipo: ponteiro
atualizado: AAAA-MM-DD HH:MM
aliases: [ultima-sessao, handoff]
tags: [sessao, navegacao]
---

# Última Sessão

> [!tip] Próximo agente
> Leia a nota abaixo, revalide o estado com git e gh, e execute "Comece por aqui". Autorizações antigas não valem.

**Repo:** `<repo>` · **Nota:** [[AAAA-MM-DD HHmm — <tema>]] · **status:** <status>

![[AAAA-MM-DD HHmm — <tema>]]
````

---

## 6. Template de `_Sessões — Índice.md`

````markdown
---
title: Sessões — Índice
tipo: indice
tags: [sessao, indice]
---

# Sessões — Índice

Mais recente no topo. A nota ativa está em [[_ULTIMA-SESSAO]].

| Data | Repo | Sessão | Status |
|---|---|---|---|
````
