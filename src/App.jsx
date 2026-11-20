import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, AlertCircle, AlertTriangle, BriefcaseBusiness, Building2, CheckCircle2, ChevronDown, LayoutDashboard, LogOut, Search, ShieldCheck, Users, X,
} from 'lucide-react'
import { AuthProvider, useAuth } from './AuthContext'
import { api } from './api'
import GoogleSignInButton from './GoogleSignInButton'

const sections = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, endpoint: '/dashboard/admin' },
  { id: 'organizations', label: 'Companies', icon: Building2, endpoint: '/admin/organizations?limit=100' },
  { id: 'jobs', label: 'Jobs', icon: BriefcaseBusiness, endpoint: '/admin/jobs?limit=100' },
  { id: 'admins', label: 'Administrators', icon: Users, endpoint: '/admin/admins' },
]

const fieldSets = {
  organizations: [['name', 'Company'], ['contactEmail', 'Contact email'], ['status', 'Status'], ['createdAt', 'Created']],
  jobs: [['title', 'Job'], ['company.name', 'Organization'], ['status', 'Status'], ['location', 'Location'], ['createdAt', 'Created']],
}

const statusOptions = {
  organizations: ['verified', 'rejected'],
  jobs: ['published', 'rejected'],
}

const statusPath = {
  organizations: (id) => `/admin/organizations/${id}/status`,
  jobs: (id) => `/admin/jobs/${id}/status`,
}

const dateLabel = (value) => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
const humanize = (value = '') => String(value).replaceAll('_', ' ').replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const fieldValue = (item, path) => path.split('.').reduce((value, key) => value?.[key], item)
const summaryLabels = {
  totalOrganizations: 'Organizations',
  verifiedOrganizations: 'Verified organizations',
  pendingVerifications: 'Pending reviews',
  totalJobs: 'All jobs',
  activeJobs: 'Published jobs',
}
const userSummaryLabels = {
  totalUsers: 'Registered users',
  totalCandidates: 'Candidates',
  totalRecruiters: 'Recruiters',
  activeUsersLast30Days: 'Active in last 30 days',
  newUsersLast30Days: 'Registered in last 30 days',
}

function Login() {
  const { signIn, error: sessionError } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const acceptCredential = useCallback(async (credential) => {
    setBusy(true)
    setError('')
    try {
      await signIn(credential)
    } catch (signInError) {
      setError(signInError.message)
    } finally {
      setBusy(false)
    }
  }, [signIn])

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand-mark"><ShieldCheck size={25} /></div>
        <span className="eyebrow">ECLEARNIX JOBS · PLATFORM CONTROL</span>
        <h1>Super Admin<br />sign in</h1>
        <p className="login-description">Restricted access for authorized platform administrators.</p>
        <div className="security-note"><ShieldCheck size={17} /><span>Administrator access is invite-only and verified by the backend.</span></div>
        <GoogleSignInButton onCredential={acceptCredential} disabled={busy} />
        {busy && <p className="muted center" role="status">Verifying your Google account…</p>}
        {(error || sessionError) && <p className="alert error" role="alert">{error || sessionError}</p>}
        <p className="login-footnote">Use the Google account registered for your administrator invitation.</p>
      </section>
      <footer className="login-footer">© {new Date().getFullYear()} Eclearnix Jobs <span>Secure platform administration</span></footer>
    </main>
  )
}

function Loading({ label = 'Loading secure workspace…' }) {
  return <div className="loading-state" role="status"><span className="spinner" />{label}</div>
}

function ActionToast({ toast, onDismiss }) {
  if (!toast) return null
  const isError = toast.type === 'error'
  const Icon = isError ? AlertCircle : CheckCircle2
  return (
    <div key={toast.id} className={`action-toast ${toast.type}`} role={isError ? 'alert' : 'status'} aria-live={isError ? 'assertive' : 'polite'}>
      <span className="action-toast-icon"><Icon size={20} /></span>
      <span className="action-toast-copy">
        <strong>{isError ? 'Action failed' : 'Done'}</strong>
        <span>{toast.message}</span>
      </span>
      <button className="action-toast-dismiss" type="button" aria-label="Dismiss notification" onClick={onDismiss}><X size={17} /></button>
      <span className="action-toast-progress" aria-hidden="true" />
    </div>
  )
}

