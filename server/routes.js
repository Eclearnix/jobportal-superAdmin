import { Router } from 'express'
import { OAuth2Client } from 'google-auth-library'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import mongoose from 'mongoose'
import { z } from 'zod'
import {
  AdminInvite,
  AdminLog,
  Application,
  CompanyInvite,
  Company,
  Interview,
  Job,
  Notification,
  Report,
  SavedJob,
  Setting,
  User,
} from './models/index.js'
import { requireCompanyMember, requirePrimaryAdmin, requireRoles, requireUser } from './middleware/auth.js'
import { savePrivateFile, streamPrivateFile } from './storage.js'
import { sendInterviewEmail } from './email.js'

const router = Router()
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, callback) {
    if (!['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.mimetype)) {
      const error = new Error('Only PDF and DOCX files are allowed.')
      error.status = 400
      return callback(error)
    }
    return callback(null, true)
  },
})

router.get('/recruiter/team', requireUser, requireRoles('recruiter'), requireCompanyMember, async (req, res) => {
  const [members, invites] = await Promise.all([
    User.find({ _id: { $in: req.company.members }, company: req.company._id }).select('name email role status createdAt').sort({ createdAt: 1 }).lean(),
    CompanyInvite.find({ company: req.company._id, expiresAt: { $gt: new Date() } }).select('email expiresAt createdAt').lean(),
  ])
  res.json({ members, invites })
})

router.post('/recruiter/team-invitations', requireUser, requireRoles('recruiter'), requireCompanyMember, async (req, res) => {
  const { email } = validate(z.object({ email: z.string().email().max(240) }).strict(), req.body)
  const normalizedEmail = email.toLowerCase()
  const existingUser = await User.findOne({ email: normalizedEmail })
  if (existingUser && (existingUser.role !== 'recruiter' || (existingUser.company && String(existingUser.company) !== String(req.company._id)))) {
    return res.status(409).json({ error: 'This email is already assigned to another account or organization.' })
  }
  const invite = await CompanyInvite.findOneAndUpdate(
    { email: normalizedEmail, company: req.company._id },
    { email: normalizedEmail, company: req.company._id, invitedBy: req.user._id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    { upsert: true, new: true, runValidators: true },
  )
  res.status(201).json({ invite })
})

router.delete('/recruiter/team-invitations/:inviteId', requireUser, requireRoles('recruiter'), requireCompanyMember, async (req, res) => {
  const id = validate(objectId, req.params.inviteId)
  const result = await CompanyInvite.deleteOne({ _id: id, company: req.company._id })
  if (!result.deletedCount) return res.status(404).json({ error: 'Invitation not found.' })
  res.status(204).end()
})

router.patch('/recruiter/company', requireUser, requireRoles('recruiter'), requireCompanyMember, async (req, res) => {
  const input = validate(z.object({
    name: z.string().trim().min(2).max(160).optional(),
    website: z.string().trim().url().max(240).or(z.literal('')).optional(),
    industry: z.string().trim().max(120).optional(),
    size: z.string().trim().max(60).optional(),
    location: z.string().trim().max(160).optional(),
    description: z.string().trim().max(3000).optional(),
    contactEmail: z.string().email().max(240).optional(),
  }).strict(), req.body)
  const updates = { ...input }
  if (updates.name) updates.normalizedName = updates.name.toLowerCase()
  const company = await Company.findByIdAndUpdate(req.company._id, { $set: updates }, { new: true, runValidators: true })
  res.json({ company })
})

router.get('/recruiter/notifications', requireUser, requireRoles('recruiter'), requireCompanyMember, async (req, res) => {
  const items = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50).lean()
  res.json({ items })
})

router.patch('/recruiter/notifications/:notificationId/read', requireUser, requireRoles('recruiter'), requireCompanyMember, async (req, res) => {
  const id = validate(objectId, req.params.notificationId)
  const notification = await Notification.findOneAndUpdate({ _id: id, user: req.user._id }, { readAt: new Date() }, { new: true })
  if (!notification) return res.status(404).json({ error: 'Notification not found.' })
  res.json({ notification })
})

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'A valid resource ID is required.')
const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

function validate(schema, input) {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    const error = new Error(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '))
    error.status = 400
    throw error
  }
  return parsed.data
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function validateFileSignature(file) {
  if (!file) return
  const isPdf = file.mimetype === 'application/pdf' && file.buffer.subarray(0, 5).toString() === '%PDF-'
  const isDocx = file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    && file.buffer[0] === 0x50 && file.buffer[1] === 0x4b
  if (!isPdf && !isDocx) {
    const error = new Error('The uploaded file content does not match an allowed resume format.')
    error.status = 400
    throw error
  }
}

function issueSession(user, res) {
  const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: '8h', issuer: 'eclearnix-jobs' })
  res.cookie('ecl_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  })
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    picture: user.picture,
    role: user.role,
    company: user.company,
    phone: user.phone,
    location: user.location,
  }
}

