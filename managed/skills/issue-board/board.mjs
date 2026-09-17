#!/usr/bin/env node
// issue-board: busca as issues abertas de um GitHub Project (v2), junta com a
// classificação sugerida pelo agente e desenha tabelas no terminal.
// Sem dependências: só Node >= 18 e o gh CLI autenticado.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PRIORITIES = ['P0', 'P1', 'P2', 'P3']
const DIFFICULTIES = ['1', '2', '3']
const BODY_LIMIT = 1500
const EXIT_AUTH = 2
const EXIT_CONFIG = 3
const EXIT_NO_GH = 4
const BOOLEAN_FLAGS = new Set(['all', 'color', 'no-color', 'json'])
const MIN_TITLE_WIDTH = 20

const DEFAULT_FIELDS = { status: 'Status', priority: 'Priority', size: 'Size', group: '' }
const DEFAULT_TYPES = [
  { id: 'bug', name: 'Bug', hint: 'algo que funcionava ou deveria funcionar e não funciona' },
  { id: 'feature', name: 'Feature', hint: 'comportamento novo pedido' },
  { id: 'front', name: 'Interface', hint: 'telas, layout, mensagens, UX' },
  { id: 'dados', name: 'Dados', hint: 'dado errado, perdido, migração, consistência' },
  { id: 'performance', name: 'Performance', hint: 'lentidão, dado atrasado, consumo de recurso' },
  { id: 'seguranca', name: 'Segurança', hint: 'auth, permissão, vazamento, segredo' },
  { id: 'infra', name: 'Infra', hint: 'deploy, CI, cloud, banco, observabilidade' },
  { id: 'outros', name: 'Outros', hint: 'docs, ferramentas de dev, decisões' },
]
// Valores comuns dos campos de prioridade e tamanho; config.priorityMap / sizeMap estendem.
const DEFAULT_PRIORITY_MAP = { p0: 'P0', urgent: 'P0', critical: 'P0', p1: 'P1', high: 'P1', p2: 'P2', medium: 'P2', p3: 'P3', low: 'P3' }
const DEFAULT_SIZE_MAP = { xs: 1, s: 1, small: 1, m: 2, medium: 2, l: 3, large: 3, xl: 3 }
const DIFFICULTY_LABEL = { 1: 'Fácil', 2: 'Média', 3: 'Difícil' }

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`)
  process.exit(code)
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

// Minúsculas e sem acento, para "facil" casar com "Fácil".
function fold(value) {
  return String(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

function lowerKeys(map) {
  return Object.fromEntries(Object.entries(map || {}).map(([k, v]) => [k.toLowerCase(), v]))
}

function loadConfig(flags) {
  const file = readJson(join(HERE, 'config.json'), {})
  const config = {
    owner: flags.owner || file.owner,
    projectNumber: Number(flags['project-number'] || file.projectNumber),
    fields: { ...DEFAULT_FIELDS, ...file.fields },
    doneStatuses: file.doneStatuses || ['Done'],
    types: file.types?.length ? file.types : DEFAULT_TYPES,
    priorityMap: { ...DEFAULT_PRIORITY_MAP, ...lowerKeys(file.priorityMap) },
    sizeMap: { ...DEFAULT_SIZE_MAP, ...lowerKeys(file.sizeMap) },
  }
  if (!config.owner || !config.projectNumber) {
    fail('Board não definido. Preencha owner e projectNumber em config.json (veja config.example.json) ou passe --owner e --project-number.', EXIT_CONFIG)
  }
  if (!/^[A-Za-z0-9-]+$/.test(config.owner) || !Number.isInteger(config.projectNumber) || config.projectNumber < 1) {
    fail(`Board inválido: owner "${config.owner}", projectNumber "${config.projectNumber}".`, EXIT_CONFIG)
  }
  for (const [value, difficulty] of Object.entries(config.sizeMap)) {
    if (![1, 2, 3].includes(difficulty)) fail(`sizeMap: "${value}" deve apontar para 1, 2 ou 3.`, EXIT_CONFIG)
  }
  for (const [value, priority] of Object.entries(config.priorityMap)) {
    if (!PRIORITIES.includes(priority)) fail(`priorityMap: "${value}" deve apontar para P0..P3.`, EXIT_CONFIG)
  }
  config.dataDir = join(HERE, 'data', `${config.owner}-${config.projectNumber}`)
  return config
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
}

function requireAuth() {
  try {
    return gh(['api', 'user', '-q', '.login']).trim()
  } catch (err) {
    if (err.code === 'ENOENT') fail('gh CLI não encontrado. Instale: https://cli.github.com', EXIT_NO_GH)
    fail(
      'gh não está autenticado no github.com. Rode no prompt do Claude Code:\n' +
        '  ! gh auth login -s read:project\n' +
        `e depois execute o comando de novo. (${String(err.stderr || err.message).trim()})`,
      EXIT_AUTH,
    )
  }
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

// O project pode pertencer a uma organização ou a um usuário.
const queryFor = (ownerKind) => `query($owner:String!,$num:Int!,$cursor:String){${ownerKind}(login:$owner){projectV2(number:$num){
  items(first:100,after:$cursor){pageInfo{hasNextPage endCursor} nodes{
    fieldValues(first:30){nodes{... on ProjectV2ItemFieldSingleSelectValue{name field{... on ProjectV2FieldCommon{name}}}}}
    content{... on Issue{number title state url body updatedAt repository{nameWithOwner}
      assignees(first:10){nodes{login}} labels(first:20){nodes{name}}}}
  }}}}}`

function fetchPage(config, ownerKind, cursor) {
  const args = ['api', 'graphql', '-f', `query=${queryFor(ownerKind)}`, '-f', `owner=${config.owner}`, '-F', `num=${config.projectNumber}`]
  if (cursor) args.push('-f', `cursor=${cursor}`)
  try {
    return JSON.parse(gh(args)).data?.[ownerKind]?.projectV2?.items ?? null
  } catch (err) {
    const stderr = String(err.stderr || err.message)
    if (/read:project|INSUFFICIENT_SCOPES/i.test(stderr)) {
      fail('O token do gh não tem o escopo read:project. Rode:\n  ! gh auth refresh -s read:project', EXIT_AUTH)
    }
    // Owner do tipo errado (org vs. usuário) responde NOT_FOUND: tratamos como ausência.
    if (/NOT_FOUND|Could not resolve/i.test(stderr)) return null
    fail(`Falha ao ler o project: ${stderr.trim()}`)
  }
}

function fetchItems(config) {
  // A primeira página também descobre se o owner é organização ou usuário.
  const orgPage = fetchPage(config, 'organization', null)
  const ownerKind = orgPage ? 'organization' : 'user'
  let firstPage = orgPage || fetchPage(config, 'user', null)
  const items = []
  let cursor = null
  do {
    const conn = firstPage || fetchPage(config, ownerKind, cursor)
    firstPage = null
    if (!conn) fail(`Project ${config.owner}#${config.projectNumber} não encontrado ou sem acesso. Liste os disponíveis com: gh project list --owner ${config.owner}`)
    items.push(...conn.nodes)
    cursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null
  } while (cursor)
  return items
}

