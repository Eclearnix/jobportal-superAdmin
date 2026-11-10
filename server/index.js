import 'dotenv/config'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import multer from 'multer'
import mongoose from 'mongoose'
import { fileURLToPath } from 'node:url'
import apiRoutes from './routes.js'

const requiredEnvironment = ['MONGODB_URI', 'JWT_SECRET']
const missingEnvironment = requiredEnvironment.filter((key) => !process.env[key])
if (missingEnvironment.length) throw new Error(`Missing required server environment: ${missingEnvironment.join(', ')}`)
if (process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters long.')
if (process.env.PRIMARY_ADMIN_EMAIL && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.PRIMARY_ADMIN_EMAIL.trim())) {
  throw new Error('PRIMARY_ADMIN_EMAIL must be a valid email address.')
}

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 })

const app = express()
const allowedOrigins = new Set([process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173', process.env.ADMIN_CLIENT_ORIGIN]
  .filter(Boolean)
  .join(',')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean))

app.disable('x-powered-by')
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false)
app.use(helmet())
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true)
    const error = new Error('Origin is not allowed by CORS.')
    error.status = 403
    return callback(error)
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
}))
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: false, limit: '1mb' }))
app.use(cookieParser())
app.use('/api/auth/google', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false }))
app.use('/api', apiRoutes)

app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }))
app.use((error, _req, res, _next) => {
  if (res.headersSent) return _next(error)
  if (error instanceof mongoose.Error.ValidationError) return res.status(400).json({ error: error.message })
  if (error instanceof mongoose.Error.CastError) return res.status(400).json({ error: 'Invalid resource identifier.' })
  if (error.code === 11000) return res.status(409).json({ error: 'A record with that value already exists.' })
  if (error instanceof multer.MulterError) return res.status(400).json({ error: error.message })
  const status = Number.isInteger(error.status) ? error.status : 500
  if (status >= 500) console.error(error)
  return res.status(status).json({ error: status >= 500 ? 'The request could not be completed.' : error.message })
})

const port = Number(process.env.PORT) || 4000
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const server = app.listen(port, () => console.info(`Eclearnix Jobs API listening on port ${port}`))

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(async () => {
      await mongoose.disconnect()
      process.exit(0)
    }))
  }
}

export { app }
