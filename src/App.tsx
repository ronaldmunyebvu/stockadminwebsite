import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Activity, Archive, ArrowUpRight, Boxes, Check, ChevronDown, CircleHelp, ClipboardList, Cloud, Database, Download, LayoutDashboard, LogOut, Menu, Package, Plus, Search, Settings, ShieldCheck, SlidersHorizontal, UserRound, Users, Wifi, X } from 'lucide-react'
import { createExcelUpload, createItem, createItems, createLocation, createShopAdmin, createUser, createZone, isNeonConfigured, loadAdminData, scheduleStockCount, signInAdmin, signOutAdmin, updateThresholds, updateUserStatus } from './service'
import * as XLSX from 'xlsx'
import type { AdminData, SessionStatus, UserRole } from './types'

const statusLabels: Record<SessionStatus, string> = { draft: 'Draft', in_progress: 'Counting', submitted: 'Submitted', under_review: 'Needs review', approved: 'Approved', rejected: 'Rejected', recount_assigned: 'Recount' }
const roleLabels: Record<UserRole, string> = { admin: 'Admin', counter: 'Counter', auditor: 'Auditor' }
const nav = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'sessions', label: 'Count sessions', icon: ClipboardList },
  { id: 'team', label: 'Team & access', icon: Users },
  { id: 'locations', label: 'Locations', icon: Boxes },
  { id: 'activity', label: 'Activity log', icon: Activity },
  { id: 'settings', label: 'Settings', icon: Settings },
]

function formatDate(value: string) { return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) }
function initials(name: string) { return name.split(' ').map(part => part[0]).slice(0, 2).join('').toUpperCase() }
function displayName(id: string | undefined, data: AdminData) { return data.users.find(user => user.id === id)?.full_name ?? 'Unassigned' }
function locationName(id: string, data: AdminData) { return data.locations.find(location => location.id === id)?.name ?? 'Unknown location' }
function zoneName(id: string | undefined, data: AdminData) { return data.zones.find(zone => zone.id === id)?.name ?? 'All zones' }

export default function App() {
  const [data, setData] = useState<AdminData | null>(null)
  const [page, setPage] = useState('overview')
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [adminReady, setAdminReady] = useState(!isNeonConfigured || Boolean(localStorage.getItem('stockcount_admin_token')))
  const [dialog, setDialog] = useState<'team' | 'inventory' | 'import' | 'schedule' | null>(null)

  useEffect(() => {
    if (!isNeonConfigured || localStorage.getItem('stockcount_admin_token')) loadAdminData().then(setData).catch(error => { signOutAdmin(); setAdminReady(!isNeonConfigured); setNotice(error.message) }).finally(() => setLoading(false))
    else setLoading(false)
  }, [])
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 3500); return () => window.clearTimeout(timer) }, [notice])

  if (!adminReady) return <AuthScreen onAuthed={() => { setAdminReady(true); setLoading(true); loadAdminData().then(setData).catch(error => setNotice(error.message)).finally(() => setLoading(false)) }} />
  if (loading || !data) return <div className="loading-screen"><div className="loading-mark"><Package size={22} /></div><span>Loading your workspace</span></div>

  const activePage = nav.find(item => item.id === page) ?? nav[0]
  const handlePage = (next: string) => { setPage(next); setMenuOpen(false); setQuery('') }
  const refresh = () => { setLoading(true); loadAdminData().then(setData).catch(error => setNotice(error.message)).finally(() => setLoading(false)) }
  const handlePrimaryAction = () => setDialog(page === 'team' ? 'team' : page === 'inventory' ? 'inventory' : page === 'sessions' ? 'schedule' : null)

    return <div className="app-shell">
    <aside className={menuOpen ? 'sidebar sidebar-open' : 'sidebar'}>
      <div className="brand"><div className="brand-mark"><Package size={21} strokeWidth={2.5} /></div><div><strong>StockCount</strong><span>ADMIN CONSOLE</span></div><button className="icon-button sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
      <div className="workspace-switcher"><div className="workspace-avatar">NS</div><div><span>Workspace</span><strong>{data.org.name}</strong></div><ChevronDown size={15} /></div>
      <nav className="main-nav">{nav.map(item => { const Icon = item.icon; return <button key={item.id} className={page === item.id ? 'nav-item active' : 'nav-item'} onClick={() => handlePage(item.id)}><Icon size={18} /><span>{item.label}</span>{item.id === 'sessions' && data.sessions.filter(session => session.status === 'under_review').length > 0 && <b className="nav-count">{data.sessions.filter(session => session.status === 'under_review').length}</b>}</button> })}</nav>
      <div className="sidebar-bottom"><div className="support-link"><CircleHelp size={17} /><span>Help center</span><ArrowUpRight size={14} /></div><div className="profile"><div className="avatar avatar-olive">AM</div><div><strong>Ava Moyo</strong><span>Administrator</span></div><button className="icon-button" aria-label="Sign out"><LogOut size={16} /></button></div></div>
    </aside>
    {menuOpen && <button className="mobile-overlay" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}
    <main className="main-content">
      <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu size={21} /></button><div className="breadcrumbs"><span>Workspace</span><span>/</span><strong>{activePage.label}</strong></div><div className="topbar-actions"><div className="connection"><span className="status-dot" />{data.source === 'neon' ? 'Connected to StockInventorySystem' : 'Demo mode'}</div><button className="icon-button"><CircleHelp size={19} /></button><button className="icon-button" onClick={() => { signOutAdmin(); setAdminReady(false); setData(null) }} aria-label="Sign out"><LogOut size={17} /></button><div className="top-avatar">AM</div></div></header>
      <div className="page-wrap"><div className="page-heading"><div><p className="eyebrow">{activePage.id === 'overview' ? 'Saturday, September 5, 2026' : 'Workspace management'}</p><h1>{activePage.label}</h1></div><div className="heading-actions">{page === 'overview' && <button className="button button-primary" onClick={() => handlePage('sessions')}><Plus size={17} />New count session</button>}{page === 'inventory' && <><button className="button button-secondary" onClick={() => setDialog('import')}><Download size={17} />Import Excel</button><button className="button button-primary" onClick={handlePrimaryAction}><Plus size={17} />Add item</button></>}{page === 'team' && <button className="button button-primary" onClick={handlePrimaryAction}><Plus size={17} />Invite teammate</button>}{page === 'sessions' && <button className="button button-primary" onClick={handlePrimaryAction}><Plus size={17} />Schedule count</button>}</div></div>
        {notice && <div className="notice"><Cloud size={16} />{notice}<button onClick={() => setNotice('')}><X size={15} /></button></div>}
        {page === 'overview' && <Overview data={data} onNavigate={handlePage} />}
        {page === 'inventory' && <Inventory data={data} query={query} setQuery={setQuery} />}
        {page === 'sessions' && <Sessions data={data} query={query} setQuery={setQuery} />}
        {page === 'team' && <Team data={data} setData={setData} />}
        {page === 'locations' && <Locations data={data} setData={setData} />}
        {page === 'activity' && <ActivityPage data={data} />}
        {page === 'settings' && <SettingsPage data={data} setData={setData} onSaved={() => setNotice('Settings saved to the shared workspace.')} />}
      </div>
    </main>
    {dialog === 'team' && <InviteDialog data={data} onClose={() => setDialog(null)} onCreated={user => { setData({ ...data, users: [...data.users, user] }); setDialog(null); setNotice('Invitation created. The teammate can complete setup in the app.') }} />}
    {dialog === 'inventory' && <ItemDialog data={data} onClose={() => setDialog(null)} onCreated={item => { setData({ ...data, items: [...data.items, item] }); setDialog(null); setNotice('Inventory item added to the shared catalogue.') }} />}
    {dialog === 'import' && <ImportDialog data={data} onClose={() => setDialog(null)} onCreated={items => { setData({ ...data, items: [...items, ...data.items] }); setDialog(null); setNotice(`${items.length} products imported into the shared catalogue.`) }} />}
    {dialog === 'schedule' && <ScheduleDialog data={data} onClose={() => setDialog(null)} onCreated={sessions => { setData({ ...data, sessions: [...sessions, ...data.sessions] }); setDialog(null); setNotice('Count session scheduled. Products were allocated across the selected counters.') }} />}
  </div>
}