function Overview({ data }) {
  const summary = data?.summary || {}
  return (
    <>
      <section className="overview-section" aria-labelledby="user-activity-heading">
        <h2 className="overview-section-title" id="user-activity-heading">User activity</h2>
        <div className="metric-grid">
          {Object.entries(userSummaryLabels).map(([key, label]) => (
            <article className="metric-card" key={key}>
              <span>{label}</span><strong>{summary[key]?.toLocaleString() ?? '—'}</strong>
            </article>
          ))}
        </div>
        <p className="metric-caption">Active users are registered candidates or recruiters with an authenticated app visit in the last 30 days.</p>
      </section>
      <section className="overview-section" aria-labelledby="platform-summary-heading">
        <h2 className="overview-section-title" id="platform-summary-heading">Platform summary</h2>
        <div className="metric-grid">
          {Object.entries(summaryLabels).map(([key, label]) => (
            <article className="metric-card" key={key}>
              <span>{label}</span><strong>{summary[key]?.toLocaleString() ?? '—'}</strong>
            </article>
          ))}
        </div>
      </section>
      <section className="panel callout">
        <div className="callout-icon"><AlertTriangle size={18} /></div>
        <div><h2>Company verification and job moderation</h2><p>Review company applications and moderate job listings. Only verified companies can have jobs published.</p></div>
      </section>
    </>
  )
}

