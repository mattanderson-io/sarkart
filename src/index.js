const path = require('path')
const app = require('./app')
const port = process.env.PORT || 3000

const notFoundPage = path.join(__dirname, '../public/404.html')
app.get('*path', (req, res) => {
    res.status(404).sendFile(notFoundPage)
})

app.listen(port, () => {
    console.log('Server is up on port ' + port)
})