async function authenticateGoogle(req, res, intendedRole) {
  const { credential } = validate(z.object({ credential: z.string().min(20).max(5000) }), req.body)
  if (!process.env.GOOGLE_CLIENT_ID) {
    const error = new Error('Google sign-in is not configured on this server.')
    error.status = 503
    throw error
  }
  let ticket
  try {
    ticket = await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID })
  } catch {
    const error = new Error('Google could not verify this sign-in. Please try again.')
    error.status = 401
    throw error
  }
  const payload = ticket.getPayload()
  if (!payload?.email || !payload.email_verified || !payload.sub || !payload.name) {
    const error = new Error('Google did not return a verified account.')
    error.status = 401
    throw error
  }

  const email = payload.email.toLowerCase()
  let user = await User.findOne({ $or: [{ email }, { googleId: payload.sub }] })
  const companyInvite = intendedRole === 'recruiter'
    ? await CompanyInvite.findOne({ email, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 })
    : null
  if (intendedRole === 'super_admin') {
    if (!user) {
      const invite = await AdminInvite.findOneAndDelete({ email, expiresAt: { $gt: new Date() } })
      if (invite) {
        user = await User.create({ email, googleId: payload.sub, name: payload.name, picture: payload.picture || '', role: 'super_admin' })
      }
    }
    if (!user || user.role !== 'super_admin') {
      const error = new Error('This Google account is not authorized for Super Admin access.')
      error.status = 403
      throw error
    }
  } else if (user && user.role !== intendedRole) {
    const error = new Error('This account belongs to a different workspace. Sign in using its assigned role.')
    error.status = 403
    throw error
  } else if (!user) {
    user = await User.create({
      email,
      googleId: payload.sub,
      name: payload.name,
      picture: payload.picture || '',
      role: intendedRole,
    })
  } else if (user.googleId && user.googleId !== payload.sub) {
    const error = new Error('This email is already linked to a different Google account.')
    error.status = 409
    throw error
  }

  user.googleId = payload.sub
  user.name = payload.name
  user.picture = payload.picture || user.picture
  user.lastLoginAt = new Date()
  if (user.status === 'suspended') {
    const error = new Error('This account is suspended. Contact platform support.')
    error.status = 403
    throw error
  }
  if (companyInvite) {
    if (user.company && String(user.company) !== String(companyInvite.company)) {
      const error = new Error('This account already belongs to a different organization.')
      error.status = 409
      throw error
    }
    const company = await Company.findOne({ _id: companyInvite.company, status: { $nin: ['removed', 'suspended'] } })
    if (!company) {
      const error = new Error('The organization invitation is no longer valid.')
      error.status = 410
      throw error
    }
    user.company = company._id
    company.members.addToSet(user._id)
    await company.save()
    await CompanyInvite.deleteOne({ _id: companyInvite._id })
  }
  await user.save()
  issueSession(user, res)
  return user
}

async function adminTransaction(req, { action, targetType, target, details }, change) {
  const session = await mongoose.startSession()
  try {
    let result
    await session.withTransaction(async () => {
      result = await change(session)
      await AdminLog.create([{
        actor: req.user._id,
        action,
        targetType,
        target,
        details,
        ipAddress: req.ip,
      }], { session })
    })
    return result
  } finally {
    await session.endSession()
  }
}

function toPage(query) {
  const { page, limit } = validate(pagination, query)
  return { page, limit, skip: (page - 1) * limit }
}

router.get('/health', (_req, res) => res.json({ status: 'ok' }))

router.post('/auth/google/candidate', async (req, res) => {
  const user = await authenticateGoogle(req, res, 'candidate')
  res.json({ user: publicUser(user), onboardingRequired: !user.location || !user.phone })
})

router.post('/auth/google/organization', async (req, res) => {
  const user = await authenticateGoogle(req, res, 'recruiter')
  res.json({ user: publicUser(user), onboardingRequired: !user.company })
})

router.post('/auth/google/super-admin', async (req, res) => {
  const user = await authenticateGoogle(req, res, 'super_admin')
  res.json({ user: publicUser(user), onboardingRequired: false })
})

router.get('/auth/me', requireUser, async (req, res) => {
  res.json({ user: publicUser(req.user) })
})

router.post('/auth/logout', (_req, res) => {
  res.clearCookie('ecl_session', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
  })
  res.status(204).end()
})

router.get('/jobs', async (req, res) => {
  const { page, limit, skip } = toPage(req.query)
  const query = { status: 'published' }
  const text = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : ''
  if (text) query.$text = { $search: text }
  if (typeof req.query.location === 'string' && req.query.location.trim()) query.location = new RegExp(escapeRegex(req.query.location.trim().slice(0, 80)), 'i')
  if (['remote', 'hybrid', 'on-site'].includes(req.query.workMode)) query.workMode = req.query.workMode
  if (['full-time', 'part-time', 'internship', 'contract'].includes(req.query.employmentType)) query.employmentType = req.query.employmentType
  if (typeof req.query.industry === 'string' && req.query.industry.trim()) query.industry = req.query.industry.trim().slice(0, 120)
  if (req.query.salaryMin && Number.isFinite(Number(req.query.salaryMin))) query.salaryMax = { $gte: Number(req.query.salaryMin) }
  if (req.query.experienceLevel) query.experienceLevel = String(req.query.experienceLevel).slice(0, 80)
  const sort = req.query.sort === 'relevance' && text ? { score: { $meta: 'textScore' }, publishedAt: -1 } : { publishedAt: -1 }
  const [jobs, total] = await Promise.all([
    Job.find(query).sort(sort).skip(skip).limit(limit).populate('company', 'name logoKey location industry status').lean(),
    Job.countDocuments(query),
  ])
  res.json({ items: jobs, page, limit, total, pages: Math.ceil(total / limit) })
})

router.get('/jobs/:jobId', async (req, res) => {
  const id = validate(objectId, req.params.jobId)
  const job = await Job.findOne({ _id: id, status: 'published' }).populate('company', 'name website industry size location description status')
  if (!job) return res.status(404).json({ error: 'Job not found.' })
  res.json({ job })
})

