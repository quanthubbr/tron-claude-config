#!/usr/bin/env node
// project-memory: durable project memory (adr / plan / doc) in the Obsidian vault, anchored to code
// with links and line-range evidence, searched locally. No dependencies: Node >= 18 and git.

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const KINDS = ['adr', 'plan', 'doc']
const READ_KINDS = [...KINDS, 'session']
const SKIP_DIRS = new Set(['.obsidian', '.trash', 'node_modules', '.git'])
const MAX_NOTE_BYTES = 2 * 1024 * 1024
const DEFAULT_LIMIT = 8
const EXIT_USAGE = 2
const EXIT_NO_VAULT = 3
const STOPWORDS = new Set('a an and are as at be by de do da das dos e em for from how in is it na no o of on or os para por que the to um uma was what when where which with'.split(' '))
const FIELD_WEIGHT = { title: 3, tags: 2.5, links: 1.5, body: 1 }
const BM25_K1 = 1.2
const BM25_B = 0.75

const USAGE = `project-memory <command> [flags]
  search <query> [--kind adr|plan|doc|session] [--limit N] [--full]
  show <id>
  list [--kind K] [--status S]
  add <adr|plan|doc> --title T (--body B | --body-file F) [--tag t]... [--link file:P|symbol:S]... [--evidence path:L1-L2]... [--status S]
  update <id> [--title T] [--body B | --body-file F] [--status S] [--add-tag t] [--add-link L] [--add-evidence E] [--remove-evidence path]
  remove <id> [--force]          plans freely; adr/doc need --force
  validate                       evidence drift + unresolved links
Common: --project <name> (default: repo name) · vault from PROJECT_MEMORY_VAULT, else config.json { "vault": "<abs path>" } next to this script, else the exonous config (exonous vault)`

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`)
  process.exit(code)
}

function git(cwd, args) {
  return execFileSync('git', ['-c', 'core.quotePath=false', '-C', cwd, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function posix(path) {
  return path.split(sep).join('/')
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
    const key = arg.slice(2)
    const value = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : true
    flags[key] = key in flags ? [].concat(flags[key], value) : value
  }
  return { flags, positional }
}

function many(value) {
  if (value === undefined || value === true) return []
  return [].concat(value).map(String)
}

function one(value) {
  return Array.isArray(value) ? value[value.length - 1] : value
}

// ── Context: repo + vault ────────────────────────────────────────────────────

function repoContext(start) {
  try {
    const root = git(start, ['rev-parse', '--show-toplevel'])
    // Worktrees share the main checkout's name, so memories follow the repo, not the worktree.
    const main = git(root, ['worktree', 'list', '--porcelain']).split('\n')[0].replace(/^worktree /, '')
    return { root: resolve(root), name: basename(main).replace(/\.git$/, '') }
  } catch {
    return { root: null, name: null }
  }
}

function configVault(configPath) {
  if (!existsSync(configPath)) return null
  let vault
  try {
    vault = JSON.parse(readFileSync(configPath, 'utf8')).vault
  } catch (err) {
    fail(`Invalid ${configPath}: ${err.message}`, EXIT_NO_VAULT)
  }
  if (vault !== undefined && vault !== null && typeof vault !== 'string') fail(`Invalid ${configPath}: "vault" must be a string`, EXIT_NO_VAULT)
  return vault || null
}

function vaultRoot() {
  if (process.env.PROJECT_MEMORY_VAULT) return resolve(process.env.PROJECT_MEMORY_VAULT)
  // Per-skill override first, then the unified exonous config (same base as the hooks: EXONOUS_HOME or home).
  const skillConfig = join(HERE, 'config.json')
  const exonousConfig = join(process.env.EXONOUS_HOME || homedir(), '.claude', 'exonous', 'config.json')
  const vault = configVault(skillConfig) || configVault(exonousConfig)
  if (vault) return resolve(vault)
  fail(`No vault configured. Run \`exonous vault detect\` (then \`exonous vault set <path>\`), or set PROJECT_MEMORY_VAULT.`, EXIT_NO_VAULT)
}

function context(flags) {
  const repo = repoContext(process.cwd())
  const project = one(flags.project) || repo.name
  if (!project) fail('Not inside a git repo: pass --project <name>.', EXIT_USAGE)
  const vault = vaultRoot()
  if (!existsSync(vault)) fail(`Vault not found: ${vault}`, EXIT_NO_VAULT)
  return { repo, project, dir: join(vault, project) }
}

// ── Notes: frontmatter subset (scalars and string lists) ─────────────────────