function normalize(node, fields) {
  const c = node.content
  if (!c?.number || c.state !== 'OPEN') return null
  const values = {}
  for (const v of node.fieldValues.nodes) {
    if (v?.field?.name) values[v.field.name] = v.name
  }
  return {
    key: `${c.repository.nameWithOwner}#${c.number}`,
    repo: c.repository.nameWithOwner.split('/')[1],
    number: c.number,
    title: c.title,
    url: c.url,
    updatedAt: c.updatedAt,
    assignees: c.assignees.nodes.map((a) => a.login),
    labels: c.labels.nodes.map((l) => l.name),
    body: (c.body || '').replace(/<img[^>]*>/g, '[imagem]').slice(0, BODY_LIMIT),
    status: values[fields.status] || '',
    group: fields.group ? values[fields.group] || '' : '',
    boardPriority: values[fields.priority] || '',
    boardSize: values[fields.size] || '',
  }
}

function cmdFetch(config, flags) {
  const me = requireAuth()
  const done = new Set(config.doneStatuses)
  const all = fetchItems(config)
    .map((n) => normalize(n, config.fields))
    .filter((i) => i && !done.has(i.status))
  const mine = all.filter((i) => i.assignees.includes(me))
  writeJson(join(config.dataDir, 'items.json'), { fetchedAt: new Date().toISOString(), me, items: all })
  const classes = readJson(join(config.dataDir, 'classification.json'), {})
  const scope = flags.all ? all : mine
  const pending = scope.filter((i) => !classes[i.key]).length
  console.log(`Board ${config.owner}#${config.projectNumber}: ${all.length} issues abertas, ${mine.length} atribuídas a ${me}. Sem classificação no escopo: ${pending}.`)
}

function scopeItems(config, flags) {
  const data = readJson(join(config.dataDir, 'items.json'), null)
  if (!data) fail('Nada em cache para esse board. Rode "fetch" antes.')
  if (flags.user === true) fail('--user precisa de um login.')
  const wanted = flags.user || data.me
  return flags.all ? data.items : data.items.filter((i) => i.assignees.includes(wanted))
}

function cmdPending(config, flags) {
  const classes = readJson(join(config.dataDir, 'classification.json'), {})
  const pending = scopeItems(config, flags)
    .filter((i) => !classes[i.key])
    .map(({ key, title, labels, status, group, boardPriority, boardSize, body }) => ({ key, title, labels, status, group, boardPriority, boardSize, body }))
  console.log(JSON.stringify({ types: config.types, issues: pending }, null, 2))
}

