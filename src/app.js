const path = require('path')
const fs = require('fs')
const express = require('express')
const helmet = require('helmet')

const app = express()

// Security headers + Content-Security-Policy. SARkart is a client-only app
// (all parsing happens in the browser), so the policy locks every resource to
// same-origin. `connect-src 'self'` in particular *enforces* the product's
// privacy claim — the page cannot exfiltrate an uploaded SAR file anywhere.
// `style-src` allows inline styles because Plotly injects a <style> block (and
// the static 404 page uses an inline <style>); no inline SCRIPT is needed (the
// theme setter is an external /js/theme-init.js and the vendored libs load with
// SRI). helmet also sets nosniff, Referrer-Policy, X-Frame-Options, HSTS, etc.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"]
    }
  }
}))

// Define Paths for Express config
const publicDirPath = path.join(__dirname, '../public')
const distDirPath = path.join(__dirname, '../dist')

// Immutable cache for versioned assets
app.use('/js/plotly-cartesian-3.7.0.min.js', express.static(path.join(publicDirPath, 'js/plotly-cartesian-3.7.0.min.js'), {
  maxAge: '1y',
  immutable: true
}))

app.use('/assets', express.static(path.join(distDirPath, 'assets'), {
  maxAge: '1y',
  immutable: true
}))

// Setup Static directory to serve
app.use(express.static(publicDirPath))

app.get('', (req, res) => {
  const indexPath = path.join(distDirPath, 'index.html')
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath)
    return
  }
  // The Preact build (dist/index.html) is the only app shell. If it's missing
  // the server was started without building.
  res
    .status(503)
    .type('text/plain')
    .send('SARkart build not found. Run "npm run build" to generate dist/index.html before starting the server.')
})

module.exports = app
