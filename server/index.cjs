require('dotenv').config()
const path = require('path')
const app = require('./app.cjs')
const port = Number(process.env.PORT || 8787)

app.use(expressStaticIfDistExists())

function expressStaticIfDistExists() {
  const distPath = path.join(__dirname, '..', 'dist')
  if (require('fs').existsSync(distPath)) {
    const express = require('express')
    return express.static(distPath)
  }
  return (req, res, next) => next()
}

app.listen(port, '0.0.0.0', () => console.log(`StockCount Neon API listening on http://localhost:${port}`))
