# Claude Enforcement Harness — Guia Prático

> Este arquivo não está versionado. É um guia rápido para entender o que foi construído, como instalar em outros projetos e como manter o pacote.

---

## O que foi feito

Dois entregáveis foram criados:

### 1. Harness no tron-charts (referência)

Arquivos adicionados a este repositório:

| Arquivo | O que faz |
|---------|-----------|
| `.claude/settings.json` | Hooks do Claude Code — bloqueia `git commit` e `gh pr create` diretos, roda o bootstrap a cada prompt |
| `.claude/hooks/bypass-check.sh` | Lê um arquivo-token (`.claude/.commit-authorized` ou `.claude/.pr-authorized`). Se existir → permite o comando e apaga o token. Se não existir → bloqueia com mensagem de erro. |
| `.claude/hooks/bootstrap-check.sh` | Roda a cada prompt do Claude. Verifica se `rtk`, `gsd` e `codebase-memory-mcp` estão instalados. Uma vez por dia também verifica se há atualização do pacote `@tron/claude-config` e atualiza silenciosamente. |
| `.claude/git-hooks/pre-commit` | Código-fonte do git hook. Bloqueia `git commit` direto no terminal (humanos). |
| `.claude/git-hooks/pre-push` | Código-fonte do git hook. Bloqueia `git push` direto para main/master. |
| `scripts/setup-claude-harness.sh` | Script de setup: instala os git hooks em `.git/hooks/`, verifica ferramentas, detecta o package manager (npm/pnpm/bun). |
| `package.json` → `postinstall` | Roda o setup automaticamente em todo `npm install` / `bun install` / `pnpm install`. |

**O que está enforced:**
- `/commit-changes` → única forma de commitar via Claude (chama `/code-review` + `/security-review` automaticamente)
- `/make-pr` → única forma de abrir PR via Claude
- `git commit` direto no terminal → bloqueado pelo git hook `pre-commit`
- `git push` direto para main/master → bloqueado pelo git hook `pre-push`
- Ferramentas ausentes → aviso injetado no contexto do Claude a cada sessão
- Pacote desatualizado → auto-atualização silenciosa, uma vez por dia

### 2. Pacote `tron-claude-config` (distribuição)

Repositório em: `/Users/zaq/Repos/tron-claude-config`

Contém os mesmos hooks/configs acima como "arquivos gerenciados". Quando um projeto instala este pacote como devDependency, o `postinstall.js` copia os arquivos gerenciados para o projeto consumidor automaticamente.

---

## ECC — Regras de código automáticas

O setup instala automaticamente as regras do [ECC (Extended Claude Code)](https://github.com/affaan-m/ECC) em `~/.claude/rules/ecc/`. São regras globais por máquina — instaladas uma única vez.

**Pastas instaladas:** `common`, `typescript`, `csharp`, `nuxt`, `react`, `react-native`, `vue`, `web`

**Local:** `~/.claude/rules/ecc/`

Se as regras já estiverem instaladas, o setup pula esta etapa. Para reinstalar manualmente:

```bash
rm -rf ~/.claude/rules/ecc
bash scripts/setup-claude-harness.sh
```

**Como funciona:** O `setup-claude-harness.sh` clona o repo ECC temporariamente, copia as pastas de regras para `~/.claude/rules/ecc/` e limpa o clone. Sem dependência permanente do repo externo após a instalação.

---

## Como instalar em outro projeto

### Passo 1 — Publicar o pacote no GitHub (uma única vez)

```bash
cd /Users/zaq/Repos/tron-claude-config
git remote add origin https://github.com/zaqueu-1/tron-claude-config.git
git push -u origin main
```

### Passo 2 — Adicionar ao projeto

Em qualquer projeto (`package.json`), adicione:

```json
"devDependencies": {
  "@tron/claude-config": "git+https://github.com/zaqueu-1/tron-claude-config.git"
}
```

### Passo 3 — Instalar

```bash
npm install
# ou: bun install
# ou: pnpm install
```

Pronto. O `postinstall` roda automaticamente e instala tudo. Nenhuma outra ação é necessária.

Além disso, o `setup-claude-harness.sh` instala as regras ECC em `~/.claude/rules/ecc/` na primeira execução.

**O que o install faz automaticamente:**
- Copia `.claude/settings.json` (hooks do Claude Code)
- Copia `.claude/hooks/bypass-check.sh` e `bootstrap-check.sh`
- Instala `.git/hooks/pre-commit` e `.git/hooks/pre-push`
- Adiciona os arquivos-token ao `.gitignore` do projeto

---

## Como manter o pacote

O pacote está em `/Users/zaq/Repos/tron-claude-config`. Veja `MAINTAINER.md` lá dentro para detalhes completos. Resumo:

### Atualizar um hook ou regra

```bash
# 1. Edite o arquivo em managed/:
nano /Users/zaq/Repos/tron-claude-config/managed/claude/hooks/bootstrap-check.sh

# 2. Bump de versão:
cd /Users/zaq/Repos/tron-claude-config
npm version patch   # para fixes
npm version minor   # para novas funcionalidades

# 3. Commit e push:
git add -A
git commit -m "fix: descrição da mudança"
git push origin main
git push --tags
```

### Como os projetos recebem a atualização

**Automático (próximo dia):** O `bootstrap-check.sh` roda a cada sessão do Claude e verifica uma vez por dia se o SHA instalado é diferente do HEAD remoto. Se sim, roda `npm install` / `bun install` / `pnpm install` silenciosamente e reinstala os hooks.

**Imediato:** Qualquer desenvolvedor pode rodar `npm install` (ou bun/pnpm) para forçar a atualização agora.

### Adionar um novo hook gerenciado

1. Crie o arquivo em `managed/claude/hooks/novo-hook.sh`
2. Adicione a entrada de cópia em `scripts/postinstall.js` (array `MANAGED_FILES`)
3. Adicione a referência em `managed/claude/settings.json`
4. Faça bump de versão e push

### Versioning

| Tipo de mudança | Bump |
|----------------|------|
| Correção em script existente | `patch` |
| Novo hook ou nova regra | `minor` |
| Mudança breaking (renomear arquivo gerenciado) | `major` |

---

## Emergências

```bash
# Pular o pre-commit hook (emergência apenas):
git commit --no-verify -m "mensagem"

# Pular o pre-push hook:
git push --no-verify

# Desinstalar o harness de um projeto:
rm .git/hooks/pre-commit .git/hooks/pre-push
# Remova a entrada do package.json e rode npm install
```

---

## Estrutura de arquivos do pacote

```
tron-claude-config/
├── package.json                    ← @tron/claude-config v1.0.0
├── scripts/
│   └── postinstall.js             ← copia tudo para o projeto consumidor
├── managed/
│   ├── claude/
│   │   ├── settings.json          ← hooks do Claude Code
│   │   └── hooks/
│   │       ├── bypass-check.sh    ← controle de acesso por token
│   │       └── bootstrap-check.sh ← verificação de tools + auto-update
│   └── git-hooks/
│       ├── pre-commit             ← bloqueia commit direto no terminal
│       └── pre-push               ← bloqueia push direto para main
├── MAINTAINER.md                  ← guia completo para o mantenedor
└── README.md                      ← guia rápido para quem adiciona ao projeto
```
