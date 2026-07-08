const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const distIndex = path.join(__dirname, '../dist/index.html')

if (!fs.existsSync(distIndex)) {
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit'
  })

  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}
