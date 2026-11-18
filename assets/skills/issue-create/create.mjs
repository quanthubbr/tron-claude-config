#!/usr/bin/env node
// issue-create: valida o rascunho contra o padrão do time e cria issue, campos do board e sub-issue (Node >= 18 + gh).

import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const EXIT_INVALID = 1
const EXIT_AUTH = 2
const EXIT_CONFIG = 3
const EXIT_NO_GH = 4
const BOOLEAN_FLAGS = new Set(['dry-run', 'force', 'json'])
const DATE = /^\d{4}-\d{2}-\d{2}$/
const CHECKBOX = /^\s*[-*] \[[ xX]\] \S/m

function fail(message, code = EXIT_INVALID) {
  process.stderr.write(`${message}\n`)
  process.exit(code)
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    fail(`Não consegui ler ${path}: ${err.message}`, EXIT_CONFIG)
  }
}

function fold(value) {
  return String(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

function parseArgs(argv) {
  const flags = {}
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const eq = arg.indexOf('=')
    const key = eq === -1 ? arg.slice(2) : arg.slice(2, eq)
    if (eq !== -1) flags[key] = arg.slice(eq + 1)
    else if (!BOOLEAN_FLAGS.has(key) && argv[i + 1] && !argv[i + 1].startsWith('--')) flags[key] = argv[++i]
    else flags[key] = true
  }
  return { flags, positional }
}

function loadConfig(dir = HERE) {
  const path = join(dir, 'config.json')
  if (!existsSync(path)) {
    fail('Padrão não definido. Rode `exonous issue-create init --from <padrao.json>` com o arquivo do time, ou `init` para partir do exemplo.', EXIT_CONFIG)
  }
  const config = readJson(path)
  if (!config.templates || !Object.keys(config.templates).length) fail('config.json sem "templates".', EXIT_CONFIG)
  if (config.project && (!/^[A-Za-z0-9-]+$/.test(config.project.owner || '') || !Number.isInteger(config.project.number))) {
    fail(`project inválido em config.json: ${JSON.stringify(config.project)}`, EXIT_CONFIG)
  }
  for (const key of ['pattern', 'forbidPrefix']) {
    try {
      if (config.title?.[key]) new RegExp(config.title[key], 'u')
    } catch (err) {
      fail(`title.${key} inválido em config.json: ${err.message}`, EXIT_CONFIG)
    }
  }
  return config
}

const repoName = (repo) => String(repo).split('/').pop()

function allowedLabels(config, repo) {
  const area = config.labels?.area || {}
  return new Set([...(config.labels?.type || []), ...(area['*'] || []), ...(area[repoName(repo)] || [])])
}

function mirroredLabel(config, draft) {
  const mirror = config.labels?.mirror
  if (!mirror || !(mirror.repos || []).includes(repoName(draft.repo))) return null
  return mirror.map?.[draft.fields?.[mirror.field]] || null
}

function normalize(config, draft) {
  const errors = []
  const template = config.templates[draft.template]
  if (!template) {
    return { errors: [`template "${draft.template}" não existe; use um de: ${Object.keys(config.templates).join(', ')}`] }
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(draft.repo || '')) errors.push('repo deve ser "owner/nome"')
  if (config.repos?.length && draft.repo && !config.repos.includes(repoName(draft.repo))) {
    errors.push(`repo "${draft.repo}" fora do padrão; repos: ${config.repos.join(', ')}`)
  }

  const title = String(draft.title || '').trim()
  const rule = config.title || {}
  if (!title) errors.push('title vazio')
  if (rule.maxLength && title.length > rule.maxLength) errors.push(`title com ${title.length} caracteres; máximo ${rule.maxLength}`)
  if (/[.;]$/.test(title)) errors.push('title não termina com ponto')
  if (template.titlePrefix && !title.startsWith(template.titlePrefix)) errors.push(`title do template "${draft.template}" começa com "${template.titlePrefix}"`)
  if (rule.pattern && !new RegExp(rule.pattern, 'u').test(title)) errors.push(`title fora do formato ${rule.hint || rule.pattern}`)
  if (rule.forbidPrefix && !draft.parent && new RegExp(rule.forbidPrefix, 'iu').test(title)) {
    errors.push('prefixo de commit (fix/feat/...) não vai no title; só em sub-issue de PR empilhado (com parent)')
  }

  const sections = draft.sections || {}
  const known = new Map(template.sections.map((s) => [fold(s.name), s]))
  for (const name of Object.keys(sections)) {
    if (!known.has(fold(name))) errors.push(`seção "${name}" não existe no template "${draft.template}"`)
  }
  const filled = new Map(Object.entries(sections).map(([k, v]) => [fold(k), String(v ?? '').trim()]))
  const parts = []
  for (const section of template.sections) {
    const content = filled.get(fold(section.name)) || ''
    if (!content) {
      if (section.required) errors.push(`seção obrigatória vazia: "${section.name}"`)
      continue
    }
    if (section.checklist && !CHECKBOX.test(content)) errors.push(`seção "${section.name}" precisa de itens "- [ ] ..."`)
    parts.push(`## ${section.name}\n\n${content}`)
  }

  const labels = [...new Set([...(draft.labels || []), mirroredLabel(config, draft)].filter(Boolean))]
  const typeLabels = config.labels?.type || []
  if (typeLabels.length && !labels.some((l) => typeLabels.includes(l)) && template.typeLabel) labels.unshift(template.typeLabel)
  const typeCount = labels.filter((l) => typeLabels.includes(l)).length
  if (typeLabels.length && typeCount !== 1) errors.push(`exatamente 1 label de tipo (${typeLabels.join(', ')}); veio ${typeCount}`)
  if (config.labels && draft.repo) {
    const allowed = allowedLabels(config, draft.repo)
    for (const label of labels) if (!allowed.has(label)) errors.push(`label "${label}" fora do padrão para ${repoName(draft.repo)}`)
  }

  const assignees = [...new Set([...(draft.assignees || []), ...(config.requiredAssignees || [])])]

  const fields = draft.fields || {}
  for (const name of config.requiredFields || []) {
    if (fields[name] === undefined || String(fields[name]).trim() === '') errors.push(`campo do board obrigatório vazio: "${name}"`)
  }
  for (const [name, value] of Object.entries(fields)) {
    if (/date/i.test(name) && !DATE.test(String(value))) errors.push(`campo "${name}" deve ser YYYY-MM-DD`)
  }
  const status = fields[config.statusField || 'Status']
  if (status && config.createStatuses?.length && !config.createStatuses.some((s) => fold(s) === fold(status))) {
    errors.push(`issue nova entra em ${config.createStatuses.join(' ou ')}, não em "${status}"`)
  }
  if (Object.keys(fields).length && !config.project) errors.push('fields preenchidos mas config.json sem "project"')

  return { errors, issue: { repo: draft.repo, title, body: parts.join('\n\n'), labels, assignees, fields, parent: draft.parent || null } }
}

function gh(args) {
  // Seam de teste: um script node no lugar do gh (só com EXONOUS_TEST=1).
  const shim = process.env.EXONOUS_TEST === '1' && process.env.EXONOUS_GH_SHIM
  try {
    const [cmd, argv] = shim ? [process.execPath, [shim, ...args]] : ['gh', args]
    return execFileSync(cmd, argv, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (err) {
    if (err.code === 'ENOENT') fail('gh CLI não encontrado. Instale: https://cli.github.com', EXIT_NO_GH)
    const stderr = String(err.stderr || err.message).trim()
    if (/auth login|not logged/i.test(stderr)) fail(`gh não está autenticado. Rode no prompt:\n  ! gh auth login -s project\n(${stderr})`, EXIT_AUTH)
    if (/INSUFFICIENT_SCOPES|scope/i.test(stderr)) fail(`O token do gh não tem o escopo project. Rode:\n  ! gh auth refresh -s project\n(${stderr})`, EXIT_AUTH)
    throw new Error(`gh ${args.slice(0, 2).join(' ')}: ${stderr}`)
  }
}

function parseRef(ref, defaultRepo) {
  const s = String(ref)
  const url = s.match(/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)/)
  if (url) return { repo: url[1], number: Number(url[2]) }
  const full = s.match(/^([\w.-]+\/[\w.-]+)#(\d+)$/)
  if (full) return { repo: full[1], number: Number(full[2]) }
  if (/^#?\d+$/.test(s)) return { repo: defaultRepo, number: Number(s.replace('#', '')) }
  throw new Error(`referência de issue inválida: "${s}" (use número, owner/repo#n ou URL)`)
}

function issueNode(ref) {
  const [owner, name] = ref.repo.split('/')
  const query = 'query($o:String!,$n:String!,$i:Int!){repository(owner:$o,name:$n){issue(number:$i){id url parent{id url}}}}'
  const data = JSON.parse(gh(['api', 'graphql', '-f', `query=${query}`, '-f', `o=${owner}`, '-f', `n=${name}`, '-F', `i=${ref.number}`]))
  const issue = data.data?.repository?.issue
  if (!issue) throw new Error(`issue ${ref.repo}#${ref.number} não encontrada`)
  return issue
}

function createIssue(issue) {
  const dir = mkdtempSync(join(tmpdir(), 'issue-create-'))
  const bodyFile = join(dir, 'body.md')
  writeFileSync(bodyFile, `${issue.body}\n`)
  try {
    const args = ['issue', 'create', '--repo', issue.repo, '--title', issue.title, '--body-file', bodyFile]
    for (const label of issue.labels) args.push('--label', label)
    for (const login of issue.assignees) args.push('--assignee', login)
    const url = gh(args).trim().split('\n').pop()
    return { url, ...parseRef(url) }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function resolveFields(config, wanted) {
  const { owner, number } = config.project
  const list = JSON.parse(gh(['project', 'field-list', String(number), '--owner', owner, '--format', 'json', '--limit', '100'])).fields
  const edits = []
  for (const [name, value] of Object.entries(wanted)) {
    const field = list.find((f) => fold(f.name) === fold(name))
    if (!field) throw new Error(`campo "${name}" não existe no board ${owner}/${number}`)
    if (field.options) {
      const option = field.options.find((o) => fold(o.name) === fold(value))
      if (!option) throw new Error(`"${value}" não é opção de "${field.name}" (opções: ${field.options.map((o) => o.name).join(', ')}); nunca crie opção nova`)
      edits.push({ name: field.name, args: ['--field-id', field.id, '--single-select-option-id', option.id] })
    } else if (DATE.test(String(value)) && /date/i.test(field.name)) {
      edits.push({ name: field.name, args: ['--field-id', field.id, '--date', String(value)] })
    } else if (typeof value === 'number') {
      edits.push({ name: field.name, args: ['--field-id', field.id, '--number', String(value)] })
    } else {
      edits.push({ name: field.name, args: ['--field-id', field.id, '--text', String(value)] })
    }
  }
  return edits
}

// Resolve tudo antes de criar a issue: opção inválida não deixa issue órfã fora do board.
function prepareBoard(config, fields) {
  const { owner, number } = config.project
  const projectId = JSON.parse(gh(['project', 'view', String(number), '--owner', owner, '--format', 'json'])).id
  return { projectId, edits: resolveFields(config, fields) }
}

function applyBoard(config, board, issueUrl) {
  const { owner, number } = config.project
  // item-add é idempotente: a issue que já está no board devolve o mesmo item.
  const itemId = JSON.parse(gh(['project', 'item-add', String(number), '--owner', owner, '--url', issueUrl, '--format', 'json'])).id
  for (const edit of board.edits) gh(['project', 'item-edit', '--project-id', board.projectId, '--id', itemId, ...edit.args])
  return board.edits.map((e) => e.name)
}

function linkParent(parentRef, child) {
  const parent = issueNode(parentRef)
  const node = issueNode(child)
  if (node.parent?.id === parent.id) return 'já era sub-issue'
  if (node.parent) throw new Error(`a issue já é sub-issue de ${node.parent.url}; troque o pai à mão`)
  const mutation = 'mutation($p:ID!,$c:ID!){addSubIssue(input:{issueId:$p,subIssueId:$c}){issue{number}}}'
  gh(['api', 'graphql', '-f', `query=${mutation}`, '-f', `p=${parent.id}`, '-f', `c=${node.id}`])
  return `sub-issue de ${parent.url}`
}

function loadDraft(file) {
  if (!file) fail('Informe o rascunho: <arquivo.json>.')
  return readJson(file)
}

function validated(config, file) {
  const { errors, issue } = normalize(config, loadDraft(file))
  if (errors.length) fail(`Rascunho fora do padrão:\n${errors.map((e) => `- ${e}`).join('\n')}`)
  return issue
}

function cmdStandard(config, flags) {
  if (flags.json) return process.stdout.write(`${JSON.stringify(config, null, 2)}\n`)
  const lines = [`# Padrão de issue${config.name ? `: ${config.name}` : ''}`, '']
  if (config.title?.hint) lines.push(`Título: ${config.title.hint}${config.title.maxLength ? ` (até ${config.title.maxLength} caracteres)` : ''}`)
  if (config.labels?.type) lines.push(`Label de tipo (exatamente 1): ${config.labels.type.join(', ')}`)
  for (const [repo, labels] of Object.entries(config.labels?.area || {})) lines.push(`Labels de área ${repo === '*' ? '(todos os repos)' : `(${repo})`}: ${labels.join(', ')}`)
  if (config.requiredAssignees?.length) lines.push(`Assignees sempre incluídos: ${config.requiredAssignees.join(', ')}`)
  if (config.project) lines.push(`Board: ${config.project.owner}/projects/${config.project.number}`)
  if (config.requiredFields?.length) lines.push(`Campos obrigatórios: ${config.requiredFields.join(', ')}`)
  for (const [name, hint] of Object.entries(config.fieldHints || {})) lines.push(`- ${name}: ${hint}`)
  lines.push('', 'Templates (* = obrigatória):')
  for (const [id, t] of Object.entries(config.templates)) {
    lines.push(`- ${id}${t.titlePrefix ? ` [título começa com "${t.titlePrefix}"]` : ''}${t.typeLabel ? ` [label ${t.typeLabel}]` : ''}: ${t.sections.map((s) => `${s.name}${s.required ? '*' : ''}`).join(' · ')}`)
  }
  process.stdout.write(`${lines.join('\n')}\n`)
}

function cmdCheck(config, positional, flags) {
  const issue = validated(config, positional[0])
  if (flags.json) return process.stdout.write(`${JSON.stringify(issue, null, 2)}\n`)
  const meta = [`Repo: ${issue.repo}`, `Labels: ${issue.labels.join(', ') || '-'}`, `Assignees: ${issue.assignees.join(', ') || '-'}`]
  if (Object.keys(issue.fields).length) meta.push(`Board: ${Object.entries(issue.fields).map(([k, v]) => `${k}=${v}`).join(' · ')}`)
  if (issue.parent) meta.push(`Pai: ${issue.parent}`)
  process.stdout.write(`# ${issue.title}\n\n${meta.join('\n')}\n\n${issue.body}\n`)
}

function cmdCreate(config, positional, flags) {
  const issue = validated(config, positional[0])
  if (flags['dry-run']) return cmdCheck(config, positional, { json: true })
  const steps = []
  let created
  try {
    const board = config.project && Object.keys(issue.fields).length ? prepareBoard(config, issue.fields) : null
    if (flags.issue) {
      const ref = parseRef(flags.issue, issue.repo)
      created = { ...ref, url: issueNode(ref).url }
      steps.push(`issue existente ${created.url}`)
    } else {
      created = createIssue(issue)
      steps.push(`criada ${created.url}`)
    }
    if (board) steps.push(`board: ${applyBoard(config, board, created.url).join(', ')}`)
    if (issue.parent) steps.push(linkParent(parseRef(issue.parent, issue.repo), created))
  } catch (err) {
    const resume = created ? `\nA issue já existe. Para completar sem duplicar:\n  exonous issue-create create ${positional[0]} --issue ${created.url}` : ''
    fail(`${steps.map((s) => `ok: ${s}`).join('\n')}${steps.length ? '\n' : ''}falhou: ${err.message}${resume}`)
  }
  process.stdout.write(flags.json ? `${JSON.stringify({ url: created.url, number: created.number, steps })}\n` : `${steps.map((s) => `ok: ${s}`).join('\n')}\n${created.url}\n`)
}

function cmdInit(flags) {
  const target = join(HERE, 'config.json')
  if (existsSync(target) && !flags.force) fail('config.json já existe; use --force para trocar (o atual é sobrescrito).', EXIT_CONFIG)
  const source = typeof flags.from === 'string' ? flags.from : join(HERE, 'config.example.json')
  if (!existsSync(source)) fail(`arquivo do padrão não existe: ${source}`, EXIT_CONFIG)
  const standard = readJson(source)
  if (!standard.templates || !Object.keys(standard.templates).length) fail(`${source} não é um padrão de issue: falta "templates".`, EXIT_CONFIG)
  copyFileSync(source, target)
  process.stdout.write(`config.json criado a partir de ${source}\n`)
}

const USAGE = `uso: exonous issue-create <comando>
  init [--from padrao.json] [--force] cria config.json com o padrão do time (sem --from: config.example.json)
  standard [--json]                   mostra o padrão: título, labels, campos, templates
  check <rascunho.json> [--json]      valida e mostra a issue como vai ficar
  create <rascunho.json> [--dry-run] [--issue <n|url>] [--json]   cria, põe no board, liga ao pai`

function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2))
  const command = positional.shift()
  if (command === 'init') return cmdInit(flags)
  if (!command || command === 'help') return process.stdout.write(`${USAGE}\n`)
  const config = loadConfig()
  if (command === 'standard') return cmdStandard(config, flags)
  if (command === 'check') return cmdCheck(config, positional, flags)
  if (command === 'create') return cmdCreate(config, positional, flags)
  fail(USAGE)
}

main()
