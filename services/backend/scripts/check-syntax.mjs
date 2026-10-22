#!/usr/bin/env node
// Syntax-checks every backend source file with `node --check`.
// Replaces the hand-maintained list in package.json, which silently skipped
// any file that was not added to it.
import { spawnSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const folders = ['src', 'scripts', 'migrations']
const extensions = new Set(['.js', '.mjs', '.cjs'])

function collect(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules') continue
    const fullPath = path.join(directory, entry)
    if (statSync(fullPath).isDirectory()) {
      collect(fullPath, files)
    } else if (extensions.has(path.extname(entry))) {
      files.push(fullPath)
    }
  }
  return files
}

const files = folders.flatMap((folder) => collect(path.join(root, folder)))
let failed = 0

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (result.status !== 0) {
    failed += 1
    console.error(`FAIL ${path.relative(root, file)}\n${result.stderr}`)
  }
}

console.log(`Checked ${files.length} file(s), ${failed} failed.`)
process.exit(failed ? 1 : 0)