router.get('/dashboard/candidate', requireUser, requireRoles('candidate'), async (req, res) => {
  const [applicationsSent, interviews, profile, recentApplications, recommendedJobs, unreadNotifications] = await Promise.all([
    Application.countDocuments({ candidate: req.user._id, status: { $ne: 'withdrawn' } }),
    Interview.countDocuments({ candidate: req.user._id, status: 'scheduled', scheduledAt: { $gte: new Date() } }),
    User.findById(req.user._id).select('name title location skills education experience resumeKey phone preferredLocations openToOpportunities profileViews'),
    Application.find({ candidate: req.user._id }).sort({ createdAt: -1 }).limit(5).populate({ path: 'job', select: 'title location employmentType' }).populate({ path: 'company', select: 'name' }).lean(),
    Job.find({ status: 'published', ...(req.user.skills?.length ? { skills: { $in: req.user.skills } } : {}) }).sort({ publishedAt: -1 }).limit(4).populate('company', 'name location').lean(),
    Notification.countDocuments({ user: req.user._id, readAt: null }),
  ])
  const profileFields = [profile?.phone, profile?.location, profile?.skills?.length, profile?.education?.length, profile?.experience?.length, profile?.resumeKey]
  const profileStrength = Math.round(profileFields.filter(Boolean).length / profileFields.length * 100)
  res.json({
    summary: { applicationsSent, profileViews: profile.profileViews, interviews, unreadNotifications, profileStrength },
    recentApplications,
    recommendedJobs,
    profile: profile.toObject(),
  })
})

router.patch('/candidate/profile', requireUser, requireRoles('candidate'), async (req, res) => {
  const input = validate(z.object({
    name: z.string().trim().min(1).max(120).optional(),
    title: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(40).optional(),
    location: z.string().trim().max(120).optional(),
    skills: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
    preferredLocations: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
    openToOpportunities: z.boolean().optional(),
    education: z.array(z.object({ school: z.string().max(160), degree: z.string().max(120), graduationYear: z.number().int().min(1950).max(2100).optional() })).max(20).optional(),
    experience: z.array(z.object({ title: z.string().max(120), company: z.string().max(160), summary: z.string().max(2000).optional() })).max(30).optional(),
  }).strict(), req.body)
  const user = await User.findByIdAndUpdate(req.user._id, { $set: input }, { new: true, runValidators: true }).select('-googleId')
  res.json({ user })
})

router.post('/candidate/resume', requireUser, requireRoles('candidate'), upload.single('resume'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a PDF or DOCX resume to upload.' })
  validateFileSignature(req.file)
  const key = await savePrivateFile(req.file, `resumes/${req.user._id}`)
  const user = await User.findByIdAndUpdate(req.user._id, { resumeKey: key }, { new: true }).select('resumeKey')
  res.status(201).json({ resume: user.resumeKey })
})

router.get('/candidate/resume', requireUser, requireRoles('candidate'), async (req, res) => {
  const user = await User.findById(req.user._id).select('resumeKey')
  if (!user.resumeKey) return res.status(404).json({ error: 'No resume has been uploaded.' })
  res.json({ url: '/api/candidate/resume/file' })
})

router.get('/candidate/resume/file', requireUser, requireRoles('candidate'), async (req, res) => {
  const user = await User.findById(req.user._id).select('resumeKey')
  if (!user.resumeKey) return res.status(404).json({ error: 'No resume has been uploaded.' })
  await streamPrivateFile(user.resumeKey, res)
})

router.get('/candidate/applications', requireUser, requireRoles('candidate'), async (req, res) => {
  const { page, limit, skip } = toPage(req.query)
  const query = { candidate: req.user._id }
  const [items, total] = await Promise.all([
    Application.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('job', 'title location employmentType').populate('company', 'name').lean(),
    Application.countDocuments(query),
  ])
  res.json({ items, page, limit, total, pages: Math.ceil(total / limit) })
})

router.post('/jobs/:jobId/applications', requireUser, requireRoles('candidate'), upload.single('resume'), async (req, res) => {
  const jobId = validate(objectId, req.params.jobId)
  const job = await Job.findOne({ _id: jobId, status: 'published' }).populate('company', 'status')
  if (!job || job.company.status !== 'verified') return res.status(404).json({ error: 'This job is no longer available.' })
  const candidate = await User.findById(req.user._id).select('resumeKey')
  validateFileSignature(req.file)
  const resumeKey = req.file ? await savePrivateFile(req.file, `resumes/${candidate.id}`) : candidate.resumeKey
  if (!resumeKey) return res.status(400).json({ error: 'Upload a resume before applying.' })
  const input = validate(z.object({ coverLetter: z.string().trim().max(5000).optional().default('') }), req.body || {})
  try {
    const application = await Application.create({ candidate: candidate._id, job: job._id, company: job.company._id, resumeKey, coverLetter: input.coverLetter })
    await Notification.create({ user: candidate._id, type: 'application_submitted', title: 'Application submitted', message: `Your application for ${job.title} was submitted.`, relatedId: application._id })
    res.status(201).json({ application })
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'You have already applied for this job.' })
    throw error
  }
})

router.patch('/candidate/applications/:applicationId/withdraw', requireUser, requireRoles('candidate'), async (req, res) => {
  const id = validate(objectId, req.params.applicationId)
  const application = await Application.findOneAndUpdate(
    { _id: id, candidate: req.user._id, status: { $in: ['submitted', 'under_review', 'shortlisted'] } },
    { status: 'withdrawn', withdrawnAt: new Date() },
    { new: true, runValidators: true },
  )
  if (!application) return res.status(404).json({ error: 'Application cannot be found or withdrawn.' })
  res.json({ application })
})

