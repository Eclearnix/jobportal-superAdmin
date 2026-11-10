import jwt from 'jsonwebtoken'
import { Company, User } from '../models/index.js'

export async function requireUser(req, res, next) {
  const token = req.cookies?.ecl_session
  if (!token) return res.status(401).json({ error: 'Authentication required.' })

  let payload
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { issuer: 'eclearnix-jobs' })
  } catch {
    return res.status(401).json({ error: 'Session is invalid or expired.' })
  }
  const user = await User.findById(payload.sub).select('_id email name picture role status company phone location')
  if (!user || user.status !== 'active') return res.status(401).json({ error: 'Session is no longer active.' })
  req.user = user
  return next()
}

export function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'You do not have permission to perform this action.' })
    return next()
  }
}

export function requirePrimaryAdmin(req, res, next) {
  const primaryAdminEmail = process.env.PRIMARY_ADMIN_EMAIL?.trim().toLowerCase()
  if (!primaryAdminEmail) return res.status(503).json({ error: 'Primary administrator access is not configured.' })
  if (req.user?.email?.toLowerCase() !== primaryAdminEmail) {
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