function AdminManagement({ data, onReload, onToast }) {
  const { admins = [], invites = [] } = data || {}
  const canManageAdmins = data?.currentUserIsPrimaryAdmin === true
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [revokingId, setRevokingId] = useState('')
  const [removingId, setRemovingId] = useState('')
  const [promotingId, setPromotingId] = useState('')
  const [confirmation, setConfirmation] = useState(null)

  useEffect(() => {
    if (!confirmation) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setConfirmation(null)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [confirmation])

  async function invite(event) {
    event.preventDefault()
    setBusy(true)
    try {
      await api('/admin/admin-invitations', { method: 'POST', body: { email: email.trim() } })
      setEmail('')
      await onReload()
      onToast(`Invitation email sent to ${email.trim()}.`, 'success')
    } catch (inviteError) {
      onToast(inviteError.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  function revoke(inviteItem) {
    setConfirmation({
      title: 'Revoke administrator invitation?',
      message: `The invitation for ${inviteItem.email} will no longer be valid.`,
      confirmLabel: 'Revoke invitation',
      destructive: true,
      onConfirm: async () => {
        setRevokingId(inviteItem._id)
        try {
          await api(`/admin/admin-invitations/${inviteItem._id}`, { method: 'DELETE' })
          await onReload()
          onToast('Administrator invitation revoked.', 'success')
        } catch (revokeError) {
          onToast(revokeError.message, 'error')
        } finally {
          setRevokingId('')
        }
      },
    })
  }

  function removeAdmin(admin) {
    setConfirmation({
      title: 'Remove administrator?',
      message: `${admin.name || admin.email} will lose Super Admin access immediately.`,
      confirmLabel: 'Remove administrator',
      destructive: true,
      onConfirm: async () => {
        setRemovingId(admin._id)
        try {
          await api(`/admin/admins/${admin._id}`, { method: 'DELETE' })
          await onReload()
          onToast('Administrator removed.', 'success')
        } catch (removeError) {
          onToast(removeError.message, 'error')
        } finally {
          setRemovingId('')
        }
      },
    })
  }

  function assignPrimary(admin) {
    setConfirmation({
      title: 'Assign primary administrator?',
      message: `Make ${admin.name || admin.email} the primary administrator? You will remain a Super Admin but lose primary-only controls.`,
      confirmLabel: 'Assign as primary',
      destructive: false,
      onConfirm: async () => {
        setPromotingId(admin._id)
        try {
          await api(`/admin/admins/${admin._id}/primary`, { method: 'POST' })
          await onReload()
          onToast('Primary administrator updated.', 'success')
        } catch (promoteError) {
          onToast(promoteError.message, 'error')
        } finally {
          setPromotingId('')
        }
      },
    })
  }

  function confirmAction() {
    const action = confirmation?.onConfirm
    setConfirmation(null)
    if (action) action()
  }

  return (
    <section className="admin-management">
      {data?.primaryAdminConfigured ? (
        <div className={`security-note admin-role-note ${canManageAdmins ? 'primary-admin-note' : ''}`}>
          <ShieldCheck size={17} />
          <span>{canManageAdmins
            ? 'You are the primary administrator. Accepted invitations remain administrators until you assign one as primary; you will remain a Super Admin after a transfer.'
            : `Only ${data.primaryAdminEmail || 'the designated primary administrator'} can manage invitations or transfer primary status. Sign in with that account to manage administrators.`}</span>
        </div>
      ) : (
        <div className="alert error" role="alert">No primary administrator is designated. Ensure the configured primary email belongs to an existing Super Admin.</div>
      )}
      {canManageAdmins && (
        <form className="invite-form" onSubmit={invite}>
          <div>
            <strong>Invite an administrator</strong>
            <span>Only invite people who should have full Super Admin access.</span>
          </div>
          <input
            aria-label="Administrator email"
            type="email"
            autoComplete="email"
            maxLength={240}
            placeholder="admin@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send invite'}
          </button>
        </form>
      )}

      <h2 className="subheading">Current administrators</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Access</th><th>Status</th><th>Added</th>{canManageAdmins && <th>Action</th>}</tr></thead>
          <tbody>
            {admins.length ? admins.map((admin) => (
              <tr key={admin._id}>
                <td>{admin.name || '—'}</td>
                <td>{admin.email}</td>
                <td>{admin.isPrimaryAdmin ? <span className="tag primary-tag">Primary admin</span> : <span className="tag">Administrator</span>}</td>
                <td><span className="tag">{humanize(admin.status)}</span></td>
                <td>{dateLabel(admin.createdAt)}</td>
                {canManageAdmins && <td>{admin.isPrimaryAdmin ? 'Current primary' : (
                  <div className="admin-row-actions">
                    {admin.status === 'active' && <button className="text-button" type="button" disabled={promotingId === admin._id || removingId === admin._id} onClick={() => assignPrimary(admin)}>{promotingId === admin._id ? 'Assigning…' : 'Assign as primary administrator'}</button>}
                    <button className="text-button danger" type="button" disabled={removingId === admin._id || promotingId === admin._id} onClick={() => removeAdmin(admin)}>{removingId === admin._id ? 'Removing…' : 'Remove'}</button>
                  </div>
                )}</td>}
              </tr>
            )) : <tr><td className="empty-row" colSpan={canManageAdmins ? 6 : 5}>No administrators found.</td></tr>}
          </tbody>
        </table>
        <div className="table-footer">{admins.length} administrator{admins.length === 1 ? '' : 's'}</div>
      </div>

      <h2 className="subheading">Pending invitations</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Email</th><th>Expires</th><th>Action</th></tr></thead>
          <tbody>
            {invites.length ? invites.map((inviteItem) => (
              <tr key={inviteItem._id}>
                <td>{inviteItem.email}</td>
                <td>{dateLabel(inviteItem.expiresAt)}</td>
                <td>{canManageAdmins ? <button className="text-button danger" type="button" disabled={revokingId === inviteItem._id} onClick={() => revoke(inviteItem)}>{revokingId === inviteItem._id ? 'Revoking…' : 'Revoke'}</button> : '—'}</td>
              </tr>
            )) : <tr><td className="empty-row" colSpan={3}>No pending invitations.</td></tr>}
          </tbody>
        </table>
        <div className="table-footer">{invites.length} pending invitation{invites.length === 1 ? '' : 's'}</div>
      </div>
      {confirmation && (
        <div className="admin-confirm-backdrop">
          <section className="admin-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="admin-confirm-title" aria-describedby="admin-confirm-message">
            <div className="admin-confirm-heading">
              <span className={`admin-confirm-icon ${confirmation.destructive ? 'destructive' : ''}`}><ShieldCheck size={19} /></span>
              <h2 id="admin-confirm-title">{confirmation.title}</h2>
            </div>
            <p id="admin-confirm-message">{confirmation.message}</p>
            <div className="admin-confirm-actions">
              <button className="secondary-button" type="button" autoFocus onClick={() => setConfirmation(null)}>Cancel</button>
              <button className={`primary-button ${confirmation.destructive ? 'destructive-button' : ''}`} type="button" onClick={confirmAction}>{confirmation.confirmLabel}</button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

function DataTable({ type, data, search = '', onStatusChange }) {
  const rows = data?.items || []
  const fields = fieldSets[type] || []
  const filtered = rows.filter((item) => fields.some(([key]) => String(fieldValue(item, key) ?? '').toLowerCase().includes(search.toLowerCase())))

  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{fields.map(([, label]) => <th key={label}>{label}</th>)}<th>Update status</th></tr></thead>
        <tbody>
          {filtered.length ? filtered.map((item) => (
            <tr key={item._id || item.id || item.key || item.email}>
              {fields.map(([key]) => {
                const value = fieldValue(item, key)
                return <td key={key}>{key.toLowerCase().includes('date') ? dateLabel(value) : key === 'status' ? <span className="tag">{humanize(value)}</span> : String(value ?? '—')}</td>
              })}
              <td><label className="status-control"><span className="sr-only">Update status</span><select value={item.status || ''} onChange={(event) => onStatusChange(type, item, event.target.value)}>{item.status && !statusOptions[type].includes(item.status) && <option value={item.status} disabled>{humanize(item.status)}</option>}{statusOptions[type].map((status) => <option key={status} value={status}>{humanize(status)}</option>)}</select><ChevronDown size={13} /></label></td>
            </tr>
          )) : <tr><td className="empty-row" colSpan={fields.length + 1}>No records found.</td></tr>}
        </tbody>
      </table>
      <div className="table-footer">{filtered.length} record{filtered.length === 1 ? '' : 's'}{filtered.length !== rows.length ? ` · ${rows.length} total` : ''}</div>
    </div>
  )
}

function Dashboard() {
  const { user, signOut } = useAuth()
  const [active, setActive] = useState('overview')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)
  const toastTimerRef = useRef(null)
  const toastIdRef = useRef(0)
  const [search, setSearch] = useState('')
  const section = useMemo(() => sections.find((item) => item.id === active) || sections[0], [active])

  const showToast = useCallback((message, type = 'success') => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    const id = toastIdRef.current + 1
    toastIdRef.current = id
    setToast({ id, message, type })
    toastTimerRef.current = window.setTimeout(() => {
      setToast((current) => current?.id === id ? null : current)
      toastTimerRef.current = null
    }, 4000)
  }, [])

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = null
    setToast(null)
  }, [])

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await api(section.endpoint))
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [section])

  useEffect(() => { reload() }, [reload])

  async function updateStatus(type, item, status) {
    if (status === item.status) return
    try {
      await api(statusPath[type](item._id), { method: 'PATCH', body: { status } })
      await reload()
      showToast(`${type === 'organizations' ? 'Organization' : 'Job'} status updated to ${humanize(status)}.`, 'success')
    } catch (updateError) {
      showToast(updateError.message, 'error')
    }
  }

  async function logout() {
    try {
      await signOut()
    } catch (signOutError) {
      setError(signOutError.message)
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><ShieldCheck size={20} /></span><span><strong>eclearnix<span>jobs</span></strong><small>PLATFORM ADMIN</small></span></div>
        <nav aria-label="Administration">
          <span className="nav-heading">WORKSPACE</span>
          {sections.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`nav-item ${active === id ? 'active' : ''}`} onClick={() => { setActive(id); setSearch(''); dismissToast() }}><Icon size={17} /><span>{label}</span>{active === id && <span className="active-indicator" />}</button>)}
        </nav>
        <div className="sidebar-bottom"><div className="security-chip"><ShieldCheck size={15} /><span>Secure session</span><span className="online-dot" /></div><button type="button" className="logout-button" onClick={logout}><LogOut size={16} />Sign out</button></div>
      </aside>
      <main className="main-area">
        <header className="topbar"><div className="breadcrumb">Platform <span>/</span> <strong>{section.label}</strong></div><div className="profile"><div className="avatar">{(user?.name || 'A').charAt(0).toUpperCase()}</div><span><strong>{user?.name || 'Administrator'}</strong><small>Super Admin</small></span></div></header>
        <div className="page-content">
          <div className="page-heading"><div><span className="eyebrow">PLATFORM CONTROL CENTER</span><h1>{section.id === 'overview' ? 'Platform overview' : section.label}</h1><p>{section.id === 'overview' ? 'Review companies and moderate job listings.' : `Review and manage ${section.label.toLowerCase()} across the platform.`}</p></div><button type="button" className="secondary-button" onClick={reload}>Refresh</button></div>
          {error && <div className="alert error" role="alert">{error}<button type="button" onClick={reload}>Try again</button></div>}
          {loading ? <Loading /> : !error && (
            <>
              {active === 'overview' ? <Overview data={data} /> : active === 'admins' ? <AdminManagement data={data} onReload={reload} onToast={showToast} /> : (
                <>
                  {fieldSets[active] && <div className="table-tools"><label className="search-field"><Search size={16} /><input type="search" placeholder={`Search ${section.label.toLowerCase()}…`} value={search} onChange={(event) => setSearch(event.target.value)} /></label>{data?.total !== undefined && <span>{data.total.toLocaleString()} total</span>}</div>}
                  <DataTable type={active} data={data} search={search} onStatusChange={updateStatus} />
                </>
              )}
            </>
          )}
          {active === 'overview' && <p className="overview-note"><Activity size={14} /> Data reflects the latest saved platform records.</p>}
        </div>
      </main>
      <ActionToast toast={toast} onDismiss={dismissToast} />
    </div>
  )
}

function AppContent() {
  const { user, loading } = useAuth()
  if (loading) return <Loading />
  return user?.role === 'super_admin' ? <Dashboard /> : <Login />
}

export default function App() {
  return <AuthProvider><AppContent /></AuthProvider>
}