function Overview({ data, onNavigate }: { data: AdminData; onNavigate: (page: string) => void }) {
  const active = data.sessions.filter(session => ['in_progress', 'under_review', 'submitted'].includes(session.status)).length
  const reviewed = data.sessions.filter(session => session.status === 'approved').length
  const stockValue = data.items.reduce((sum, item) => sum + item.system_qty, 0)
  return <div className="content-stack"><section className="welcome-banner"><div><span className="banner-kicker"><span className="status-dot" />Workspace health</span><h2>Your inventory, at a glance.</h2><p>Keep counts moving and catch variances before they become expensive.</p></div><div className="banner-art"><div className="art-ring ring-one" /><div className="art-ring ring-two" /><Boxes size={66} strokeWidth={1.1} /></div></section>
    <section className="stat-grid"><StatCard label="Items in catalogue" value={data.items.length.toString()} detail="Across 3 active zones" icon={Package} tone="mint" /><StatCard label="Active counts" value={active.toString()} detail={`${data.sessions.filter(s => s.status === 'under_review').length} need review`} icon={ClipboardList} tone="yellow" /><StatCard label="Approved counts" value={reviewed.toString()} detail="This counting cycle" icon={ShieldCheck} tone="blue" /><StatCard label="Units on hand" value={stockValue.toLocaleString()} detail="System quantity" icon={Archive} tone="peach" /></section>
    <div className="two-column"><section className="panel panel-large"><div className="panel-header"><div><p className="panel-kicker">Keep an eye on this</p><h3>Count sessions</h3></div><button className="text-button" onClick={() => onNavigate('sessions')}>View all <ArrowUpRight size={15} /></button></div><div className="session-list">{data.sessions.slice(0, 4).map(session => <SessionRow key={session.id} session={session} data={data} />)}</div></section><section className="panel"><div className="panel-header"><div><p className="panel-kicker">Your workspace</p><h3>Team pulse</h3></div><button className="icon-button"><SlidersHorizontal size={17} /></button></div><div className="team-pulse"><div className="pulse-number">{data.users.filter(user => user.is_active).length}<span> active teammates</span></div><div className="role-bar"><span style={{ width: `${data.users.filter(user => user.role === 'counter').length / data.users.length * 100}%` }} /><span style={{ width: `${data.users.filter(user => user.role === 'auditor').length / data.users.length * 100}%` }} /><span style={{ width: `${data.users.filter(user => user.role === 'admin').length / data.users.length * 100}%` }} /></div><div className="legend"><span><i className="dot dot-green" />Counters <b>{data.users.filter(user => user.role === 'counter').length}</b></span><span><i className="dot dot-blue" />Auditors <b>{data.users.filter(user => user.role === 'auditor').length}</b></span><span><i className="dot dot-dark" />Admins <b>{data.users.filter(user => user.role === 'admin').length}</b></span></div></div><div className="mini-callout"><Wifi size={16} /><span><strong>All systems operational</strong><small>Last sync just now</small></span></div></section></div>
    <section className="panel activity-panel"><div className="panel-header"><div><p className="panel-kicker">Recent changes</p><h3>Activity log</h3></div><button className="text-button" onClick={() => onNavigate('activity')}>See activity <ArrowUpRight size={15} /></button></div><ActivityList data={data} limit={4} /></section>
  </div>
}

