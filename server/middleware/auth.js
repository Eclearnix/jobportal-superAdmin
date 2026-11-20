import jwt from 'jsonwebtoken'
import { Company, User } from '../models/index.js'
import { getPrimaryAdminId } from '../admin.js'

export async function requireUser(req, res, next) {
  const token = req.cookies?.ecl_session
  if (!token) return res.status(401).json({ error: 'Authentication required.' })

  let payload
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { issuer: 'eclearnix-jobs' })
  } catch {
    return res.status(401).json({ error: 'Session is invalid or expired.' })
  }
  const user = await User.findById(payload.sub).select('_id email name picture role status company phone location lastActivityAt isPrimaryAdmin')
  if (!user || user.status !== 'active') return res.status(401).json({ error: 'Session is no longer active.' })
  const now = new Date()
  const refreshActivityAfter = new Date(now.getTime() - 15 * 60 * 1000)
  if (!user.lastActivityAt || user.lastActivityAt < refreshActivityAfter) {
    await User.updateOne(
      { _id: user._id, $or: [{ lastActivityAt: { $lt: refreshActivityAfter } }, { lastActivityAt: { $exists: false } }] },
      { $set: { lastActivityAt: now } },
      { timestamps: false },
    )
  }
  req.user = user
  return next()
}

export function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'You do not have permission to perform this action.' })
    return next()
  }
}

export async function requirePrimaryAdmin(req, res, next) {
  const primaryAdminId = await getPrimaryAdminId()
  if (!primaryAdminId) {
    return res.status(503).json({ error: 'Primary administrator access is not configured.' })
  }
  if (String(req.user?._id) !== String(primaryAdminId)) {
    return res.status(403).json({ error: 'Only the primary administrator can manage administrator invitations.' })
  }
  return next()
}

export async function requireCompanyMember(req, res, next) {
  const company = req.user?.company && await Company.findOne({
    _id: req.user.company,
    members: req.user._id,
    status: { $ne: 'removed' },
  }).select('_id name status')

  if (!company) return res.status(403).json({ error: 'Your account is not an active member of an organization.' })
  req.company = company
  return next()
}

export async function requireVerifiedCompany(req, res, next) {
  const company = req.user.company && await Company.findOne({
    _id: req.user.company,
    status: 'verified',
    members: req.user._id,
  }).select('_id name status')

  if (!company) return res.status(403).json({ error: 'A verified organization is required to publish jobs.' })
  req.company = company
  return next()
}