router.post('/candidate/saved-jobs/:jobId', requireUser, requireRoles('candidate'), async (req, res) => {
  const jobId = validate(objectId, req.params.jobId)
  const job = await Job.findOne({ _id: jobId, status: 'published' }).select('_id')
  if (!job) return res.status(404).json({ error: 'Job not found.' })
  try {
    const saved = await SavedJob.create({ candidate: req.user._id, job: job._id })
    res.status(201).json({ saved })
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'Job is already saved.' })
    throw error
  }
})

router.delete('/candidate/saved-jobs/:jobId', requireUser, requireRoles('candidate'), async (req, res) => {
  const jobId = validate(objectId, req.params.jobId)
  const result = await SavedJob.deleteOne({ candidate: req.user._id, job: jobId })
  if (!result.deletedCount) return res.status(404).json({ error: 'Saved job not found.' })
  res.status(204).end()
})

router.get('/candidate/saved-jobs', requireUser, requireRoles('candidate'), async (req, res) => {
  const items = await SavedJob.find({ candidate: req.user._id }).sort({ createdAt: -1 }).populate({ path: 'job', match: { status: 'published' }, populate: { path: 'company', select: 'name location' } }).lean()
  res.json({ items: items.filter((item) => item.job) })
})

router.get('/candidate/notifications', requireUser, requireRoles('candidate'), async (req, res) => {
  const items = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50).lean()
  res.json({ items })
})

router.patch('/candidate/notifications/:notificationId/read', requireUser, requireRoles('candidate'), async (req, res) => {
  const id = validate(objectId, req.params.notificationId)
  const notification = await Notification.findOneAndUpdate({ _id: id, user: req.user._id }, { readAt: new Date() }, { new: true })
  if (!notification) return res.status(404).json({ error: 'Notification not found.' })
  res.json({ notification })
})

router.get('/candidate/interviews', requireUser, requireRoles('candidate'), async (req, res) => {
  const items = await Interview.find({ candidate: req.user._id, status: 'scheduled', scheduledAt: { $gte: new Date() } })
    .sort({ scheduledAt: 1 }).populate({ path: 'application', populate: { path: 'job', select: 'title' } }).populate('company', 'name').lean()
  res.json({ items })
})

router.get('/recruiter/candidates', requireUser, requireRoles('recruiter'), requireCompanyMember, async (req, res) => {
  const applications = await Application.find({ company: req.company._id, status: { $ne: 'withdrawn' } })
    .sort({ createdAt: -1 })
    .limit(500)
    .populate('candidate', 'name email picture title location skills')
    .populate('job', 'title')
    .lean()

  const candidates = new Map()
  for (const application of applications) {
    if (!application.candidate) continue
    const candidateId = String(application.candidate._id)
    const existing = candidates.get(candidateId)
    const applicationSummary = {
      id: application._id,
      jobTitle: application.job?.title || 'Untitled job',
      status: application.status,
      createdAt: application.createdAt,
    }
    if (existing) {
      existing.applications.push(applicationSummary)
      continue
    }
    candidates.set(candidateId, {
      candidate: application.candidate,
      applications: [applicationSummary],
    })
  }

  res.json({ items: [...candidates.values()] })
})

router.get('/recruiter/discoverable-candidates', requireUser, requireRoles('recruiter'), requireCompanyMember, async (req, res) => {
  const query = { role: 'candidate', status: 'active', openToOpportunities: true }
  if (typeof req.query.q === 'string' && req.query.q.trim()) {
    const search = escapeRegex(req.query.q.trim().slice(0, 80))
    query.$or = [
      { name: new RegExp(search, 'i') },
      { title: new RegExp(search, 'i') },
      { location: new RegExp(search, 'i') },
      { skills: new RegExp(search, 'i') },
    ]
  }
  const items = await User.find(query)
    .select('name email picture title location skills preferredLocations openToOpportunities profileViews')
    .sort({ lastLoginAt: -1, updatedAt: -1 })
    .limit(100)
    .lean()
  res.json({ items })
})

router.get('/recruiter/candidates/:candidateId', requireUser, requireRoles('recruiter'), requireCompanyMember, async (req, res) => {
  const candidateId = validate(objectId, req.params.candidateId)
  const [hasApplication, isDiscoverable] = await Promise.all([
    Application.exists({ candidate: candidateId, company: req.company._id }),
    User.exists({ _id: candidateId, role: 'candidate', status: 'active', openToOpportunities: true }),
  ])
  if (!hasApplication && !isDiscoverable) return res.status(404).json({ error: 'Candidate is not available to your organization.' })
  const candidate = await User.findOneAndUpdate({ _id: candidateId, role: 'candidate', status: 'active' }, { $inc: { profileViews: 1 } }, { new: true })
    .select('name email picture title location skills education experience')
  if (!candidate) return res.status(404).json({ error: 'Candidate not found.' })
  res.json({ candidate })
})

router.get('/recruiter/applications/:applicationId/resume', requireUser, requireRoles('recruiter'), requireCompanyMember, async (req, res) => {
  const id = validate(objectId, req.params.applicationId)
  const application = await Application.findOne({ _id: id, company: req.company._id }).select('resumeKey')
  if (!application) return res.status(404).json({ error: 'Application not found.' })
  res.json({ url: `/api/recruiter/applications/${id}/resume/file` })
})

router.get('/recruiter/applications/:applicationId/resume/file', requireUser, requireRoles('recruiter'), requireCompanyMember, async (req, res) => {
  const id = validate(objectId, req.params.applicationId)
  const application = await Application.findOne({ _id: id, company: req.company._id }).select('resumeKey')
  if (!application) return res.status(404).json({ error: 'Application not found.' })
  await streamPrivateFile(application.resumeKey, res)
})

