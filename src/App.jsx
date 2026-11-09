import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, BriefcaseBusiness, Building2, ChevronDown, LayoutDashboard, LogOut, Search, ShieldCheck, Users,
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

function Overview({ data }) {
  const summary = data?.summary || {}
  return (
    <>
      <div className="metric-grid">
        {Object.entries(summaryLabels).map(([key, label]) => (
          <article className="metric-card" key={key}>
            <span>{label}</span><strong>{summary[key] ?? '—'}</strong>
          </article>
        ))}
      </div>
      <section className="panel callout">
        <div className="callout-icon"><AlertTriangle size={18} /></div>
        <div><h2>Company verification and job moderation</h2><p>Review company applications and moderate job listings. Only verified companies can have jobs published.</p></div>
      </section>
    </>
  )
}

function AdminManagement({ data, onReload, onError }) {
  const { admins = [], invites = [] } = data || {}
  const canManageAdmins = data?.currentUserIsPrimaryAdmin === true
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [revokingId, setRevokingId] = useState('')

  async function invite(event) {
    event.preventDefault()
    setBusy(true)
    onError('')
    try {
      await api('/admin/admin-invitations', { method: 'POST', body: { email: email.trim() } })
      setEmail('')
      await onReload()
    } catch (inviteError) {
      onError(inviteError.message)
    } finally {
      setBusy(false)
    }
  }

  async function revoke(inviteId) {
    setRevokingId(inviteId)
    onError('')
    try {
      await api(`/admin/admin-invitations/${inviteId}`, { method: 'DELETE' })
      await onReload()
    } catch (revokeError) {
      onError(revokeError.message)
    } finally {
      setRevokingId('')
    }
  }

  return (
    <section className="admin-management">
      {data?.primaryAdminConfigured ? (
        <div className={`security-note admin-role-note ${canManageAdmins ? 'primary-admin-note' : ''}`}>
          <ShieldCheck size={17} />
          <span>{canManageAdmins
            ? 'You are the primary administrator and can manage administrator invitations.'
            : 'Only the designated primary administrator can create or revoke administrator invitations.'}</span>
        </div>
      ) : (
        <div className="alert error" role="alert">Primary administrator is not configured. Set PRIMARY_ADMIN_EMAIL in the backend environment and restart the API.</div>
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
          <thead><tr><th>Name</th><th>Email</th><th>Access</th><th>Status</th><th>Added</th></tr></thead>
          <tbody>
            {admins.length ? admins.map((admin) => (
              <tr key={admin._id}>
                <td>{admin.name || '—'}</td>
                <td>{admin.email}</td>
                <td>{admin.isPrimaryAdmin ? <span className="tag primary-tag">Primary admin</span> : <span className="tag">Administrator</span>}</td>
                <td><span className="tag">{humanize(admin.status)}</span></td>
                <td>{dateLabel(admin.createdAt)}</td>
              </tr>
            )) : <tr><td className="empty-row" colSpan={5}>No administrators found.</td></tr>}
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
                <td>{canManageAdmins ? <button className="text-button danger" type="button" disabled={revokingId === inviteItem._id} onClick={() => revoke(inviteItem._id)}>{revokingId === inviteItem._id ? 'Revoking…' : 'Revoke'}</button> : '—'}</td>
              </tr>
            )) : <tr><td className="empty-row" colSpan={3}>No pending invitations.</td></tr>}
          </tbody>
        </table>
        <div className="table-footer">{invites.length} pending invitation{invites.length === 1 ? '' : 's'}</div>
      </div>
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
  const [actionError, setActionError] = useState('')
  const [search, setSearch] = useState('')
  const section = useMemo(() => sections.find((item) => item.id === active) || sections[0], [active])

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
    setActionError('')
    try {
      await api(statusPath[type](item._id), { method: 'PATCH', body: { status } })
      await reload()
    } catch (updateError) {
      setActionError(updateError.message)
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
          {sections.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`nav-item ${active === id ? 'active' : ''}`} onClick={() => { setActive(id); setSearch(''); setActionError('') }}><Icon size={17} /><span>{label}</span>{active === id && <span className="active-indicator" />}</button>)}
        </nav>
        <div className="sidebar-bottom"><div className="security-chip"><ShieldCheck size={15} /><span>Secure session</span><span className="online-dot" /></div><button type="button" className="logout-button" onClick={logout}><LogOut size={16} />Sign out</button></div>
      </aside>
      <main className="main-area">
        <header className="topbar"><div className="breadcrumb">Platform <span>/</span> <strong>{section.label}</strong></div><div className="profile"><div className="avatar">{(user?.name || 'A').charAt(0).toUpperCase()}</div><span><strong>{user?.name || 'Administrator'}</strong><small>Super Admin</small></span></div></header>
        <div className="page-content">
          <div className="page-heading"><div><span className="eyebrow">PLATFORM CONTROL CENTER</span><h1>{section.id === 'overview' ? 'Platform overview' : section.label}</h1><p>{section.id === 'overview' ? 'Review companies and moderate job listings.' : `Review and manage ${section.label.toLowerCase()} across the platform.`}</p></div><button type="button" className="secondary-button" onClick={reload}>Refresh</button></div>
          {error && <div className="alert error" role="alert">{error}<button type="button" onClick={reload}>Try again</button></div>}
          {actionError && <div className="alert error" role="alert">{actionError}<button type="button" onClick={() => setActionError('')}>Dismiss</button></div>}
          {loading ? <Loading /> : !error && (
            <>
              {active === 'overview' ? <Overview data={data} /> : active === 'admins' ? <AdminManagement data={data} onReload={reload} onError={setActionError} /> : (
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