function cmdClassify(config, positional) {
  const file = positional[0]
  if (!file) fail('Uso: classify <arquivo.json>')
  const typeIds = new Set(config.types.map((t) => t.id))
  const entries = JSON.parse(readFileSync(file, 'utf8'))
  if (!Array.isArray(entries)) fail('O arquivo precisa ser um array de {key, type, priority, difficulty, note?}.')
  const path = join(config.dataDir, 'classification.json')
  const classes = readJson(path, {})
  const errors = []
  for (const e of entries) {
    if (typeof e?.key !== 'string' || !e.key.includes('#')) errors.push(`entrada sem key válida: ${JSON.stringify(e)}`)
    else if (!typeIds.has(e.type)) errors.push(`${e.key}: type "${e.type}" não existe nos tipos configurados`)
    else if (!PRIORITIES.includes(e.priority)) errors.push(`${e.key}: priority deve ser P0..P3`)
    else if (!DIFFICULTIES.includes(String(e.difficulty))) errors.push(`${e.key}: difficulty deve ser 1, 2 ou 3`)
    else classes[e.key] = { type: e.type, priority: e.priority, difficulty: Number(e.difficulty), note: e.note || '' }
  }
  if (errors.length) fail(`Nada gravado. Corrija:\n${errors.join('\n')}`)
  writeJson(path, classes)
  console.log(`${entries.length} classificações gravadas.`)
}

// ---------- render ----------

function resolve(item, classes, config) {
  const c = classes[item.key] || {}
  // Valor preenchido no board e fora do mapa aparece cru: o campo não está vazio.
  const boardP = config.priorityMap[item.boardPriority.toLowerCase()] || item.boardPriority
  const boardD = config.sizeMap[item.boardSize.toLowerCase()] || 0
  return {
    ...item,
    typeId: c.type || '',
    type: config.types.find((t) => t.id === c.type)?.name || 'Sem tipo',
    priority: boardP || c.priority || '—',
    prioritySuggested: !boardP && Boolean(c.priority),
    difficulty: boardD || c.difficulty || 0,
    difficultySuggested: !boardD && Boolean(c.difficulty),
    note: c.note || '',
  }
}

function makePaint(enabled) {
  const code = (n) => (s) => (enabled ? `\x1b[${n}m${s}\x1b[0m` : s)
  return { red: code('31;1'), yellow: code('33;1'), cyan: code('36'), gray: code('90'), bold: code('1'), dim: code('2') }
}

function pad(text, width) {
  const chars = [...String(text)]
  if (chars.length > width) return `${chars.slice(0, width - 1).join('')}…`
  return chars.join('') + ' '.repeat(width - chars.length)
}

function table(rows, columns, paint) {
  const line = (l, m, r) => l + columns.map((c) => '─'.repeat(c.width + 2)).join(m) + r
  const out = [line('┌', '┬', '┐')]
  out.push('│' + columns.map((c) => ` ${paint.bold(pad(c.label, c.width))} `).join('│') + '│')
  out.push(line('├', '┼', '┤'))
  for (const row of rows) {
    out.push('│' + columns.map((c) => ` ${c.color ? c.color(row, pad(c.get(row), c.width)) : pad(c.get(row), c.width)} `).join('│') + '│')
  }
  out.push(line('└', '┴', '┘'))
  return out.join('\n')
}

function priorityColor(paint) {
  return (row, text) => ({ P0: paint.red, P1: paint.yellow, P2: paint.cyan, P3: paint.gray })[row.priority]?.(text) ?? text
}

const GROUPS = {
  tipo: (r) => r.type,
  prioridade: (r) => r.priority,
  dificuldade: (r) => DIFFICULTY_LABEL[r.difficulty] || 'Sem dificuldade',
  campo: (r) => r.group || '(vazio)',
  status: (r) => r.status || 'Sem status',
  repo: (r) => r.repo,
}

const rank = (p) => (PRIORITIES.includes(p) ? PRIORITIES.indexOf(p) : 9)