router.get('/recruiter/interviews', requireUser, requireRoles('recruiter'), requireCompanyMember, async (req, res) => {
  const items = await Interview.find({ company: req.company._id })
    .sort({ scheduledAt: 1 }).limit(100).populate('candidate', 'name email').populate({ path: 'application', populate: { path: 'job', select: 'title' } }).lean()
  res.json({ items })
})

router.post('/reports', requireUser, async (req, res) => {
  const input = validate(z.object({
    targetType: z.enum(['company', 'job', 'user']),
    target: objectId,
    reason: z.string().trim().min(3).max(120),
    details: z.string().trim().max(3000).optional().default(''),
  }).strict(), req.body)
  const report = await Report.create({ ...input, reporter: req.user._id, target: input.target })
  res.status(201).json({ report })
})

router.post('/organizations', requireUser, requireRoles('recruiter'), async (req, res) => {
  if (req.user.company) return res.status(409).json({ error: 'This account already belongs to an organization.' })
  const input = validate(z.object({
    name: z.string().trim().min(2).max(160),
    website: z.string().trim().url().max(240).or(z.literal('')).optional().default(''),
    industry: z.string().trim().max(120).optional().default(''),
    size: z.string().trim().max(60).optional().default(''),
    location: z.string().trim().max(160).optional().default(''),
    description: z.string().trim().max(3000).optional().default(''),
    contactEmail: z.string().email().max(240),
  }).strict(), req.body)
  const company = await Company.create({ ...input, normalizedName: input.name.toLowerCase(), owner: req.user._id, members: [req.user._id] })
  await User.findByIdAndUpdate(req.user._id, { company: company._id })
  res.status(201).json({ company })
})

router.get('/dashboard/recruiter', requireUser, requireRoles('recruiter'), requireCompanyMember, async (req, res) => {
  const company = await Company.findById(req.company._id).lean()
  const [totalJobs, activeJobs, totalApplicants, shortlisted, interviews, recentApplications] = await Promise.all([
    Job.countDocuments({ company: company._id }),
    Job.countDocuments({ company: company._id, status: 'published' }),
    Application.countDocuments({ company: company._id }),
    Application.countDocuments({ company: company._id, status: 'shortlisted' }),
    Interview.countDocuments({ company: company._id, status: 'scheduled', scheduledAt: { $gte: new Date() } }),
    Application.find({ company: company._id }).sort({ createdAt: -1 }).limit(8).populate('candidate', 'name email picture').populate('job', 'title').lean(),
  ])
  res.json({ company, summary: { totalJobs, activeJobs, totalApplicants, shortlisted, interviews }, recentApplications })
})

router.get('/recruiter/jobs', requireUser, requireRoles('recruiter'), requireCompanyMember, async (req, res) => {
  if (!req.user.company) return res.status(409).json({ error: 'Complete organization registration first.' })
  const { page, limit, skip } = toPage(req.query)
  const query = { company: req.user.company }
  const [items, total] = await Promise.all([
    Job.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Job.countDocuments(query),
  ])
  res.json({ items, page, limit, total, pages: Math.ceil(total / limit) })
})

const jobInput = z.object({
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().min(30).max(15000),
  responsibilities: z.array(z.string().trim().max(500)).max(30).optional().default([]),
  qualifications: z.array(z.string().trim().max(500)).max(30).optional().default([]),
  skills: z.array(z.string().trim().max(80)).max(50).optional().default([]),
  location: z.string().trim().min(2).max(160),
  workMode: z.enum(['remote', 'hybrid', 'on-site']),
  employmentType: z.enum(['full-time', 'part-time', 'internship', 'contract']),
  experienceLevel: z.string().trim().max(80).optional().default(''),
  industry: z.string().trim().max(120).optional().default(''),
  salaryMin: z.number().min(0).optional().nullable(),
  salaryMax: z.number().min(0).optional().nullable(),
  currency: z.string().trim().length(3).optional().default('USD'),
  applicationDeadline: z.string().datetime().optional().nullable(),
  status: z.enum(['draft', 'pending_review']).optional().default('draft'),
}).strict()

router.post('/recruiter/jobs', requireUser, requireRoles('recruiter'), requireCompanyMember, async (req, res) => {
  const input = validate(jobInput, req.body)
  const status = input.status === 'pending_review' ? 'pending_review' : 'draft'
  const job = await Job.create({ ...input, applicationDeadline: input.applicationDeadline || null, company: req.user.company, createdBy: req.user._id, status })
  res.status(201).json({ job })
})

router.patch('/recruiter/jobs/:jobId', requireUser, requireRoles('recruiter'), requireCompanyMember, async (req, res) => {
  const id = validate(objectId, req.params.jobId)
  const input = validate(jobInput.partial(), req.body)
  const job = await Job.findOneAndUpdate(
    { _id: id, company: req.user.company, status: { $nin: ['closed', 'rejected'] } },
    { $set: input },
    { new: true, runValidators: true },
  )
  if (!job) return res.status(404).json({ error: 'Job not found or cannot be edited.' })
  res.json({ job })
})

