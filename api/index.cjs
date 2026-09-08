require('dotenv').config()
const app = require('../server/app.cjs')

module.exports = function handler(req, res, next) {
  if (!req.url.startsWith('/api')) {
    const original = req.url
    req.url = '/api' + original
    req.originalUrl = '/api' + (req.originalUrl || original)
  }
  return app(req, res, next)
}