import 'dotenv/config'
import mongoose from 'mongoose'
import { User } from '../models/index.js'

const email = process.argv[2]?.trim().toLowerCase()
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.')
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error('Usage: npm run admin:provision -- admin@example.com')
}
const primaryAdminEmail = process.env.PRIMARY_ADMIN_EMAIL?.trim().toLowerCase()
if (primaryAdminEmail && email !== primaryAdminEmail) {
  throw new Error('The email must match PRIMARY_ADMIN_EMAIL when provisioning the primary administrator.')
}

await mongoose.connect(process.env.MONGODB_URI)
try {
  const existing = await User.findOne({ email })
  if (existing && existing.role !== 'super_admin') {
    throw new Error('This email is already assigned to a non-admin account. Use a dedicated administrator email.')
  }
  const admin = existing || await User.create({
    email,
    name: email.split('@')[0],
    role: 'super_admin',
    status: 'active',
  })
  console.info(`Super Admin account provisioned for ${admin.email}. Sign in through the standalone Super Admin frontend with its verified Google account.`)
} finally {
  await mongoose.disconnect()
}
