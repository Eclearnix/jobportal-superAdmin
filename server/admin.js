import { User } from './models/index.js'

export const DEFAULT_PRIMARY_ADMIN_EMAIL = 'deepakrg23it@srishakthi.ac.in'

export function getConfiguredPrimaryAdminEmail() {
  return process.env.PRIMARY_ADMIN_EMAIL?.trim().toLowerCase() || DEFAULT_PRIMARY_ADMIN_EMAIL
}

export async function getPrimaryAdminId() {
  let primaryAdmin = await User.findOne({ role: 'super_admin', isPrimaryAdmin: true }).select('_id').lean()
  if (primaryAdmin) return primaryAdmin._id

  const configuredEmail = getConfiguredPrimaryAdminEmail()
  const configuredAdmin = await User.findOne({ email: configuredEmail, role: 'super_admin' }).select('_id').lean()
  if (!configuredAdmin) return null

  try {
    await User.updateOne(
      { _id: configuredAdmin._id, role: 'super_admin', isPrimaryAdmin: { $ne: true } },
      { $set: { isPrimaryAdmin: true } },
    )
  } catch (error) {
    if (error?.code !== 11000) throw error
    primaryAdmin = await User.findOne({ role: 'super_admin', isPrimaryAdmin: true }).select('_id').lean()
    if (!primaryAdmin) throw error
    return primaryAdmin._id
  }

  primaryAdmin = await User.findOne({ role: 'super_admin', isPrimaryAdmin: true }).select('_id').lean()
  return primaryAdmin?._id || null
}