function StatCard({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: typeof Package; tone: string }) { return <div className={`stat-card tone-${tone}`}><div className="stat-icon"><Icon size={18} /></div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div> }
function SessionRow({ session, data }: { session: AdminData['sessions'][number]; data: AdminData }) { return <div className="session-row"><div className="session-symbol"><ClipboardList size={17} /></div><div className="session-main"><strong>{session.name}</strong><span>{locationName(session.location_id, data)} · {zoneName(session.zone_id, data)}</span></div><div className={`status-pill status-${session.status}`}><span />{statusLabels[session.status]}</div><div className="session-owner"><div className="avatar avatar-small">{initials(displayName(session.assigned_counter_id, data))}</div><span>{displayName(session.assigned_counter_id, data).split(' ')[0]}</span></div><span className="row-date">{formatDate(session.created_at)}</span></div> }

function Inventory({ data, query, setQuery }: { data: AdminData; query: string; setQuery: (value: string) => void }) { const filtered = data.items.filter(item => `${item.name} ${item.sku} ${item.category}`.toLowerCase().includes(query.toLowerCase())); return <div className="content-stack"><section className="filter-bar"><div className="search-box"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search items, SKUs or categories" /></div><button className="filter-button"><SlidersHorizontal size={16} />Filters</button><span className="result-count">{filtered.length} items</span></section><section className="panel table-panel"><div className="table-toolbar"><div><p className="panel-kicker">Master catalogue</p><h3>Inventory items</h3></div><button className="icon-button"><Download size={17} /></button></div><div className="table-scroll"><table><thead><tr><th>Item</th><th>SKU</th><th>Location / zone</th><th>On hand</th><th>Updated</th><th /></tr></thead><tbody>{filtered.map(item => <tr key={item.id}><td><div className="item-name"><div className="item-thumb"><Package size={17} /></div><strong>{item.name}</strong></div></td><td><code>{item.sku}</code></td><td><span className="muted">{zoneName(item.zone_id, data)}</span></td><td><strong>{item.system_qty}</strong> <span className="muted">{item.unit}s</span></td><td className="muted">{formatDate(item.updated_at)}</td><td><button className="icon-button"><ChevronDown size={16} /></button></td></tr>)}</tbody></table></div></section></div> }

function Sessions({ data, query, setQuery }: { data: AdminData; query: string; setQuery: (value: string) => void }) { const filtered = data.sessions.filter(session => `${session.name} ${statusLabels[session.status]}`.toLowerCase().includes(query.toLowerCase())); return <div className="content-stack"><section className="filter-bar"><div className="search-box"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search count sessions" /></div><button className="filter-button"><SlidersHorizontal size={16} />All statuses <ChevronDown size={14} /></button><span className="result-count">{filtered.length} sessions</span></section><section className="panel table-panel"><div className="table-toolbar"><div><p className="panel-kicker">Inventory control</p><h3>All count sessions</h3></div><div className="session-summary"><span className="status-dot" />{data.sessions.filter(s => s.status === 'under_review').length} awaiting review</div></div><div className="table-scroll"><table><thead><tr><th>Session</th><th>Status</th><th>Location</th><th>Assigned to</th><th>Started</th><th /></tr></thead><tbody>{filtered.map(session => <tr key={session.id}><td><strong>{session.name}</strong><small className="table-sub">{session.mode} count</small></td><td><div className={`status-pill status-${session.status}`}><span />{statusLabels[session.status]}</div></td><td className="muted">{locationName(session.location_id, data)}<small className="table-sub">{zoneName(session.zone_id, data)}</small></td><td><div className="person-cell"><div className="avatar avatar-small">{initials(displayName(session.assigned_counter_id, data))}</div>{displayName(session.assigned_counter_id, data)}</div></td><td className="muted">{formatDate(session.created_at)}</td><td><button className="icon-button"><ChevronDown size={16} /></button></td></tr>)}</tbody></table></div></section></div> }

function Team({ data, setData }: { data: AdminData; setData: (data: AdminData) => void }) { const toggle = async (id: string, value: boolean) => { try { await updateUserStatus(id, value); setData({ ...data, users: data.users.map(user => user.id === id ? { ...user, is_active: value } : user) }) } catch { /* shared database errors are surfaced by the next refresh */ } }; return <div className="content-stack"><section className="team-summary"><div><span className="panel-kicker">People with access</span><h2>{data.users.filter(user => user.is_active).length} active teammates</h2><p>Manage who can count, review, and administer this workspace.</p></div><div className="avatar-stack">{data.users.filter(user => user.is_active).slice(0, 5).map(user => <div className="avatar" key={user.id} title={user.full_name}>{initials(user.full_name)}</div>)}</div></section><section className="panel table-panel"><div className="table-toolbar"><div><p className="panel-kicker">Access control</p><h3>Team members</h3></div><button className="filter-button"><SlidersHorizontal size={16} />Filter role</button></div><div className="table-scroll"><table><thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Joined</th><th /></tr></thead><tbody>{data.users.map(user => <tr key={user.id}><td><div className="person-cell"><div className={`avatar avatar-small ${user.role === 'admin' ? 'avatar-olive' : ''}`}>{initials(user.full_name)}</div><span><strong>{user.full_name}</strong><small className="table-sub">{user.email}</small></span></div></td><td><span className="role-label">{roleLabels[user.role]}</span></td><td><button className={user.is_active ? 'toggle active' : 'toggle'} onClick={() => toggle(user.id, !user.is_active)}><span />{user.is_active ? 'Active' : 'Inactive'}</button></td><td className="muted">{formatDate(user.created_at)}</td><td><button className="icon-button"><ChevronDown size={16} /></button></td></tr>)}</tbody></table></div></section></div> }

function Locations({ data, setData }: { data: AdminData; setData: (data: AdminData) => void }) {
  const [showAddLocation, setShowAddLocation] = useState(false)
  const [addZoneFor, setAddZoneFor] = useState<AdminData['locations'][number] | null>(null)
  return <>
    <div className="content-stack">
      <section className="locations-toolbar"><div><p className="panel-kicker">Organize your workspace</p><h3>Locations & zones</h3></div><div className="locations-toolbar-actions"><button className="button button-secondary" onClick={() => setAddZoneFor(addZoneFor ?? data.locations[0] ?? null)}><Plus size={16} />Add zone</button><button className="button button-primary" onClick={() => setShowAddLocation(true)}><Plus size={16} />Add location</button></div></section>
      {!data.locations.length && <section className="empty-locations"><Boxes size={26} /><h3>No locations yet</h3><p>Create your first location (warehouse, store, or site), then add zones inside it. Products are organized by zone, and counts run per zone.</p><button className="button button-primary" onClick={() => setShowAddLocation(true)}><Plus size={17} />Create first location</button></section>}
      <section className="location-grid">{data.locations.map(location => <article className="location-card" key={location.id}><div className="location-card-top"><div className="location-icon"><Boxes size={19} /></div><span className="location-type">{location.type}</span><button className="icon-button"><ChevronDown size={16} /></button></div><h3>{location.name}</h3><p>{location.address}</p><div className="zone-list">{data.zones.filter(zone => zone.location_id === location.id).map(zone => <span key={zone.id}><i />{zone.name}<b>{data.items.filter(item => item.zone_id === zone.id).length}</b></span>)}{!data.zones.some(zone => zone.location_id === location.id) && <span className="no-zones">No zones yet<button className="text-button" onClick={() => setAddZoneFor(location)}>Add zone</button></span>}</div><button className="button button-secondary add-zone-button" onClick={() => setAddZoneFor(location)}><Plus size={15} />Add zone</button></article>)}</section>
      <section className="panel connection-panel"><div className="connection-icon"><Database size={20} /></div><div><p className="panel-kicker">Source connection</p><h3>StockInventorySystem connection</h3><p>This admin console and the counter/auditor app read and write through the same shared inventory API.</p></div><div className="connected-badge"><Check size={14} />{isNeonConfigured ? 'Connected' : 'Demo preview'}</div></section>
    </div>
    {showAddLocation && <AddLocationDialog data={data} onClose={() => setShowAddLocation(false)} onCreated={location => { setData({ ...data, locations: [...data.locations, location] }); setShowAddLocation(false) }} />}
    {addZoneFor && <AddZoneDialog location={addZoneFor} onClose={() => setAddZoneFor(null)} onCreated={zone => { setData({ ...data, zones: [...data.zones, zone] }); setAddZoneFor(null) }} />}
  </>
}

function AddLocationDialog({ data, onClose, onCreated }: { data: AdminData; onClose: () => void; onCreated: (location: AdminData['locations'][number]) => void }) {
  const [name, setName] = useState(''); const [type, setType] = useState<'warehouse' | 'store' | 'site'>('store'); const [address, setAddress] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { onCreated(await createLocation(data.org.id, { name, type, address })) } catch (err) { setError(err instanceof Error ? err.message : 'Unable to create location') } finally { setBusy(false) } }
  return <Dialog title="Add location" description="A location is a warehouse, store, or site. You'll add zones inside it next." onClose={onClose}><form className="dialog-form" onSubmit={submit}><label>Location name<input value={name} onChange={event => setName(event.target.value)} required placeholder="Central Warehouse" /></label><label>Type<select value={type} onChange={event => setType(event.target.value as 'warehouse' | 'store' | 'site')}><option value="warehouse">Warehouse</option><option value="store">Store</option><option value="site">Site</option></select></label><label>Address<input value={address} onChange={event => setAddress(event.target.value)} placeholder="14 Samora Machel Ave" /></label>{error && <div className="auth-error">{error}</div>}<div className="dialog-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Creating...' : 'Add location'}</button></div></form></Dialog>
}

function AddZoneDialog({ location, onClose, onCreated }: { location: AdminData['locations'][number]; onClose: () => void; onCreated: (zone: AdminData['zones'][number]) => void }) {
  const [name, setName] = useState(''); const [code, setCode] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { onCreated(await createZone(location.id, { name, code })) } catch (err) { setError(err instanceof Error ? err.message : 'Unable to create zone') } finally { setBusy(false) } }
  return <Dialog title="Add zone" description={`Create a zone inside ${location.name}. Products and counts are organized by zone.`} onClose={onClose}><form className="dialog-form" onSubmit={submit}><label>Zone name<input value={name} onChange={event => setName(event.target.value)} required placeholder="Dry Goods" /></label><label>Zone code<input value={code} onChange={event => setCode(event.target.value)} placeholder="DW-01" /></label>{error && <div className="auth-error">{error}</div>}<div className="dialog-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Creating...' : 'Add zone'}</button></div></form></Dialog>
}

