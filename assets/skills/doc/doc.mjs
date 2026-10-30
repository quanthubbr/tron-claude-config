#!/usr/bin/env node
// doc: localiza o vault Obsidian de documentação de um repositório, a última nota
// de sessão desse repo e as notas cujas referências `arquivo:linha` quebraram ou
// apontam para arquivos alterados. Sem dependências: Node >= 18 e git.

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'bin', 'obj', 'vendor', 'coverage', 'target', 'venv', '__pycache__', 'Pods'])
const MAX_DEPTH = 6
const MAX_FILE_BYTES = 5 * 1024 * 1024
const EXIT_NO_REPO = 2
const EXIT_NO_VAULT = 3
// Qualquer `algo:12` ou `algo:12-30` entre crases; o resolvedor decide se é arquivo.
const REF = /`([^`\s:]+):(\d+)(?:-(\d+))?`/gu
const HOST_LIKE = /^(\d{1,3}(\.\d{1,3}){3}|localhost|[\w.-]+\.(com|net|org|io|uk|br|dev|app|cloud|internal|local))$/i

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`)
  process.exit(code)
}

function git(cwd, args) {
  // quotePath=false: sem isso o git devolve caminhos com acento escapados ("a\303\247").
  return execFileSync('git', ['-c', 'core.quotePath=false', '-C', cwd, ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function lines(output) {
  return output.split('\n').map((s) => s.trim()).filter(Boolean)
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
    const eq = arg.indexOf('=')
    const key = eq === -1 ? arg.slice(2) : arg.slice(2, eq)
    if (eq !== -1) flags[key] = arg.slice(eq + 1)
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) flags[key] = argv[++i]
    else flags[key] = true
  }
  return { flags, positional }
}

function repoInfo(start) {
  let root
  try {
    root = git(start, ['rev-parse', '--show-toplevel'])
  } catch {
    fail(`Não é um repositório git: ${start}`, EXIT_NO_REPO)
  }
  // Em worktree, o nome do repo é o do checkout principal (primeira linha do worktree list).
  const main = git(root, ['worktree', 'list', '--porcelain']).split('\n')[0].replace(/^worktree /, '')
  return {
    root: posix(resolve(root)),
    name: basename(main).replace(/\.git$/, ''),
    mainCheckout: posix(resolve(main)),
  }
}

function hasHead(root) {
  try {
    git(root, ['rev-parse', '--verify', 'HEAD'])
    return true
  } catch {
    return false
  }
}

function walkVaults(dir, depth, found) {
  if (depth > MAX_DEPTH) return found
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return found
  }
  if (entries.some((e) => e.isDirectory() && e.name === '.obsidian')) found.push(dir)
  for (const e of entries) {
    if (e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) walkVaults(join(dir, e.name), depth + 1, found)
  }
  return found
}

// Prefere o que o git conhece (respeita .gitignore e não entra em clone aninhado);
// cai para varrer o disco quando o .obsidian não está versionado.
function findVaults(root) {
  const fromGit = new Set()
  for (const f of lines(git(root, ['ls-files', '--cached', '--others', '--exclude-standard']))) {
    const at = f.indexOf('.obsidian/')
    if (at !== -1 && (at === 0 || f[at - 1] === '/')) fromGit.add(join(root, f.slice(0, at)))
  }
  return fromGit.size ? [...fromGit] : walkVaults(root, 0, [])
}

function markdownFiles(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) markdownFiles(full, out)
    else if (e.name.endsWith('.md')) out.push(full)
  }
  return out
}

// Nota de entrada: nome começando por _contexto, _índice ou README; a mais rasa primeiro.
function entryNote(vault, notes) {
  const score = (p) => {
    const name = basename(p).normalize('NFC').toLowerCase()
    if (/^_?(contexto|context)\b/u.test(name)) return 0
    if (/^_?(índice|indice|index)\b/u.test(name)) return 1
    if (name === 'readme.md') return 2
    return 9
  }
  const ranked = notes.filter((p) => score(p) < 9).sort((a, b) => score(a) - score(b) || a.split(sep).length - b.split(sep).length)
  return ranked[0] ? posix(relative(vault, ranked[0])) : null
}

function latestSessionNote(repoName) {
  const configPath = join(HERE, '..', 'session-handoff', 'config.json')
  if (!existsSync(configPath)) return { sessionsVault: null, note: null, reason: 'session-handoff sem config.json' }
  let sessionsVault
  try {
    sessionsVault = JSON.parse(readFileSync(configPath, 'utf8')).sessionsVault
  } catch {
    return { sessionsVault: null, note: null, reason: 'config.json do session-handoff inválido' }
  }
  const folder = sessionsVault && join(sessionsVault, repoName)
  if (!folder || !existsSync(folder)) return { sessionsVault, note: null, reason: `sem pasta ${repoName} no vault de sessões` }
  // As notas começam por AAAA-MM-DD HHmm, então a ordem do nome é a ordem do tempo.
  const notes = readdirSync(folder).filter((f) => /^\d{4}-\d{2}-\d{2}/.test(f) && f.endsWith('.md')).sort().reverse()
  return { sessionsVault, note: notes[0] ? posix(join(folder, notes[0])) : null, reason: notes[0] ? null : 'pasta sem notas datadas' }
}