function parseScalar(raw) {
  const value = raw.trim()
  if (/^".*"$/.test(value)) {
    try {
      return JSON.parse(value)
    } catch {
      return value.slice(1, -1)
    }
  }
  return value.replace(/^'(.*)'$/, '$1')
}

function parseNote(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  if (!match) return { meta: {}, body: text }
  const meta = {}
  let listKey = null
  for (const line of match[1].split(/\r?\n/)) {
    const item = /^\s+-\s+(.*)$/.exec(line)
    if (item && listKey) {
      meta[listKey].push(parseScalar(item[1]))
      continue
    }
    const pair = /^([\w-]+):\s*(.*)$/.exec(line)
    if (!pair) continue
    const [, key, raw] = pair
    listKey = null
    if (raw === '') {
      meta[key] = []
      listKey = key
    } else if (/^\[.*\]$/.test(raw.trim())) {
      meta[key] = raw.trim().slice(1, -1).split(',').map(parseScalar).filter(Boolean)
    } else {
      meta[key] = parseScalar(raw)
    }
  }
  return { meta, body: text.slice(match[0].length) }
}

function quote(value) {
  return /^[\w./][\w ./@#:+-]*$/.test(value) && !/:\s|\s#|\s$/.test(value) ? value : JSON.stringify(value)
}

function serializeNote(meta, body) {
  const lines = ['---']
  for (const [key, value] of Object.entries(meta)) {
    if (Array.isArray(value)) {
      if (!value.length) continue
      lines.push(`${key}:`, ...value.map((v) => `  - ${quote(String(v))}`))
    } else if (value !== undefined && value !== '') {
      lines.push(`${key}: ${quote(String(value))}`)
    }
  }
  lines.push('---', '')
  return `${lines.join('\n')}${body.trim()}\n`
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.isDirectory()) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full, out)
    } else if (entry.name.endsWith('.md') && statSync(full).size <= MAX_NOTE_BYTES) {
      out.push(full)
    }
  }
  return out
}

function loadNotes(dir) {
  return walk(dir).map((path) => {
    const { meta, body } = parseNote(readFileSync(path, 'utf8'))
    const rel = posix(relative(dir, path))
    return {
      path,
      id: meta.id || rel,
      kind: READ_KINDS.includes(meta.kind) ? meta.kind : 'note',
      title: meta.title || basename(path, '.md'),
      status: meta.status || '',
      tags: many(meta.tags),
      links: many(meta.links),
      evidence: many(meta.evidence),
      meta,
      body,
    }
  })
}

function findNote(notes, id) {
  const note = notes.find((n) => n.id === id)
  if (!note) fail(`No memory with id "${id}".`)
  return note
}

// ── Search: BM25 over body, weighted term hits over title/tags/links ─────────

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