function ActivityList({ data, limit }: { data: AdminData; limit?: number }) { const logs = limit ? data.logs.slice(0, limit) : data.logs; return <div className="activity-list">{logs.map(log => <div className="activity-item" key={log.id}><div className="activity-mark"><Check size={14} /></div><div><strong>{activityLabel(log.action, log.entity_type)}</strong><span>by {displayName(log.actor_id, data)} · {formatDate(log.created_at)}</span></div><ArrowUpRight size={15} className="activity-arrow" /></div>)}</div> }
function activityLabel(action: string, entity: string) { const labels: Record<string, string> = { approved: 'Count session approved', submitted: 'Count session submitted', updated: `${entity[0].toUpperCase() + entity.slice(1)} updated`, deactivated: 'Team member deactivated' }; return labels[action] ?? `${action[0].toUpperCase() + action.slice(1)} recorded` }
function ActivityPage({ data }: { data: AdminData }) { return <div className="content-stack"><section className="panel activity-full"><div className="panel-header"><div><p className="panel-kicker">A clear record of change</p><h3>Workspace activity</h3></div><button className="filter-button"><Download size={16} />Export log</button></div><ActivityList data={data} /></section></div> }

function SettingsPage({ data, setData, onSaved }: { data: AdminData; setData: (data: AdminData) => void; onSaved: () => void }) { const [pct, setPct] = useState(data.org.variance_threshold_pct); const [units, setUnits] = useState(data.org.variance_threshold_units); const save = async () => { await updateThresholds(data.org.id, pct, units); setData({ ...data, org: { ...data.org, variance_threshold_pct: pct, variance_threshold_units: units } }); onSaved() }; return <div className="settings-grid"><section className="panel settings-panel"><div className="panel-header"><div><p className="panel-kicker">Organization</p><h3>{data.org.name}</h3></div><div className="setting-mark"><Settings size={19} /></div></div><label>Workspace name<input value={data.org.name} readOnly /></label><label>Variance threshold (%)<input type="number" value={pct} onChange={event => setPct(Number(event.target.value))} /></label><label>Variance threshold (units)<input type="number" value={units} onChange={event => setUnits(Number(event.target.value))} /></label><button className="button button-primary save-button" onClick={save}>Save changes</button></section><section className="panel settings-panel"><div className="panel-header"><div><p className="panel-kicker">Connection</p><h3>Database status</h3></div><div className="setting-mark setting-green"><Database size={19} /></div></div><div className="connection-status"><span className="status-dot" /><div><strong>{isNeonConfigured ? 'Connected to StockInventorySystem' : 'Running in demo mode'}</strong><p>{isNeonConfigured ? 'Changes are shared with the mobile app through the shared inventory API.' : 'Set VITE_API_URL and start the API to connect.'}</p></div></div><div className="settings-note"><ShieldCheck size={17} /><span>The database connection stays on the API server and is never sent to the browser.</span></div></section></div> }

