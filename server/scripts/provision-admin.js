import 'dotenv/config'
import mongoose from 'mongoose'
import { User } from '../models/index.js'
import { getConfiguredPrimaryAdminEmail } from '../admin.js'

const email = process.argv[2]?.trim().toLowerCase()
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.')
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error('Usage: npm run admin:provision -- admin@example.com')
}
const primaryAdminEmail = getConfiguredPrimaryAdminEmail()
if (email !== primaryAdminEmail) {
  throw new Error(`The email must match the configured initial primary administrator (${primaryAdminEmail}).`)
}

await mongoose.connect(process.env.MONGODB_URI)
try {
  const existingPrimary = await User.findOne({ role: 'super_admin', isPrimaryAdmin: true }).select('email').lean()
  if (existingPrimary && existingPrimary.email.toLowerCase() !== email) {
    throw new Error(`The primary administrator is already assigned to ${existingPrimary.email}.`)
  }
  const existing = await User.findOne({ email })
  if (existing && existing.role !== 'super_admin') {
    throw new Error('This email is already assigned to a non-admin account. Use a dedicated administrator email.')
  }
  const admin = existing || await User.create({
    email,
    name: email.split('@')[0],
    role: 'super_admin',
    status: 'active',
    isPrimaryAdmin: !existingPrimary,
  })
  if (!existingPrimary && !admin.isPrimaryAdmin) {
    admin.isPrimaryAdmin = true
    await admin.save()
  }
  console.info(`Super Admin account provisioned for ${admin.email}${admin.isPrimaryAdmin ? ' as the primary administrator' : ''}. Sign in through the standalone Super Admin frontend with its verified Google account.`)
} finally {
  await mongoose.disconnect()
}