function rank(notes, query) {
  const terms = [...new Set(tokenize(query))]
  if (!terms.length) return []
  const docs = notes.map((note) => ({
    note,
    fields: {
      title: tokenize(note.title),
      tags: tokenize(note.tags.join(' ')),
      links: tokenize(note.links.join(' ')),
      body: tokenize(note.body),
    },
  }))
  const avgBody = docs.reduce((sum, d) => sum + d.fields.body.length, 0) / Math.max(docs.length, 1) || 1
  const idf = Object.fromEntries(terms.map((term) => {
    const df = docs.filter((d) => Object.values(d.fields).some((f) => f.includes(term))).length
    return [term, Math.log(1 + (docs.length - df + 0.5) / (df + 0.5))]
  }))
  return docs
    .map(({ note, fields }) => {
      let score = 0
      for (const term of terms) {
        for (const field of ['title', 'tags', 'links']) {
          if (fields[field].includes(term)) score += FIELD_WEIGHT[field] * idf[term]
        }
        const tf = fields.body.filter((t) => t === term).length
        if (tf) {
          const norm = BM25_K1 * (1 - BM25_B + (BM25_B * fields.body.length) / avgBody)
          score += FIELD_WEIGHT.body * idf[term] * ((tf * (BM25_K1 + 1)) / (tf + norm))
        }
      }
      return { note, score }
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
}

function firstLine(body) {
  const line = body.split('\n').map((l) => l.replace(/^#+\s*/, '').trim()).find((l) => l && l !== '---')
  return line ? (line.length > 120 ? `${line.slice(0, 117)}...` : line) : ''
}

function header(note) {
  const status = note.status ? ` (${note.status})` : ''
  return `${note.id}  [${note.kind}${status}]  ${note.title}`
}

function printFull(note) {
  process.stdout.write(`## ${header(note)}\n`)
  if (note.tags.length) process.stdout.write(`tags: ${note.tags.join(', ')}\n`)
  if (note.links.length) process.stdout.write(`links: ${note.links.join(', ')}\n`)
  if (note.evidence.length) process.stdout.write(`evidence: ${note.evidence.join(', ')}\n`)
  process.stdout.write(`\n${note.body.trim()}\n\n`)
}

function cmdSearch(flags, positional) {
  const query = positional.join(' ')
  if (!query) fail(USAGE, EXIT_USAGE)
  const { dir } = context(flags)
  const kind = one(flags.kind)
  const notes = loadNotes(dir).filter((n) => !kind || n.kind === kind)
  const limit = Number(one(flags.limit)) || DEFAULT_LIMIT
  const hits = rank(notes, query).slice(0, limit)
  if (!hits.length) {
    process.stdout.write('No matches.\n')
    return
  }
  for (const { note, score } of hits) {
    if (flags.full) printFull(note)
    else process.stdout.write(`${header(note)}  ${score.toFixed(2)}\n    ${firstLine(note.body)}\n`)
  }
}

function cmdShow(flags, positional) {
  if (!positional[0]) fail(USAGE, EXIT_USAGE)
  printFull(findNote(loadNotes(context(flags).dir), positional[0]))
}

function cmdList(flags) {
  const kind = one(flags.kind)
  const status = one(flags.status)
  const notes = loadNotes(context(flags).dir)
    .filter((n) => n.kind !== 'note' && (kind ? n.kind === kind : n.kind !== 'session') && (!status || n.status === status))
    .sort((a, b) => a.id.localeCompare(b.id))
  for (const note of notes) process.stdout.write(`${header(note)}\n`)
  if (!notes.length) process.stdout.write('No memories.\n')
}

// ── Writes ───────────────────────────────────────────────────────────────────

function slug(text) {
  return tokenize(text).slice(0, 6).join('-') || 'note'
}

function nextId(notes, kind) {
  const max = notes
    .map((n) => new RegExp(`^${kind}-(\\d+)$`).exec(n.id))
    .filter(Boolean)
    .reduce((m, match) => Math.max(m, Number(match[1])), 0)
  return `${kind}-${String(max + 1).padStart(4, '0')}`
}

function bodyFrom(flags) {
  if (flags['body-file']) return readFileSync(resolve(String(one(flags['body-file']))), 'utf8')
  return flags.body === undefined ? undefined : String(one(flags.body))
}

function rangeHash(content) {
  return createHash('sha256').update(content).digest('hex').slice(0, 8)
}

function parseEvidence(spec) {
  const match = /^(.+):(\d+)(?:-(\d+))?(?:#([0-9a-f]{8}))?$/.exec(spec)
  if (!match) return null
  const start = Number(match[2])
  return { path: match[1], start, end: Number(match[3] || start), hash: match[4] || null }
}

function sliceLines(text, start, end) {
  return text.split('\n').slice(start - 1, end).join('\n')
}

// Pins the evidence to the current content so `validate` can detect drift.
function anchorEvidence(repoRoot, spec) {
  const ev = parseEvidence(spec)
  if (!ev || ev.end < ev.start) fail(`Bad evidence "${spec}": expected path:L1-L2.`, EXIT_USAGE)
  if (!repoRoot) fail('Evidence needs a git repo (run inside the project).', EXIT_USAGE)
  const file = join(repoRoot, ev.path)
  if (!existsSync(file)) fail(`Evidence file not found: ${ev.path}`)
  const text = readFileSync(file, 'utf8')
  const total = text.split('\n').length
  if (ev.end > total) fail(`Evidence ${spec} is past the end of ${ev.path} (${total} lines).`)
  return `${ev.path}:${ev.start}-${ev.end}#${rangeHash(sliceLines(text, ev.start, ev.end))}`
}

function checkLink(link) {
  if (!/^(file|symbol):.+/.test(link)) fail(`Bad link "${link}": expected file:<path> or symbol:<name>.`, EXIT_USAGE)
  return link
}

function cmdAdd(flags, positional) {
  const kind = positional[0]
  if (!KINDS.includes(kind)) fail(USAGE, EXIT_USAGE)
  const title = one(flags.title)
  const body = bodyFrom(flags)
  if (!title || title === true || body === undefined) fail('add needs --title and --body/--body-file.', EXIT_USAGE)
  const { repo, dir } = context(flags)
  const id = nextId(loadNotes(dir), kind)
  const meta = {
    id,
    kind,
    title,
    status: one(flags.status) || (kind === 'plan' ? 'open' : 'active'),
    created: new Date().toISOString().slice(0, 10),
    tags: many(flags.tag),
    links: many(flags.link).map(checkLink),
    evidence: many(flags.evidence).map((spec) => anchorEvidence(repo.root, spec)),
  }
  const path = join(dir, 'memory', kind, `${id}-${slug(title)}.md`)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, serializeNote(meta, body))
  process.stdout.write(`${id}  ${posix(relative(dir, path))}\n`)
}

function cmdUpdate(flags, positional) {
  const { repo, dir } = context(flags)
  const note = findNote(loadNotes(dir), positional[0])
  if (note.kind === 'note') fail(`"${note.id}" is not a project-memory note (no kind).`)
  const body = bodyFrom(flags)
  const dropped = new Set(many(flags['remove-evidence']))
  const meta = {
    ...note.meta,
    title: one(flags.title) || note.meta.title,
    status: one(flags.status) || note.meta.status,
    updated: new Date().toISOString().slice(0, 10),
    tags: [...new Set([...note.tags, ...many(flags['add-tag'])])],
    links: [...new Set([...note.links, ...many(flags['add-link']).map(checkLink)])],
    evidence: [
      ...note.evidence.filter((spec) => !dropped.has(spec) && !dropped.has(parseEvidence(spec)?.path)),
      ...many(flags['add-evidence']).map((spec) => anchorEvidence(repo.root, spec)),
    ],
  }
  writeFileSync(note.path, serializeNote(meta, body === undefined ? note.body : body))
  process.stdout.write(`${note.id} updated\n`)
}

function cmdRemove(flags, positional) {
  const note = findNote(loadNotes(context(flags).dir), positional[0])
  if (note.kind === 'note') fail(`"${note.id}" is not a project-memory note; remove it by hand.`)
  if (note.kind !== 'plan' && !flags.force) fail(`${note.kind} memories are durable; pass --force to remove ${note.id}.`)
  rmSync(note.path)
  process.stdout.write(`${note.id} removed\n`)
}

// ── Validate ─────────────────────────────────────────────────────────────────

function findMoved(text, expectedHash, span) {
  const all = text.split('\n')
  for (let start = 1; start + span - 1 <= all.length; start++) {
    if (rangeHash(all.slice(start - 1, start - 1 + span).join('\n')) === expectedHash) return `${start}-${start + span - 1}`
  }
  return null
}

function symbolExists(root, name) {
  try {
    return git(root, ['grep', '-I', '-q', '-w', '-F', '-e', name, '--', '.']) === ''
  } catch {
    return false
  }
}

function validateNote(root, note) {
  const problems = []
  for (const spec of note.evidence) {
    const ev = parseEvidence(spec)
    const file = ev && join(root, ev.path)
    if (!ev) problems.push(`bad evidence ${spec}`)
    else if (!existsSync(file)) problems.push(`missing file ${ev.path}`)
    else if (ev.hash) {
      const text = readFileSync(file, 'utf8')
      if (rangeHash(sliceLines(text, ev.start, ev.end)) !== ev.hash) {
        const moved = findMoved(text, ev.hash, ev.end - ev.start + 1)
        problems.push(moved ? `moved ${ev.path}:${ev.start}-${ev.end} → ${moved}` : `drift ${ev.path}:${ev.start}-${ev.end}`)
      }
    }
  }
  for (const link of note.links) {
    const [type, target] = [link.slice(0, link.indexOf(':')), link.slice(link.indexOf(':') + 1)]
    if (type === 'file' && !existsSync(join(root, target))) problems.push(`unresolved ${link}`)
    if (type === 'symbol' && !symbolExists(root, target)) problems.push(`unresolved ${link}`)
  }
  return problems
}

function cmdValidate(flags) {
  const { repo, dir } = context(flags)
  if (!repo.root) fail('validate runs inside the project repo.', EXIT_USAGE)
  let broken = 0
  const notes = loadNotes(dir).filter((n) => n.kind !== 'note')
  for (const note of notes) {
    const problems = validateNote(repo.root, note)
    if (!problems.length) continue
    broken++
    process.stdout.write(`${header(note)}\n${problems.map((p) => `    ${p}`).join('\n')}\n`)
  }
  process.stdout.write(`${notes.length} memories checked, ${broken} with problems.\n`)
  if (broken) process.exitCode = 1
}

const COMMANDS = { search: cmdSearch, show: cmdShow, list: cmdList, add: cmdAdd, update: cmdUpdate, remove: cmdRemove, validate: cmdValidate }

const [command, ...rest] = process.argv.slice(2)
if (!COMMANDS[command]) fail(USAGE, command ? EXIT_USAGE : 0)
const { flags, positional } = parseArgs(rest)
COMMANDS[command](flags, positional)
