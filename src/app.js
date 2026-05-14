const path = require('path')
const express = require('express')
const hbs = require('hbs')

// console.log(__dirname) 
// console.log(path.join(__dirname, '../public')) 

const app = express()

// Define Paths for Express config
const publicDirPath = path.join(__dirname, '../public')
const viewsPath = path.join(__dirname, '../templates/views')
const partialsPath = path.join(__dirname, '../templates/partials')

//Setup handlebars engine and views location
app.set('view engine', 'hbs')
app.set('views', viewsPath)
app.set('view cache', false)

// Register partials synchronously before exporting
const fs = require('fs')
const partialFiles = fs.readdirSync(partialsPath)
partialFiles.forEach(function(file) {
  if (file.endsWith('.hbs')) {
    const name = file.replace('.hbs', '')
    const content = fs.readFileSync(path.join(partialsPath, file), 'utf8')
    hbs.registerPartial(name, content)
  }
})

// Immutable cache for versioned assets
app.use('/js/plotly-cartesian-3.5.1.min.js', express.static(path.join(publicDirPath, 'js/plotly-cartesian-3.5.1.min.js'), {
  maxAge: '1y',
  immutable: true
}))
app.use('/js/sarkart-v1.0.0.min.js', express.static(path.join(publicDirPath, 'js/sarkart-v1.0.0.min.js'), {
  maxAge: '1y',
  immutable: true
}))

// Setup Static directory to serve
app.use(express.static(publicDirPath))

module.exports = app