router.patch('/recruiter/jobs/:jobId/status', requireUser, requireRoles('recruiter'), requireCompanyMember, async (req, res) => {
  const id = validate(objectId, req.params.jobId)
  const { status } = validate(z.object({ status: z.enum(['published', 'paused', 'closed']) }), req.body)
  let updated
  if (status === 'published') {
    const company = await Company.findOne({ _id: req.company._id, status: 'verified', members: req.user._id })
    if (!company) return res.status(403).json({ error: 'Only verified organizations can publish jobs.' })
    updated = await Job.findOneAndUpdate({ _id: id, company: company._id, status: { $in: ['draft', 'pending_review', 'paused'] } }, { status, publishedAt: new Date() }, { new: true })
  } else {
    updated = await Job.findOneAndUpdate({ _id: id, company: req.user.company, status: { $ne: 'closed' } }, { status }, { new: true })
  }
  if (!updated) return res.status(404).json({ error: 'Job not found or status transition is not allowed.' })
  res.json({ job: updated })
})

router.get('/recruiter/applications', requireUser, requireRoles('recruiter'), requireCompanyMember, async (req, res) => {
  const { page, limit, skip } = toPage(req.query)
  const [items, total] = await Promise.all([
    Application.find({ company: req.user.company }).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('candidate', 'name email picture title location skills').populate('job', 'title').lean(),
    Application.countDocuments({ company: req.user.company }),
  ])
  res.json({ items, page, limit, total, pages: Math.ceil(total / limit) })
})

router.patch('/recruiter/applications/:applicationId/status', requireUser, requireRoles('recruiter'), requireCompanyMember, async (req, res) => {
  const id = validate(objectId, req.params.applicationId)
  const { status } = validate(z.object({ status: z.enum(['under_review', 'shortlisted', 'interview_scheduled', 'selected', 'rejected']) }), req.body)
  const application = await Application.findOneAndUpdate({ _id: id, company: req.user.company, status: { $ne: 'withdrawn' } }, { status }, { new: true })
  if (!application) return res.status(404).json({ error: 'Application not found.' })
  await Notification.create({ user: application.candidate, type: 'application_status', title: 'Application update', message: `Your application status changed to ${status.replaceAll('_', ' ')}.`, relatedId: application._id })
  res.json({ application })
})

router.post('/recruiter/applications/:applicationId/interviews', requireUser, requireRoles('recruiter'), requireCompanyMember, async (req, res) => {
  const id = validate(objectId, req.params.applicationId)
  const input = validate(z.object({
    scheduledAt: z.string().datetime(),
    durationMinutes: z.number().int().min(15).max(480).optional().default(30),
    meetingUrl: z.string().url().max(500).optional().or(z.literal('')).default(''),
    notes: z.string().max(2000).optional().default(''),
  }), req.body)
  const application = await Application.findOne({ _id: id, company: req.user.company, status: { $nin: ['withdrawn', 'rejected'] } })
    .populate('candidate', 'name email')
    .populate('job', 'title')
  if (!application) return res.status(404).json({ error: 'Application not found.' })
  const interview = await Interview.create({ ...input, scheduledAt: new Date(input.scheduledAt), candidate: application.candidate._id, company: application.company, application: application._id })
  application.status = 'interview_scheduled'
  await application.save()
  await Notification.create({ user: application.candidate._id, type: 'interview_scheduled', title: 'Interview scheduled', message: `An interview has been scheduled for ${new Date(input.scheduledAt).toLocaleString()}.`, relatedId: interview._id })
  let emailResult
  try {
    emailResult = await sendInterviewEmail({
      to: application.candidate.email,
      candidateName: application.candidate.name,
      companyName: req.company.name,
      jobTitle: application.job.title,
      scheduledAt: interview.scheduledAt,
      durationMinutes: interview.durationMinutes,
      meetingUrl: interview.meetingUrl,
      notes: interview.notes,
    })
  } catch (error) {
    console.error('Interview email delivery failed:', error)
    emailResult = { sent: false, error: 'The interview is scheduled and the in-app notification was created, but email delivery failed. Check the API server logs.' }
  }
  if (!emailResult.sent) console.error(`Interview email was not sent: ${emailResult.error}`)
  res.status(201).json({ interview, emailSent: emailResult.sent, emailError: emailResult.error || '' })
})

router.get('/dashboard/admin', requireUser, requireRoles('super_admin'), async (_req, res) => {
  const [totalCandidates, totalRecruiters, totalOrganizations, verifiedOrganizations, pendingVerifications, totalJobs, activeJobs, totalApplications] = await Promise.all([
    User.countDocuments({ role: 'candidate' }),
    User.countDocuments({ role: 'recruiter' }),
    Company.countDocuments({ status: { $ne: 'removed' } }),
    Company.countDocuments({ status: 'verified' }),
    Company.countDocuments({ status: 'pending' }),
    Job.countDocuments(),
    Job.countDocuments({ status: 'published' }),
    Application.countDocuments(),
  ])
  res.json({ summary: { totalCandidates, totalRecruiters, totalOrganizations, verifiedOrganizations, pendingVerifications, totalJobs, activeJobs, totalApplications } })
})

router.get('/admin/organizations', requireUser, requireRoles('super_admin'), async (req, res) => {
  const { page, limit, skip } = toPage(req.query)
  const query = { status: { $ne: 'removed' } }
  if (['pending', 'verified', 'rejected', 'suspended'].includes(req.query.status)) query.status = req.query.status
  if (typeof req.query.q === 'string' && req.query.q.trim()) query.$or = [
    { name: new RegExp(escapeRegex(req.query.q.trim().slice(0, 80)), 'i') },
    { contactEmail: new RegExp(escapeRegex(req.query.q.trim().slice(0, 80)), 'i') },
  ]
  const [items, total] = await Promise.all([
    Company.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('owner', 'name email').lean(),
    Company.countDocuments(query),
  ])
  res.json({ items, page, limit, total, pages: Math.ceil(total / limit) })
})