// Filtra, agrupa e ordena: a mesma visão serve à tabela ANSI e ao --json do render.py.
function buildView(config, flags) {
  const classes = readJson(join(config.dataDir, 'classification.json'), {})
  const list = (v) => (typeof v === 'string' ? v.split(',').map((s) => fold(s.trim())) : null)
  const filters = [
    [list(flags.prioridade), (r) => r.priority],
    [list(flags.dificuldade), (r) => DIFFICULTY_LABEL[r.difficulty] || ''],
    [list(flags.tipo), (r) => `${r.typeId} ${r.type}`],
    [list(flags.campo), (r) => r.group],
    [list(flags.repo), (r) => r.repo],
    [list(flags.status), (r) => r.status],
  ]
  const rows = scopeItems(config, flags)
    .map((i) => resolve(i, classes, config))
    .filter((r) => filters.every(([want, get]) => !want || want.some((w) => fold(get(r)).includes(w))))
  const groupBy = GROUPS[flags.por] ? flags.por : 'tipo'
  const order = groupBy === 'tipo' ? [...config.types.map((t) => t.name), 'Sem tipo'] : null
  const groups = new Map()
  for (const r of rows) {
    const g = GROUPS[groupBy](r)
    groups.set(g, [...(groups.get(g) || []), r])
  }
  const names = [...groups.keys()].sort((a, b) => (order ? order.indexOf(a) - order.indexOf(b) : String(a).localeCompare(String(b))))
  return {
    board: `${config.owner}#${config.projectNumber}`,
    user: flags.all ? null : flags.user || readJson(join(config.dataDir, 'items.json'), {}).me || null,
    groupBy,
    groupField: config.fields.group || null,
    total: rows.length,
    counts: Object.fromEntries(PRIORITIES.map((p) => [p, rows.filter((r) => r.priority === p).length])),
    groups: names.map((name) => ({
      name,
      rows: groups
        .get(name)
        .sort((a, b) => rank(a.priority) - rank(b.priority) || (a.difficulty || 9) - (b.difficulty || 9))
        .map(({ key, repo, number, title, url, status, group, type, priority, prioritySuggested, difficulty, difficultySuggested, note }) => ({
          key, repo, number, title, url, status, group, type, priority, prioritySuggested, difficulty, difficultySuggested, note,
        })),
    })),
  }
}

function cmdRender(config, flags) {
  const view = buildView(config, flags)
  if (flags.json) {
    console.log(JSON.stringify(view))
    return
  }
  const paint = makePaint(flags.color === true || (flags['no-color'] === undefined && process.stdout.isTTY))
  if (!view.total) {
    console.log('Nenhuma issue nesse escopo. Tente --all para ver o board inteiro.')
    return
  }

  const counts = PRIORITIES.map((p) => `${p} ${view.counts[p]}`).join('  ·  ')
  console.log(paint.bold(`${view.total} issues  |  ${counts}`))
  console.log(paint.dim('Dificuldade ■□□ fácil  ■■□ média  ■■■ difícil   ~ = sugestão do agente (campo vazio no board)\n'))

  const width = Math.max(60, Math.min(process.stdout.columns || 140, 180))
  const title = { label: 'Título', width: 0, get: (r) => (r.note ? `${r.title} [${r.note}]` : r.title) }
  const columns = [
    { label: 'Pri', width: 4, get: (r) => r.priority + (r.prioritySuggested ? '~' : ''), color: priorityColor(paint) },
    { label: 'Dif', width: 5, get: (r) => (r.difficulty ? '■'.repeat(r.difficulty) + '□'.repeat(3 - r.difficulty) : '—') + (r.difficultySuggested ? '~' : '') },
    { label: 'Issue', width: 26, get: (r) => `${r.repo}#${r.number}` },
    title,
    { label: 'Status', width: 12, get: (r) => r.status || '—' },
  ]
  const optional = []
  if (view.groupField) optional.push({ label: view.groupField, width: 10, get: (r) => r.group || '—' })
  if (view.groupBy !== 'tipo') optional.push({ label: 'Tipo', width: 18, get: (r) => r.type })
  const spare = (cols) => width - cols.reduce((sum, c) => sum + c.width + 3, 0) - 1
  // Terminal estreito: a coluna opcional sai antes de o título ficar ilegível.
  for (const col of optional) {
    if (spare([...columns, col]) >= MIN_TITLE_WIDTH) columns.push(col)
  }
  title.width = Math.max(MIN_TITLE_WIDTH, spare(columns))

  for (const group of view.groups) {
    console.log(paint.bold(`▌ ${group.name}  (${group.rows.length})`))
    console.log(table(group.rows, columns, paint))
    console.log('')
  }
}

const { flags, positional } = parseArgs(process.argv.slice(2))
const command = positional.shift()
const commands = { fetch: cmdFetch, pending: cmdPending, classify: (c) => cmdClassify(c, positional), render: cmdRender }
if (!commands[command]) {
  fail('Uso: node board.mjs <fetch|pending|classify|render> [--owner x --project-number n] [--all] [--user login] [--por tipo|prioridade|dificuldade|campo|status|repo] [--prioridade P0,P1] [--dificuldade fácil] [--tipo bug] [--campo valor] [--repo nome] [--status ready] [--color|--no-color] [--json]')
}
if (command === 'fetch') requireAuth()
commands[command](loadConfig(flags), flags)