function Dialog({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) {
  return <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section className="dialog" role="dialog" aria-modal="true"><div className="dialog-header"><div><p className="panel-kicker">Workspace action</p><h2>{title}</h2><p>{description}</p></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></div>{children}</section></div>
}

function InviteDialog({ data, onClose, onCreated }: { data: AdminData; onClose: () => void; onCreated: (user: AdminData['users'][number]) => void }) {
  const [fullName, setFullName] = useState(''); const [email, setEmail] = useState(''); const [role, setRole] = useState<'counter' | 'auditor'>('counter'); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { onCreated(await createUser(data.org.id, { full_name: fullName, email, role })) } catch (err) { setError(err instanceof Error ? err.message : 'Unable to create invitation') } finally { setBusy(false) } }
  return <Dialog title="Invite teammate" description="Create a counter or auditor account for this shop." onClose={onClose}><form className="dialog-form" onSubmit={submit}><label>Full name<input value={fullName} onChange={event => setFullName(event.target.value)} required placeholder="Tendai Ncube" /></label><label>Email address<input type="email" value={email} onChange={event => setEmail(event.target.value)} required placeholder="tendai@shop.co" /></label><label>Role<select value={role} onChange={event => setRole(event.target.value as 'counter' | 'auditor')}><option value="counter">Counter</option><option value="auditor">Auditor</option></select></label>{error && <div className="auth-error">{error}</div>}<div className="dialog-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Creating...' : 'Create invitation'}</button></div></form></Dialog>
}