router.patch('/admin/organizations/:companyId/status', requireUser, requireRoles('super_admin'), async (req, res) => {
  const id = validate(objectId, req.params.companyId)
  const { status } = validate(z.object({ status: z.enum(['verified', 'rejected', 'suspended', 'pending']) }), req.body)
  const company = await adminTransaction(req, { action: `organization.${status}`, targetType: 'company', target: id, details: { status } }, async (session) => {
    const updated = await Company.findOneAndUpdate({ _id: id, status: { $ne: 'removed' } }, { status }, { new: true, session })
    if (!updated) {
      const error = new Error('Organization not found.')
      error.status = 404
      throw error
    }
    if (status === 'suspended' || status === 'rejected') await Job.updateMany({ company: id, status: 'published' }, { status: 'paused' }, { session })
    return updated
  })
  res.json({ company })
})

router.delete('/admin/organizations/:companyId', requireUser, requireRoles('super_admin'), async (req, res) => {
  const id = validate(objectId, req.params.companyId)
  const company = await adminTransaction(req, { action: 'organization.removed', targetType: 'company', target: id }, async (session) => {
    const removed = await Company.findOneAndUpdate({ _id: id, status: { $ne: 'removed' } }, { status: 'removed' }, { new: true, session })
    if (!removed) {
      const error = new Error('Organization not found or already removed.')
      error.status = 404
      throw error
    }
    await Job.updateMany({ company: id, status: { $nin: ['closed', 'rejected'] } }, { status: 'closed' }, { session })
    await User.updateMany({ company: id, role: 'recruiter' }, { status: 'suspended' }, { session })
    return removed
  })
  res.json({ company })
})

router.get('/admin/users', requireUser, requireRoles('super_admin'), async (req, res) => {
  const { page, limit, skip } = toPage(req.query)
  const query = {}
  if (['candidate', 'recruiter', 'super_admin'].includes(req.query.role)) query.role = req.query.role
  if (['active', 'pending', 'suspended'].includes(req.query.status)) query.status = req.query.status
  const [items, total] = await Promise.all([
    User.find(query).select('name email role status company createdAt').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(query),
  ])
  res.json({ items, page, limit, total, pages: Math.ceil(total / limit) })
})

router.patch('/admin/users/:userId/status', requireUser, requireRoles('super_admin'), async (req, res) => {
  const id = validate(objectId, req.params.userId)
  const { status } = validate(z.object({ status: z.enum(['active', 'suspended']) }), req.body)
  const user = await adminTransaction(req, { action: `user.${status}`, targetType: 'user', target: id, details: { status } }, async (session) => {
    if (String(id) === String(req.user._id) && status === 'suspended') {
      const error = new Error('You cannot suspend your own Super Admin account.')
      error.status = 400
      throw error
    }
    const updated = await User.findOneAndUpdate({ _id: id, role: { $ne: 'super_admin' } }, { status }, { new: true, session }).select('name email role status')
    if (!updated) {
      const error = new Error('User not found or administrator accounts cannot be changed here.')
      error.status = 404
      throw error
    }
    return updated
  })
  res.json({ user })
})

router.get('/admin/jobs', requireUser, requireRoles('super_admin'), async (req, res) => {
  const { page, limit, skip } = toPage(req.query)
  const query = {}
  if (['draft', 'pending_review', 'published', 'paused', 'closed', 'rejected'].includes(req.query.status)) query.status = req.query.status
  const [items, total] = await Promise.all([
    Job.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('company', 'name status').lean(),
    Job.countDocuments(query),
  ])
  res.json({ items, page, limit, total, pages: Math.ceil(total / limit) })
})

router.patch('/admin/jobs/:jobId/status', requireUser, requireRoles('super_admin'), async (req, res) => {
  const id = validate(objectId, req.params.jobId)
  const { status } = validate(z.object({ status: z.enum(['published', 'paused', 'closed', 'rejected']) }), req.body)
  const job = await adminTransaction(req, { action: `job.${status}`, targetType: 'job', target: id, details: { status } }, async (session) => {
    const currentJob = await Job.findById(id).populate('company', 'status').session(session)
    if (!currentJob) {
      const error = new Error('Job not found.')
      error.status = 404
      throw error
    }
    if (status === 'published' && currentJob.company?.status !== 'verified') {
      const error = new Error('Verify the organization before publishing its jobs.')
      error.status = 409
      throw error
    }
    const updated = await Job.findByIdAndUpdate(id, { status, ...(status === 'published' ? { publishedAt: new Date() } : {}) }, { new: true, session })
    return updated
  })
  res.json({ job })
})

router.get('/admin/reports', requireUser, requireRoles('super_admin'), async (req, res) => {
  const { page, limit, skip } = toPage(req.query)
  const [items, total] = await Promise.all([
    Report.find().sort({ createdAt: -1 }).skip(skip).limit(limit).populate('reporter', 'name email').lean(),
    Report.countDocuments(),
  ])
  res.json({ items, page, limit, total, pages: Math.ceil(total / limit) })
})

router.patch('/admin/reports/:reportId/status', requireUser, requireRoles('super_admin'), async (req, res) => {
  const id = validate(objectId, req.params.reportId)
  const { status } = validate(z.object({ status: z.enum(['reviewing', 'resolved', 'dismissed']) }), req.body)
  const report = await adminTransaction(req, { action: `report.${status}`, targetType: 'report', target: id, details: { status } }, async (session) => {
    const updated = await Report.findByIdAndUpdate(id, { status, assignedTo: req.user._id }, { new: true, session })
    if (!updated) {
      const error = new Error('Report not found.')
      error.status = 404
      throw error
    }
    return updated
  })
  res.json({ report })
})