function cmdLocate(flags) {
  const repo = repoInfo(resolve(flags.repo || process.cwd()))
  const describe = (base) =>
    findVaults(base).map((v) => {
      const notes = markdownFiles(v)
      return { path: posix(relative(base, v)) || '.', notes: notes.length, entry: entryNote(v, notes) }
    })
  const vaults = describe(repo.root)
  // Worktree criado antes do vault existir: o vault está no checkout principal, não falta no projeto.
  const vaultsInMainCheckout = !vaults.length && repo.mainCheckout !== repo.root ? describe(repo.mainCheckout) : []
  const session = latestSessionNote(repo.name)
  console.log(JSON.stringify({ repo, vaults, vaultsInMainCheckout, session }, null, 2))
  if (!vaults.length) process.exitCode = EXIT_NO_VAULT
}

// Commits desde `since` + mudanças ainda não commitadas + arquivos novos não rastreados.
function changedFiles(root, since) {
  // Valor começando com "-" viraria opção do git (ex.: --output=arquivo).
  if (since.startsWith('-')) fail(`--since inválido ("${since}"): use uma data AAAA-MM-DD ou um git ref existente.`)
  const files = new Set(lines(git(root, ['ls-files', '--others', '--exclude-standard'])))
  if (!hasHead(root)) {
    for (const f of lines(git(root, ['ls-files', '--cached']))) files.add(f)
    return files
  }
  for (const f of lines(git(root, ['diff', '--name-only', 'HEAD']))) files.add(f)
  let committed
  try {
    committed = /^\d{4}-\d{2}-\d{2}$/.test(since)
      ? git(root, ['log', `--since=${since} 00:00:00`, '--name-only', '--format='])
      : git(root, ['diff', '--name-only', `${since}...HEAD`])
  } catch (err) {
    fail(`--since inválido ("${since}"): use uma data AAAA-MM-DD ou um git ref existente. ${String(err.stderr || '').trim()}`)
  }
  for (const f of lines(committed)) files.add(f)
  return files
}

function lineCount(path) {
  let stat
  try {
    stat = statSync(path)
  } catch {
    return null
  }
  if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null
  const buf = readFileSync(path)
  if (buf.length === 0) return 0
  let count = 0
  for (const byte of buf) if (byte === 10) count++
  return buf[buf.length - 1] === 10 ? count : count + 1
}

// Notas citam o caminho completo, um caminho parcial (`oms/state.ts`) ou só o nome (`money.ts`).
function makeResolver(root) {
  const known = lines(git(root, ['ls-files', '--cached', '--others', '--exclude-standard']))
  const exact = new Set(known)
  const byName = new Map()
  for (const f of known) {
    const name = f.slice(f.lastIndexOf('/') + 1)
    byName.set(name, [...(byName.get(name) || []), f])
  }
  return (raw) => {
    const ref = raw.replace(/\\/g, '/').replace(/^\.\//, '')
    if (exact.has(ref)) return [ref]
    const name = ref.slice(ref.lastIndexOf('/') + 1)
    return (byName.get(name) || []).filter((f) => f.endsWith(`/${ref}`))
  }
}

function cmdRefs(flags, positional) {
  const repo = repoInfo(resolve(flags.repo || process.cwd()))
  const vault = resolve(repo.root, positional[0] || '')
  if (!positional[0] || !existsSync(join(vault, '.obsidian'))) fail('Uso: refs "<caminho do vault>" [--since <git-ref|AAAA-MM-DD>]', EXIT_NO_VAULT)
  const changed = flags.since ? changedFiles(repo.root, flags.since) : null
  const resolveRef = makeResolver(repo.root)
  const sizes = new Map()
  const broken = []
  const ambiguous = []
  const hostLike = new Set()
  const touched = new Map()
  let total = 0

  for (const note of markdownFiles(vault)) {
    const text = readFileSync(note, 'utf8')
    const noteRel = posix(relative(repo.root, note))
    for (const m of text.matchAll(REF)) {
      const target = m[1]
      if (HOST_LIKE.test(target)) {
        hostLike.add(m[0])
        continue
      }
      const candidates = resolveRef(target)
      // Sem ponto nem barra e sem arquivo com esse nome, não é arquivo (ex.: `status:200`).
      if (!candidates.length && !/[./]/.test(target)) continue
      total++
      if (changed && candidates.some((f) => changed.has(f))) {
        touched.set(noteRel, (touched.get(noteRel) || new Set()).add(m[0]))
      }
      if (candidates.length > 1) {
        ambiguous.push({ note: noteRel, ref: m[0], candidatos: candidates.slice(0, 5) })
        continue
      }
      if (!candidates.length) {
        broken.push({ note: noteRel, ref: m[0], problem: 'arquivo não existe neste repo' })
        continue
      }
      const file = candidates[0]
      if (!sizes.has(file)) sizes.set(file, lineCount(join(repo.root, file)))
      const line = Number(m[3] || m[2])
      if (sizes.get(file) !== null && line > sizes.get(file)) {
        broken.push({ note: noteRel, ref: m[0], problem: `${file} tem ${sizes.get(file)} linhas` })
      }
    }
  }

  console.log(JSON.stringify({
    vault: posix(relative(repo.root, vault)),
    referencias: total,
    quebradas: broken,
    ambiguas: ambiguous,
    ignoradasPorParecerHost: [...hostLike],
    notasQueCitamArquivosAlterados: changed
      ? [...touched].map(([note, refs]) => ({ note, refs: [...refs] }))
      : 'passe --since para cruzar com arquivos alterados',
  }, null, 2))
}

const { flags, positional } = parseArgs(process.argv.slice(2))
const command = positional.shift()
if (command === 'locate') cmdLocate(flags)
else if (command === 'refs') cmdRefs(flags, positional)
else fail('Uso: node doc.mjs <locate | refs "<vault>"> [--repo caminho] [--since git-ref|AAAA-MM-DD]')
