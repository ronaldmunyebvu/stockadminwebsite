const { spawn } = require('child_process')
const path = require('path')

const root = path.join(__dirname, '..')
const children = []
let shuttingDown = false

function run(label, command, args) {
  const child = spawn(command, args, { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'], shell: false })
  const prefix = `[${label}] `
  const pipe = (stream, sink) => {
    let buffered = ''
    stream.on('data', chunk => {
      buffered += chunk.toString()
      const lines = buffered.split(/\r?\n/)
      buffered = lines.pop() || ''
      for (const line of lines) sink.write(prefix + line + '\n')
    })
  }
  pipe(child.stdout, process.stdout)
  pipe(child.stderr, process.stderr)
  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    console.log(`${prefix}exited (${signal || code}). Stopping the other process.`)
    shutdown(typeof code === 'number' ? code : 1)
  })
  child.on('error', err => {
    console.error(`${prefix}failed to start: ${err.message}`)
    if (shuttingDown) return
    shutdown(1)
  })
  children.push(child)
  return child
}

function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      try { child.kill('SIGTERM') } catch { /* already gone */ }
    }
  }
  setTimeout(() => process.exit(code), 300)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

console.log('Starting API server (http://localhost:8787) and Vite dev server (http://localhost:5174)...')
run('api', process.execPath, [path.join(root, 'server', 'index.cjs')])
run('web', process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')])
