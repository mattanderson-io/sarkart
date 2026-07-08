const path = require('path')
const app = require('./app')
const port = process.env.PORT || 3000

// Catch-all 404 for any request not handled by app.js (static assets or the
// `/` app shell). `*path` is Express 5's named-wildcard syntax (the bare `*`
// of Express 4 is no longer valid) — it matches all remaining paths and binds
// them to req.params.path, which we don't use here. Registered last so it only
// runs after every real route/static handler has had a chance to respond.
const notFoundPage = path.join(__dirname, '../public/404.html')
app.get('*path', (req, res) => {
    res.status(404).sendFile(notFoundPage)
})

app.listen(port, () => {
    console.log('Server is up on port ' + port)
})
