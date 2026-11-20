import nodemailer from 'nodemailer'

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character])
}

function getHttpUrl(value) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

function createSmtpTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD } = process.env
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) return null

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: SMTP_SECURE === 'true',
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASSWORD,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  })
}

function configurationError(message) {
  const error = new Error(message)
  error.status = 503
  error.publicMessage = message
  return error
}

export async function sendInterviewEmail({ to, replyTo, candidateName, companyName, jobTitle, scheduledAt, durationMinutes, meetingUrl, notes }) {
  const transporter = createSmtpTransporter()
  if (!transporter) {
    return {
      sent: false,
      error: 'Email is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD in the server .env.',
    }
  }

  const { SMTP_FROM, SMTP_USER } = process.env
  const date = new Date(scheduledAt)
  const formattedDate = `${date.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: 'UTC' })} UTC`
  const safeMeetingUrl = getHttpUrl(meetingUrl)
  const subject = `Interview scheduled: ${jobTitle}`
  const text = [
    `Hello ${candidateName},`,
    '',
    `${companyName} has scheduled an interview with you for ${jobTitle}.`,
    `When: ${formattedDate}`,
    `Duration: ${durationMinutes} minutes`,
    safeMeetingUrl ? `Meeting link: ${safeMeetingUrl}` : '',
    notes ? `Notes: ${notes}` : '',
  ].filter(Boolean).join('\n')
  const html = `<p>Hello ${escapeHtml(candidateName)},</p>
    <p>${escapeHtml(companyName)} has scheduled an interview with you for <strong>${escapeHtml(jobTitle)}</strong>.</p>
    <p><strong>When:</strong> ${escapeHtml(formattedDate)}<br>
    <strong>Duration:</strong> ${durationMinutes} minutes</p>
    ${safeMeetingUrl ? `<p><strong>Meeting link:</strong> <a href="${escapeHtml(safeMeetingUrl)}">${escapeHtml(safeMeetingUrl)}</a></p>` : ''}
    ${notes ? `<p><strong>Notes:</strong><br>${escapeHtml(notes).replace(/\n/g, '<br>')}</p>` : ''}`

  await transporter.sendMail({
    from: `"${companyName} HR via Eclearnix Jobs" <${SMTP_FROM || SMTP_USER}>`,
    to,
    replyTo: replyTo || undefined,
    subject,
    text,
    html,
  })

  return { sent: true }
}

export async function sendAdminInvitationEmail({ to, inviterName, expiresAt }) {
  const transporter = createSmtpTransporter()
  if (!transporter) {
    throw configurationError('Administrator invitation email is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD on the API server.')
  }

  let portalUrl
  try {
    const origin = new URL(process.env.ADMIN_CLIENT_ORIGIN)
    if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('Unsupported protocol.')
    portalUrl = new URL('/', origin).href
  } catch {
    throw configurationError('Set ADMIN_CLIENT_ORIGIN to the Super Admin portal URL before sending invitations.')
  }

  const formattedExpiry = `${new Date(expiresAt).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  })} UTC`
  const greeting = inviterName ? `${inviterName} invited you` : 'You were invited'
  const subject = 'Invitation to Eclearnix Jobs Super Admin'
  const text = [
    `Hello,`,
    '',
    `${greeting} to join the Eclearnix Jobs platform as a Super Admin.`,
    `Sign in at ${portalUrl} using the Google account for ${to}.`,
    'You must use this invited, Google-verified email address to accept the invitation.',
    `This invitation expires ${formattedExpiry}.`,
  ].join('\n')
  const html = `<p>Hello,</p>
    <p>${escapeHtml(greeting)} to join the Eclearnix Jobs platform as a Super Admin.</p>
    <p><a href="${escapeHtml(portalUrl)}">Open the Super Admin portal</a> and sign in using the Google account for <strong>${escapeHtml(to)}</strong>.</p>
    <p>You must use this invited, Google-verified email address to accept the invitation.</p>
    <p>This invitation expires ${escapeHtml(formattedExpiry)}.</p>`

  try {
    await transporter.sendMail({
      from: `"Eclearnix Jobs Super Admin" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      html,
    })
  } catch (cause) {
    const error = new Error('Administrator invitation email could not be delivered.', { cause })
    error.status = 502
    error.publicMessage = 'Administrator invitation email could not be delivered. Verify the SMTP settings and Gmail App Password, then check the API server logs.'
    throw error
  }

  return { sent: true }
}
