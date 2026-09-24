import { demoData } from './data'
import type { AdminData, CountEntry, CountReport, CountSession, Item, Location, PaymentRecord, SalesSummary, Subscription, User, Zone } from './types'

const configuredUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/+$/, '').replace(/\/api$/, '')
export const apiUrl = configuredUrl || '/api'
export const isNeonConfigured = true

function token() { return localStorage.getItem('stockcount_admin_token') }

export class ApiError extends Error {
  code?: string
  status?: number
  payment?: { intent: string; plan_type?: string; amount?: number; label?: string }
  constructor(message: string, status?: number, code?: string, payment?: { intent: string; plan_type?: string; amount?: number; label?: string }) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.payment = payment
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!apiUrl) throw new Error('VITE_API_URL is not configured')
  const response = await fetch(apiUrl === '/api' ? path : `${apiUrl}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...options.headers } })
  const text = await response.text()
  let body: Record<string, unknown>
  try { body = text ? JSON.parse(text) : {} } catch { body = { error: text ? `${text} (${response.status})` : `Request failed (${response.status})` } }
  if (!response.ok) throw new ApiError(String(body.error || `Request failed (${response.status})`), response.status, typeof body.code === 'string' ? body.code : undefined, typeof body.payment === 'object' && body.payment ? body.payment as ApiError['payment'] : undefined)
  return body as T
}

function demoSubscription(): Subscription {
  return {
    org_name: demoData.org.name,
    plan_type: 'basic',
    plan_status: 'active',
    paid: true,
    expires_at: null,
    extra_member_slots: 0,
    members_allowed: 3,
    skus_allowed: 500,
    branches_allowed: 1,
    members_used: demoData.users.length,
    skus_used: demoData.items.length,
    branches_used: demoData.locations.length,
    renewal_amount: 7.5,
    currency: 'USD',
    test_mode: true,
    pricing: {
      basic: { price: 7.5, label: 'Basic', description: 'Up to 3 team members, 500 SKUs, 1 branch', members: 3, skus: 500, branches: 1 },
      extra_member: { price: 2.5, label: 'Extra member slot', description: 'One additional team member for a month', members: null, skus: null, branches: null },
      unlimited: { price: 15, label: 'Unlimited', description: 'Unlimited team members, SKUs, and branches', members: null, skus: null, branches: null }
    }
  }
}

export async function signInAdmin(identifier: string, password: string) {
  if (!apiUrl) return { user: { id: 'demo-admin', email: identifier }, profile: demoData.users[0], subscription: demoSubscription() }
  const result = await request<{ token: string; user: AdminData['users'][number]; subscription?: Subscription }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ identifier, email: identifier, password, role: 'admin' }) })
  localStorage.setItem('stockcount_admin_token', result.token)
  return { user: result.user, profile: result.user, subscription: result.subscription }
}
export async function getPaymentStatus(): Promise<Subscription> { return apiUrl ? request<Subscription>('/api/payments/status') : demoSubscription() }
export async function initiatePayment(intent: 'subscribe' | 'upgrade' | 'extra_member', planType?: 'basic' | 'unlimited', customerMsisdn?: string): Promise<{ test_mode: boolean; payment: PaymentRecord; pending?: boolean; status?: string; message?: string; subscription?: Subscription }> { return apiUrl ? request<{ test_mode: boolean; payment: PaymentRecord; pending?: boolean; status?: string; message?: string; subscription?: Subscription }>('/api/payments/initiate', { method: 'POST', body: JSON.stringify({ intent, plan_type: planType, customerMsisdn }) }) : { test_mode: true, payment: { id: `demo-${Date.now()}`, org_id: '', intent, plan_type: planType || 'basic', amount: intent === 'extra_member' ? 2.5 : planType === 'unlimited' ? 15 : 7.5, currency: 'USD', provider: 'ecocash', status: 'paid', created_at: new Date().toISOString() }, subscription: demoSubscription() } }
export async function createShopAdmin(shopName: string, fullName: string, identifier: string, password: string, logoUrl?: string, address?: string) { if (!apiUrl) return { user: { id: 'demo-admin', email: identifier }, profile: { ...demoData.users[0], full_name: fullName, email: identifier } }; return request<{ requiresOtp: true; requiresConfirmation: true; channel: 'sms' | 'email'; identifier: string; code?: string }>('/api/auth/admin/signup', { method: 'POST', body: JSON.stringify({ shopName, fullName, identifier, password, logoUrl: logoUrl || null, address: address || null }) }) }
export async function sendOtp(identifier: string, purpose = 'reset') { if (!apiUrl) return { ok: true, channel: 'email' as const, code: '123456' }; return request<{ ok: true; channel: 'sms' | 'email'; code?: string }>('/api/auth/otp/send', { method: 'POST', body: JSON.stringify({ identifier, purpose }) }) }
export async function verifyOtp(identifier: string, code: string, purpose = 'reset') { if (apiUrl) return request<{ ok: true }>('/api/auth/otp/verify', { method: 'POST', body: JSON.stringify({ identifier, code, purpose }) }) }
export async function resetPassword(identifier: string, code: string, password: string) { if (apiUrl) return request<{ ok: true }>('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ identifier, code, password }) }) }
export async function updateOrganization(patch: { name?: string; tagline?: string | null; logoUrl?: string | null; address?: string | null }) { if (!apiUrl) return { ...demoData.org } as AdminData['org']; return request<AdminData['org']>('/api/admin/organization', { method: 'PATCH', body: JSON.stringify({ name: patch.name, tagline: patch.tagline, logo_url: patch.logoUrl, address: patch.address }) }) }
export async function updateItem(id: string, patch: Partial<{ name: string; sku: string; unit: string; zone_id: string; system_qty: number; barcode?: string; category?: string; selling_price?: number }>): Promise<AdminData['items'][number]> { return apiUrl ? request<AdminData['items'][number]>(`/api/admin/items/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }) : ({ id, ...patch } as AdminData['items'][number]) }
export async function deleteItem(id: string) { if (apiUrl) return request<{ success: true }>(`/api/admin/items/${id}`, { method: 'DELETE' }) }
export async function deleteInventory() { if (apiUrl) return request<{ success: true; deleted: number }>('/api/admin/inventory', { method: 'DELETE', body: JSON.stringify({ confirm: 'DELETE' }) }) }
export async function signOutAdmin() { try { await request<{ ok: true }>('/api/auth/logout', { method: 'POST' }) } catch { } localStorage.removeItem('stockcount_admin_token') }
export async function deleteShop(confirm1: string, confirm2: string, shopName: string) { return request<{ success: boolean }>('/api/admin/org', { method: 'DELETE', body: JSON.stringify({ confirm1, confirm2, shopName }) }) }
export async function loadAdminData(): Promise<AdminData> { return apiUrl ? request<AdminData>('/api/admin/data') : structuredClone(demoData) }
export async function updateUserStatus(id: string, isActive: boolean) { if (apiUrl) return request(`/api/admin/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive }) }) }
export async function updateUser(id: string, patch: { full_name?: string; role?: 'admin' | 'counter' | 'auditor' | 'seller'; email?: string; phone?: string }): Promise<User> { return apiUrl ? request<User>(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }) : ({ id, org_id: '', ...patch, is_active: true, created_at: new Date().toISOString() } as User) }
export async function deleteUser(id: string) { if (apiUrl) return request(`/api/admin/users/${id}`, { method: 'DELETE' }) }
export async function updateThresholds(orgId: string, pct: number, units: number) { if (apiUrl) return request(`/api/admin/organizations/${orgId}/thresholds`, { method: 'PATCH', body: JSON.stringify({ pct, units }) }) }
export async function createUser(orgId: string, input: { full_name: string; email?: string; role: 'counter' | 'auditor' | 'admin' | 'seller'; phone?: string }): Promise<User> { return apiUrl ? request<User>('/api/admin/users', { method: 'POST', body: JSON.stringify({ full_name: input.full_name, email: input.email, phone: input.phone, role: input.role }) }) : { id: `demo-${Date.now()}`, org_id: orgId, ...input, email: input.email || input.phone, is_active: true, setup_status: 'invited' as const, created_at: new Date().toISOString() } }
export async function createLocation(orgId: string, input: { name: string; type: 'warehouse' | 'store' | 'site'; address?: string }): Promise<Location> { return apiUrl ? request<Location>('/api/admin/locations', { method: 'POST', body: JSON.stringify(input) }) : { id: `demo-${Date.now()}`, org_id: orgId, ...input } }
export async function createZone(locationId: string, input: { name: string; code?: string }): Promise<Zone> { return apiUrl ? request<Zone>('/api/admin/zones', { method: 'POST', body: JSON.stringify({ location_id: locationId, ...input }) }) : { id: `demo-${Date.now()}`, location_id: locationId, ...input } }
export async function createItem(orgId: string, input: { zone_id: string; name: string; sku: string; unit: string; system_qty: number; barcode?: string; category?: string; selling_price?: number }) { const result = await createItems(orgId, [input]); return result[0] }
export async function createItems(orgId: string, inputs: Array<{ zone_id: string; name: string; sku: string; unit: string; system_qty: number; barcode?: string; category?: string; selling_price?: number }>): Promise<Item[]> { if (!inputs.length) throw new Error('There are no valid products to import'); const uniqueSkus = new Set(inputs.map(item => item.sku.toLowerCase())); if (uniqueSkus.size !== inputs.length) throw new Error('The spreadsheet contains duplicate SKUs'); return apiUrl ? request<Item[]>('/api/admin/items', { method: 'POST', body: JSON.stringify({ items: inputs }) }) : inputs.map((input, index) => ({ id: `demo-import-${Date.now()}-${index}`, org_id: orgId, ...input, selling_price: Number(input.selling_price) || 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })) }
export async function createExcelUpload(orgId: string, input: { fileName: string; columns: string[]; rowsPreview: Record<string, string>[]; importedCount: number; zoneId?: string; rawData: Record<string, string>[] }): Promise<AdminData['uploads'][number]> { return apiUrl ? request<AdminData['uploads'][number]>('/api/admin/excel-uploads', { method: 'POST', body: JSON.stringify(input) }) : { id: `demo-upload-${Date.now()}`, org_id: orgId, file_name: input.fileName, columns: input.columns, rows_preview: input.rowsPreview, imported_count: input.importedCount, zone_id: input.zoneId, uploaded_by: 'demo-admin', created_at: new Date().toISOString() } }
export async function scheduleStockCount(orgId: string, input: { name: string; location_id?: string; zone_id?: string; item_ids: string[]; counter_ids: string[]; mode: 'blind' | 'visible' | 'double'; auditor_id?: string; auditor_sample_item_ids?: string[] }): Promise<CountSession[]> { if (!input.item_ids.length || !input.counter_ids.length || input.item_ids.length < input.counter_ids.length) throw new Error('Select at least one product for each counter'); const sampleIds = input.auditor_sample_item_ids || []; if (input.auditor_id && sampleIds.length && sampleIds.some(id => !input.item_ids.includes(id))) throw new Error('Sample products must be among the selected products'); return apiUrl ? request<CountSession[]>('/api/admin/sessions', { method: 'POST', body: JSON.stringify(input) }) : input.counter_ids.map((counterId, index) => ({ id: `demo-${Date.now()}-${index}`, org_id: orgId, location_id: input.location_id || '', zone_id: input.zone_id || '', name: input.name, item_ids: input.item_ids.filter((_, itemIndex) => itemIndex % input.counter_ids.length === index), auditor_sample_item_ids: input.auditor_id ? input.item_ids.filter(id => sampleIds.includes(id)) : null, mode: input.mode, status: 'draft' as const, assigned_counter_id: counterId, auditor_id: input.auditor_id, created_at: new Date().toISOString() })) }
export async function deleteSession(sessionId: string) { return request<{ success: boolean }>(`/api/admin/sessions/${sessionId}`, { method: 'DELETE' }) }
export async function getSessionEntries(sessionId: string): Promise<CountEntry[]> { return request<CountEntry[]>(`/api/admin/sessions/${sessionId}/entries`) }
export async function approveSession(sessionId: string) { return request<CountSession>(`/api/admin/sessions/${sessionId}/approve`, { method: 'POST' }) }
export async function rejectSession(sessionId: string, reason: string) { return request<CountSession>(`/api/admin/sessions/${sessionId}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }) }
export async function recountSession(sessionId: string, counterId?: string) { return request<CountSession>(`/api/admin/sessions/${sessionId}/recount`, { method: 'POST', body: JSON.stringify({ counterId }) }) }
export async function submitReport(sessionId: string, data: { summary?: string; report_type?: string }): Promise<CountReport> { return request<CountReport>(`/api/admin/sessions/${sessionId}/report`, { method: 'POST', body: JSON.stringify(data) }) }
export async function getSessionReport(sessionId: string): Promise<CountReport | null> { return request<CountReport | null>(`/api/admin/sessions/${sessionId}/report`) }
export async function getSales(from?: string, to?: string): Promise<SalesSummary> { const params = new URLSearchParams(); if (from) params.set('from', from); if (to) params.set('to', to); return request<SalesSummary>(`/api/admin/sales?${params}`) }