function ItemDialog({ data, onClose, onCreated }: { data: AdminData; onClose: () => void; onCreated: (item: AdminData['items'][number]) => void }) {
  const [name, setName] = useState(''); const [sku, setSku] = useState(''); const [zoneId, setZoneId] = useState(data.zones[0]?.id ?? ''); const [quantity, setQuantity] = useState(0); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { onCreated(await createItem(data.org.id, { name, sku, zone_id: zoneId, unit: 'unit', system_qty: quantity })) } catch (err) { setError(err instanceof Error ? err.message : 'Unable to create item') } finally { setBusy(false) } }
  return <Dialog title="Add inventory item" description="Add a product to the shared catalogue before scheduling a count." onClose={onClose}><form className="dialog-form" onSubmit={submit}><label>Item name<input value={name} onChange={event => setName(event.target.value)} required placeholder="Sunrise Maize Meal 10kg" /></label><label>SKU<input value={sku} onChange={event => setSku(event.target.value)} required placeholder="SM-10KG" /></label><label>Zone<select value={zoneId} onChange={event => setZoneId(event.target.value)} required>{data.zones.map(zone => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label><label>System quantity<input type="number" min="0" value={quantity} onChange={event => setQuantity(Number(event.target.value))} required /></label>{error && <div className="auth-error">{error}</div>}<div className="dialog-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Adding...' : 'Add item'}</button></div></form></Dialog>
}

type ImportRow = { name: string; sku: string; barcode?: string; unit: string; category?: string; system_qty: number }

type SheetPreviewRow = Record<string, string>

type ParsedSheet = {
  fileName: string
  columns: string[]
  rows: SheetPreviewRow[]
  products: ImportRow[]
}

function normalizeHeader(value: string) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

const NAME_COLUMN_ALIASES = new Set(['name', 'product', 'productname', 'item', 'itemname', 'itemtitle', 'producttitle', 'title', 'goods', 'goodsname', 'itemdescription', 'productdescription', 'description'])
const SKU_COLUMN_ALIASES = new Set(['sku', 'productsku', 'itemsku', 'productcode', 'itemcode', 'productcodeid', 'stockcode', 'article', 'articleno', 'articlenumber', 'productno', 'itemno', 'partno', 'partnumber', 'reference', 'itemreference', 'productreference', 'code'])

function matchHeader(headers: string[], aliases: Set<string>) {
  return headers.find(header => {
    const normalizedHeader = normalizeHeader(header)
    return aliases.has(normalizedHeader) || [...aliases].some(alias => normalizedHeader.includes(alias) || alias.includes(normalizedHeader))
  })
}

function readSpreadsheetCell(row: Record<string, string>, aliases: Set<string>) {
  const key = Object.keys(row).find(candidate => {
    const normalizedCandidate = normalizeHeader(candidate)
    return aliases.has(normalizedCandidate) || [...aliases].some(alias => normalizedCandidate.includes(alias) || alias.includes(normalizedCandidate))
  })
  return key ? row[key] : ''
}

async function parseImportedSpreadsheet(file: File, existingItems: AdminData['items'] = []): Promise<ParsedSheet> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const worksheet = workbook.Sheets[workbook.SheetNames.find(sheetName => workbook.Sheets[sheetName] && !sheetName.startsWith('~')) ?? workbook.SheetNames[0]]
  if (!worksheet) throw new Error('No worksheet found in the selected file.')

  const matrix = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, defval: '', raw: false, blankrows: false })
  const headerIndex = matrix.findIndex(row => {
    const normalizedRow = row.map(value => normalizeHeader(String(value ?? '')))
    const hasName = normalizedRow.some(value => NAME_COLUMN_ALIASES.has(value) || [...NAME_COLUMN_ALIASES].some(alias => value.length >= 3 && (value.includes(alias) || alias.includes(value))))
    const hasSku = normalizedRow.some(value => SKU_COLUMN_ALIASES.has(value) || [...SKU_COLUMN_ALIASES].some(alias => value.length >= 3 && (value.includes(alias) || alias.includes(value))))
    return hasName && hasSku
  })
  if (headerIndex < 0) throw new Error('We couldn\'t find Name and SKU columns in this sheet. The import needs a column for product names (e.g. "Name", "Product", "Item", "Description") and a column for codes (e.g. "SKU", "Product Code", "Item Code", "Article"). Check the column headings and try again.')

  const headers = matrix[headerIndex].map(value => String(value ?? '').trim()).filter(Boolean)
  if (!headers.length) throw new Error('We couldn\'t find a header row with product names and SKU codes. Make sure the first row of your sheet lists column headings such as "Name" and "SKU", then try again.')

  const sheetRows = matrix.slice(headerIndex + 1).filter(row => row.some(cell => String(cell ?? '').trim()))
  const rows = sheetRows.map(row => Object.fromEntries(headers.map((header, idx) => [header, String(row[idx] ?? '').trim()])))

  const barcodeAliases = new Set(['barcode', 'upc', 'ean', 'gtin'])
  const unitAliases = new Set(['unit', 'uom', 'unitofmeasure', 'measure', 'unitofmeasurement'])
  const categoryAliases = new Set(['category', 'department', 'group', 'class', 'brand'])
  const qtyAliases = new Set(['quantity', 'qty', 'stock', 'stockqty', 'onhand', 'systemqty', 'unitsinstock', 'inventoryqty'])

  const products = rows
    .map(row => {
      const name = readSpreadsheetCell(row, NAME_COLUMN_ALIASES)
      const sku = readSpreadsheetCell(row, SKU_COLUMN_ALIASES)
      const barcode = readSpreadsheetCell(row, barcodeAliases)
      const unit = readSpreadsheetCell(row, unitAliases) || 'unit'
      const category = readSpreadsheetCell(row, categoryAliases) || undefined
      const system_qty = Number(String(readSpreadsheetCell(row, qtyAliases)).replace(/[^0-9.-]/g, '')) || 0
      return { name: String(name ?? '').trim(), sku: String(sku ?? '').trim(), barcode: barcode ? String(barcode).trim() : undefined, unit: String(unit).trim() || 'unit', category: category ? String(category).trim() : undefined, system_qty }
    })
    .filter(product => product.name && product.sku)

  if (!products.length) throw new Error('The sheet has Name and SKU columns, but no rows with both a name and a SKU were found. Remove empty rows and try again.')

  const seen = new Set<string>(); const existing = new Set(existingItems.map(item => item.sku.toLowerCase()));
  const duplicates = products.filter(product => {
    const key = product.sku.toLowerCase()
    const duplicate = seen.has(key) || existing.has(key)
    seen.add(key)
    return duplicate
  })
  if (duplicates.length) throw new Error(`Duplicate SKU found: ${duplicates[0].sku}`)

  return { fileName: file.name, columns: headers, rows, products }
}

