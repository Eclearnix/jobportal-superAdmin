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

export async function sendInterviewEmail({ to, replyTo, candidateName, companyName, jobTitle, scheduledAt, durationMinutes, meetingUrl, notes }) {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
    return {
      sent: false,
      error: 'Email is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM in the server .env.',
    }
  }

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

  const transporter = nodemailer.createTransport({
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
