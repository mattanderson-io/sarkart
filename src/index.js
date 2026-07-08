const app = require('./app')
const port = process.env.PORT || 3000

app.get('*path', (req, res) => {
    res.status(404).render('404', {
        title: 'SARchart - 404',
        errorMessage: 'This page does not exist'
    })
})

app.listen(port, () => {
    console.log('Server is up on port ' + port)
})