router.get('/admin/audit-logs', requireUser, requireRoles('super_admin'), async (req, res) => {
  const { page, limit, skip } = toPage(req.query)
  const [items, total] = await Promise.all([
    AdminLog.find().sort({ createdAt: -1 }).skip(skip).limit(limit).populate('actor', 'name email').lean(),
    AdminLog.countDocuments(),
  ])
  res.json({ items, page, limit, total, pages: Math.ceil(total / limit) })
})

router.get('/admin/settings', requireUser, requireRoles('super_admin'), async (_req, res) => {
  const items = await Setting.find().sort({ key: 1 }).lean()
  res.json({ items })
})

router.put('/admin/settings/:key', requireUser, requireRoles('super_admin'), async (req, res) => {
  const key = validate(z.string().trim().regex(/^[a-z][a-z0-9_-]{1,79}$/), req.params.key)
  const { values } = validate(z.object({ values: z.array(z.string().trim().min(1).max(120)).max(100) }).strict(), req.body)
  const uniqueValues = [...new Set(values)]
  const setting = await adminTransaction(req, { action: 'settings.updated', targetType: 'setting', details: { key, values: uniqueValues } }, async (session) => Setting.findOneAndUpdate(
    { key },
    { key, values: uniqueValues, updatedBy: req.user._id },
    { upsert: true, new: true, runValidators: true, session },
  ))
  res.json({ setting })
})

router.get('/admin/notifications', requireUser, requireRoles('super_admin'), async (_req, res) => {
  const items = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50).lean()
  res.json({ items })
})

router.get('/admin/applications', requireUser, requireRoles('super_admin'), async (req, res) => {
  const { page, limit, skip } = toPage(req.query)
  const [items, total] = await Promise.all([
    Application.find().sort({ createdAt: -1 }).skip(skip).limit(limit)
      .populate('candidate', 'name email').populate('company', 'name').populate('job', 'title').lean(),
    Application.countDocuments(),
  ])
  res.json({ items, page, limit, total, pages: Math.ceil(total / limit) })
})

router.get('/admin/admins', requireUser, requireRoles('super_admin'), async (req, res) => {
  const [admins, invites] = await Promise.all([
    User.find({ role: 'super_admin' }).select('name email status createdAt').sort({ createdAt: 1 }).lean(),
    AdminInvite.find({ expiresAt: { $gt: new Date() } }).select('email expiresAt createdAt').lean(),
  ])
  const primaryAdminEmail = process.env.PRIMARY_ADMIN_EMAIL?.trim().toLowerCase() || ''
  res.json({
    admins: admins.map((admin) => ({ ...admin, isPrimaryAdmin: admin.email.toLowerCase() === primaryAdminEmail })),
    invites,
    currentUserIsPrimaryAdmin: Boolean(primaryAdminEmail) && req.user.email.toLowerCase() === primaryAdminEmail,
    primaryAdminConfigured: Boolean(primaryAdminEmail),
  })
})

router.delete('/admin/admins/:adminId', requireUser, requireRoles('super_admin'), requirePrimaryAdmin, async (req, res) => {
  const id = validate(objectId, req.params.adminId)
  const primaryAdminEmail = process.env.PRIMARY_ADMIN_EMAIL.trim().toLowerCase()
  if (String(id) === String(req.user._id)) {
    const error = new Error('You cannot remove your own administrator account.')
    error.status = 400
    throw error
  }
  const admin = await User.findOne({ _id: id, role: 'super_admin' }).select('email').lean()
  if (!admin) {
    const error = new Error('Secondary administrator not found.')
    error.status = 404
    throw error
  }
  if (admin.email.toLowerCase() === primaryAdminEmail) {
    const error = new Error('The primary administrator account cannot be removed.')
    error.status = 400
    throw error
  }
  await adminTransaction(req, { action: 'admin.removed', targetType: 'user', target: id, details: { email: admin.email } }, async (session) => {
    const removed = await User.findOneAndDelete({
      _id: id,
      role: 'super_admin',
      email: admin.email,
    }, { session }).select('email')
    if (!removed) {
      const error = new Error('Secondary administrator not found.')
      error.status = 404
      throw error
    }
    return removed
  })
  res.status(204).end()
})

router.post('/admin/admin-invitations', requireUser, requireRoles('super_admin'), requirePrimaryAdmin, async (req, res) => {
  const { email } = validate(z.object({ email: z.string().email().max(240) }).strict(), req.body)
  const normalizedEmail = email.toLowerCase()
  const existingUser = await User.findOne({ email: normalizedEmail })
  if (existingUser && existingUser.role !== 'super_admin') return res.status(409).json({ error: 'This email is already assigned to a non-admin account.' })
  const invite = await adminTransaction(req, { action: 'admin.invite_created', targetType: 'admin_invite', details: { email: normalizedEmail } }, async (session) => AdminInvite.findOneAndUpdate(
    { email: normalizedEmail },
    { email: normalizedEmail, createdBy: req.user._id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    { upsert: true, new: true, runValidators: true, session },
  ))
  res.status(201).json({ invite })
})

router.delete('/admin/admin-invitations/:inviteId', requireUser, requireRoles('super_admin'), requirePrimaryAdmin, async (req, res) => {
  const id = validate(objectId, req.params.inviteId)
  await adminTransaction(req, { action: 'admin.invite_revoked', targetType: 'admin_invite', target: id }, async (session) => {
    const result = await AdminInvite.deleteOne({ _id: id }, { session })
    if (!result.deletedCount) {
      const error = new Error('Invitation not found.')
      error.status = 404
      throw error
    }
    return result
  })
  res.status(204).end()
})

export default router