function ImportDialog({ data, onClose, onCreated }: { data: AdminData; onClose: () => void; onCreated: (items: AdminData['items']) => void }) {
  const [zoneId, setZoneId] = useState(data.zones[0]?.id ?? '')
  const [rows, setRows] = useState<ImportRow[]>([])
  const [sheet, setSheet] = useState<ParsedSheet | null>(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const hasZones = data.zones.length > 0
  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setFileName(file.name); setError(''); setRows([]); setSheet(null)
    try {
      const parsed = await parseImportedSpreadsheet(file, data.items)
      setFileName(parsed.fileName)
      setSheet(parsed)
      setRows(parsed.products)
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to read spreadsheet') }
  }
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!rows.length || !zoneId) return; setBusy(true); setError(''); try { const items = await createItems(data.org.id, rows.map(row => ({ ...row, zone_id: zoneId }))); if (sheet) { try { await createExcelUpload(data.org.id, { fileName: sheet.fileName, columns: sheet.columns, rowsPreview: sheet.rows.slice(0, 50), importedCount: items.length, zoneId, rawData: sheet.rows }) } catch { /* best-effort upload save */ } } onCreated(items as AdminData['items']) } catch (err) { setError(err instanceof Error ? err.message : 'Unable to import products') } finally { setBusy(false) } }
  return <Dialog title="Import products" description="Upload an Excel or CSV file. Products will appear in Inventory and can then be selected when scheduling a count." onClose={onClose}><form className="dialog-form" onSubmit={submit}><div className="upload-dropzone"><Download size={22} /><strong>{fileName || 'Choose a spreadsheet'}</strong><small>Accepted: .xlsx, .xls, .csv. Required columns: Name and SKU.</small><label className="button button-secondary upload-button">Browse file<input type="file" accept=".xlsx,.xls,.csv" onChange={readFile} /></label></div>{!hasZones && <div className="auth-error">This workspace has no zones yet. Create a Location and a Zone in the Locations page first, then the import button will become available.</div>}{sheet && <>{hasZones && <label>Import all products into zone<select value={zoneId} onChange={event => setZoneId(event.target.value)} required>{data.zones.map(zone => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label>}<div className="import-preview"><div className="selection-heading selection-heading-import"><span>Imported sheet preview</span><small>{rows.length} products captured</small></div><div className="table-scroll"><table><thead><tr>{sheet.columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{sheet.rows.slice(0, 25).map((row, index) => <tr key={`${fileName}-${index}`}>{sheet.columns.map(column => <td key={`${column}-${index}`}>{row[column] || '—'}</td>)}</tr>)}</tbody></table></div></div></>}{error && <div className="auth-error">{error}</div>}<div className="dialog-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary" disabled={busy || !rows.length || !zoneId}>{busy ? 'Importing...' : `Import ${rows.length || ''} products`}</button></div></form></Dialog>
}

function ScheduleDialog({ data, onClose, onCreated }: { data: AdminData; onClose: () => void; onCreated: (sessions: AdminData['sessions']) => void }) {
  const [name, setName] = useState('')
  const [locationId, setLocationId] = useState(data.locations[0]?.id ?? '')
  const [zoneId, setZoneId] = useState(data.zones.find(zone => zone.location_id === data.locations[0]?.id)?.id ?? '')
  const [itemIds, setItemIds] = useState<string[]>([])
  const [counterIds, setCounterIds] = useState<string[]>([])
  const [mode, setMode] = useState<'blind' | 'visible' | 'double'>('blind')
  const [auditorId, setAuditorId] = useState(data.users.find(user => user.role === 'auditor' && user.is_active)?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [productSearch, setProductSearch] = useState('')

  const zones = data.zones.filter(zone => zone.location_id === locationId)
  const allItems = data.items.filter(item => item.zone_id === zoneId)
  const items = allItems.filter(item => `${item.name} ${item.sku} ${item.category || ''}`.toLowerCase().includes(productSearch.toLowerCase()))
  const counters = data.users.filter(user => user.role === 'counter' && user.is_active)
  const auditors = data.users.filter(user => user.role === 'auditor' && user.is_active)
  const allVisibleIds = items.map(i => i.id)
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => itemIds.includes(id))

  const toggle = (values: string[], value: string) => values.includes(value) ? values.filter(item => item !== value) : [...values, value]
  const toggleAll = () => { if (allSelected) { setItemIds(prev => prev.filter(id => !allVisibleIds.includes(id))) } else { setItemIds(prev => [...new Set([...prev, ...allVisibleIds])]) } }

  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { const sessions = await scheduleStockCount(data.org.id, { name, location_id: locationId, zone_id: zoneId, item_ids: itemIds, counter_ids: counterIds, mode, auditor_id: auditorId || undefined }); onCreated(sessions) } catch (err) { setError(err instanceof Error ? err.message : 'Unable to schedule count') } finally { setBusy(false) } }

  return <Dialog title="Schedule a count" description="Select products and counters. StockCount will split the products between counters automatically so no product is assigned twice." onClose={onClose}>
    <form className="dialog-form schedule-form" onSubmit={submit}>
      <label>Count name<input value={name} onChange={event => setName(event.target.value)} required placeholder="March dry goods cycle" /></label>
      <div className="form-grid">
        <label>Location<select value={locationId} onChange={event => { setLocationId(event.target.value); setZoneId(data.zones.find(zone => zone.location_id === event.target.value)?.id ?? ''); setItemIds([]); setProductSearch('') }} required>{data.locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label>Zone<select value={zoneId} onChange={event => { setZoneId(event.target.value); setItemIds([]); setProductSearch('') }} required>{zones.map(zone => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label>
      </div>
      <div className="selection-section">
        <div className="selection-heading">
          <div className="selection-heading-row"><span>Products to count</span><small>{itemIds.length} of {allItems.length} selected</small></div>
          {allItems.length > 0 && <div className="product-search-bar"><Search size={15} /><input value={productSearch} onChange={event => setProductSearch(event.target.value)} placeholder="Search products by name, SKU or category..." /></div>}
        </div>
        <div className="selection-list product-selection-list">
          {allItems.length > 0 && <label className="selection-row select-all-row"><input type="checkbox" checked={allSelected} onChange={toggleAll} /><span><strong>{allSelected ? 'Deselect all' : 'Select all products'}</strong><small>{allVisibleIds.length} products match your search</small></span></label>}
          {items.map(item => <label className="selection-row product-row" key={item.id}><input type="checkbox" checked={itemIds.includes(item.id)} onChange={() => setItemIds(toggle(itemIds, item.id))} /><div className="product-info"><strong>{item.name}</strong><small><code>{item.sku}</code>{item.category && <span className="product-category">{item.category}</span>}</small><span className="product-qty">{item.system_qty} {item.unit}s on hand</span></div></label>)}
          {!items.length && productSearch && <p className="empty-selection">No products match "{productSearch}"</p>}
          {!allItems.length && <p className="empty-selection">No products exist in this zone yet. Import products from the Inventory page first.</p>}
        </div>
      </div>
      <div className="selection-section">
        <div className="selection-heading"><span>Counters</span><small>{counterIds.length} selected</small></div>
        <div className="selection-list">{counters.map(counter => <label className="selection-row" key={counter.id}><input type="checkbox" checked={counterIds.includes(counter.id)} onChange={() => setCounterIds(toggle(counterIds, counter.id))} /><span><strong>{counter.full_name}</strong><small>{counter.email}</small></span></label>)}{!counters.length && <p className="empty-selection">No active counters. Invite teammates first.</p>}</div>
      </div>
      <div className="form-grid">
        <label>Count mode<select value={mode} onChange={event => setMode(event.target.value as 'blind' | 'visible' | 'double')}><option value="blind">Blind (counter cannot see system qty)</option><option value="visible">Visible (system qty shown)</option><option value="double">Double count (two counters)</option></select></label>
        <label>Auditor<select value={auditorId} onChange={event => setAuditorId(event.target.value)}><option value="">No auditor</option>{auditors.map(auditor => <option key={auditor.id} value={auditor.id}>{auditor.full_name}</option>)}</select></label>
      </div>
      {error && <div className="auth-error">{error}</div>}
      <div className="dialog-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy || !itemIds.length || !counterIds.length}>{busy ? 'Scheduling...' : `Schedule ${itemIds.length || ''} products`}</button></div>
    </form>
  </Dialog>
}

function AuthScreen({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<'signin' | 'create'>('signin')
  const [shopName, setShopName] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmationSent, setConfirmationSent] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      if (mode === 'create') {
        if (password !== confirmPassword) throw new Error('Passwords do not match')
        const result = await createShopAdmin(shopName, fullName, email, password)
        if ('requiresConfirmation' in result) { setConfirmationSent(true); return }
      } else await signInAdmin(email, password)
      onAuthed()
    }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to complete request') }
    finally { setBusy(false) }
  }
  return <div className="auth-screen"><div className="auth-card"><div className="brand auth-brand"><div className="brand-mark"><Package size={21} /></div><div><strong>StockCount</strong><span>ADMIN CONSOLE</span></div></div>{confirmationSent ? <><p className="eyebrow">Check your inbox</p><h1>Confirm your email</h1><p className="auth-copy">We sent a confirmation link to <strong>{email}</strong>. Confirm it, then return here and sign in to finish creating your shop.</p><button className="button button-primary auth-submit" onClick={() => { setConfirmationSent(false); setMode('signin') }}>Continue to sign in</button></> : <><p className="eyebrow">{mode === 'create' ? 'Start a workspace' : 'Administrator access'}</p><h1>{mode === 'create' ? 'Create your shop' : 'Welcome back'}</h1><p className="auth-copy">{mode === 'create' ? 'Set up the workspace that your counters and auditors will use.' : 'Sign in to manage inventory counts and assignments.'}</p><form onSubmit={submit} className="auth-form">{mode === 'create' && <><label>Shop name<input value={shopName} onChange={event => setShopName(event.target.value)} required placeholder="New Shop" /></label><label>Your full name<input value={fullName} onChange={event => setFullName(event.target.value)} required placeholder="Ava Moyo" /></label></>}<label>Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} required placeholder="admin@shop.co" /></label><label>Password<input type="password" minLength={6} value={password} onChange={event => setPassword(event.target.value)} required placeholder="At least 6 characters" /></label>{mode === 'create' && <label>Confirm password<input type="password" minLength={6} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required placeholder="Repeat your password" /></label>}{error && <div className="auth-error">{error}</div>}<button className="button button-primary auth-submit" disabled={busy}>{busy ? 'Please wait...' : mode === 'create' ? 'Create shop' : 'Sign in'}</button></form><button className="auth-switch" onClick={() => { setMode(mode === 'create' ? 'signin' : 'create'); setError(''); setConfirmPassword('') }}>{mode === 'create' ? 'Already have an admin account? Sign in' : 'Create a new shop workspace'}</button>{!isNeonConfigured && <p className="demo-note">Demo mode is active. Add Supabase environment variables to persist this workspace and share it with the app.</p>}</>}</div></div>
}

