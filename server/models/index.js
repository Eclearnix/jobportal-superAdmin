import mongoose from 'mongoose'

const { Schema } = mongoose

const userSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  googleId: { type: String, unique: true, sparse: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  picture: { type: String, default: '' },
  role: { type: String, enum: ['candidate', 'recruiter', 'super_admin'], required: true, index: true },
  status: { type: String, enum: ['active', 'pending', 'suspended'], default: 'active', index: true },
  company: { type: Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
  title: { type: String, trim: true, maxlength: 120, default: '' },
  phone: { type: String, trim: true, maxlength: 40, default: '' },
  location: { type: String, trim: true, maxlength: 120, default: '' },
  profileViews: { type: Number, min: 0, default: 0 },
  skills: [{ type: String, trim: true, maxlength: 80 }],
  education: [{ school: String, degree: String, graduationYear: Number }],
  experience: [{ title: String, company: String, startDate: Date, endDate: Date, summary: String }],
  preferredLocations: [{ type: String, trim: true, maxlength: 120 }],
  openToOpportunities: { type: Boolean, default: false, index: true },
  resumeKey: { type: String, default: '' },
  lastLoginAt: { type: Date },
}, { timestamps: true, strict: 'throw' })

const companySchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  normalizedName: { type: String, required: true, lowercase: true, trim: true, index: true },
  website: { type: String, trim: true, maxlength: 240, default: '' },
  industry: { type: String, trim: true, maxlength: 120, default: '' },
  size: { type: String, trim: true, maxlength: 60, default: '' },
  location: { type: String, trim: true, maxlength: 160, default: '' },
  description: { type: String, trim: true, maxlength: 3000, default: '' },
  contactEmail: { type: String, lowercase: true, trim: true, default: '' },
  logoKey: { type: String, default: '' },
  verificationDocumentKey: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'verified', 'rejected', 'suspended', 'removed'], default: 'pending', index: true },
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true, strict: 'throw' })

companySchema.index({ normalizedName: 1, owner: 1 }, { unique: true })

const jobSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  description: { type: String, required: true, trim: true, maxlength: 15000 },
  responsibilities: [{ type: String, trim: true, maxlength: 500 }],
  qualifications: [{ type: String, trim: true, maxlength: 500 }],
  skills: [{ type: String, trim: true, maxlength: 80 }],
  location: { type: String, trim: true, maxlength: 160, required: true },
  workMode: { type: String, enum: ['remote', 'hybrid', 'on-site'], required: true, index: true },
  employmentType: { type: String, enum: ['full-time', 'part-time', 'internship', 'contract'], required: true, index: true },
  experienceLevel: { type: String, trim: true, maxlength: 80, default: '' },
  industry: { type: String, trim: true, maxlength: 120, default: '' },
  salaryMin: { type: Number, min: 0, default: null },
  salaryMax: { type: Number, min: 0, default: null },
  currency: { type: String, uppercase: true, trim: true, maxlength: 3, default: 'USD' },
  applicationDeadline: { type: Date, default: null },
  status: { type: String, enum: ['draft', 'pending_review', 'published', 'paused', 'closed', 'rejected'], default: 'draft', index: true },
  publishedAt: { type: Date, default: null, index: true },
}, { timestamps: true, strict: 'throw' })

jobSchema.index({ title: 'text', description: 'text', skills: 'text' })
jobSchema.index({ status: 1, publishedAt: -1 })

const applicationSchema = new Schema({
  candidate: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  job: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  resumeKey: { type: String, required: true },
  coverLetter: { type: String, trim: true, maxlength: 5000, default: '' },
  status: { type: String, enum: ['submitted', 'under_review', 'shortlisted', 'interview_scheduled', 'selected', 'rejected', 'withdrawn'], default: 'submitted', index: true },
  withdrawnAt: { type: Date, default: null },
}, { timestamps: true, strict: 'throw' })

applicationSchema.index({ candidate: 1, job: 1 }, { unique: true })
applicationSchema.index({ company: 1, status: 1, createdAt: -1 })

const savedJobSchema = new Schema({
  candidate: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  job: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
}, { timestamps: true })
savedJobSchema.index({ candidate: 1, job: 1 }, { unique: true })

const notificationSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, required: true, maxlength: 80 },
  title: { type: String, required: true, maxlength: 180 },
  message: { type: String, required: true, maxlength: 1000 },
  readAt: { type: Date, default: null },
  relatedId: { type: Schema.Types.ObjectId, default: null },
}, { timestamps: true })

const interviewSchema = new Schema({
  application: { type: Schema.Types.ObjectId, ref: 'Application', required: true, index: true },
  candidate: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  scheduledAt: { type: Date, required: true },
  durationMinutes: { type: Number, min: 15, max: 480, default: 30 },
  meetingUrl: { type: String, trim: true, maxlength: 500, default: '' },
  notes: { type: String, trim: true, maxlength: 2000, default: '' },
  status: { type: String, enum: ['scheduled', 'completed', 'cancelled'], default: 'scheduled' },
}, { timestamps: true })

const reportSchema = new Schema({
  reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  targetType: { type: String, enum: ['company', 'job', 'user'], required: true },
  target: { type: Schema.Types.ObjectId, required: true },
  reason: { type: String, required: true, trim: true, maxlength: 120 },
  details: { type: String, trim: true, maxlength: 3000, default: '' },
  status: { type: String, enum: ['open', 'reviewing', 'resolved', 'dismissed'], default: 'open', index: true },
  assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true })

const adminLogSchema = new Schema({
  actor: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  action: { type: String, required: true, maxlength: 100 },
  targetType: { type: String, required: true, maxlength: 80 },
  target: { type: Schema.Types.ObjectId, default: null },
  details: { type: Schema.Types.Mixed, default: {} },
  ipAddress: { type: String, maxlength: 100, default: '' },
}, { timestamps: true })

const settingSchema = new Schema({
  key: { type: String, required: true, unique: true, trim: true, maxlength: 120 },
  values: [{ type: String, trim: true, maxlength: 120 }],
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true })

const adminInviteSchema = new Schema({
  email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true })

const companyInviteSchema = new Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true })
companyInviteSchema.index({ email: 1, company: 1 }, { unique: true })

export const User = mongoose.models.User || mongoose.model('User', userSchema)
export const Company = mongoose.models.Company || mongoose.model('Company', companySchema)
export const Job = mongoose.models.Job || mongoose.model('Job', jobSchema)
export const Application = mongoose.models.Application || mongoose.model('Application', applicationSchema)
export const SavedJob = mongoose.models.SavedJob || mongoose.model('SavedJob', savedJobSchema)
export const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema)
export const Interview = mongoose.models.Interview || mongoose.model('Interview', interviewSchema)
export const Report = mongoose.models.Report || mongoose.model('Report', reportSchema)
export const AdminLog = mongoose.models.AdminLog || mongoose.model('AdminLog', adminLogSchema)
export const Setting = mongoose.models.Setting || mongoose.model('Setting', settingSchema)
export const AdminInvite = mongoose.models.AdminInvite || mongoose.model('AdminInvite', adminInviteSchema)
export const CompanyInvite = mongoose.models.CompanyInvite || mongoose.model('CompanyInvite', companyInviteSchema)
