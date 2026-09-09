import { demoData } from './data'
import type { AdminData, CountSession, Item, Location, User, Zone } from './types'

const configuredUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/+$/, '').replace(/\/api$/, '')
export const apiUrl = configuredUrl || '/api'
export const isNeonConfigured = true

function token() { return localStorage.getItem('stockcount_admin_token') }
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!apiUrl) throw new Error('VITE_API_URL is not configured')
  const response = await fetch(apiUrl === '/api' ? path : `${apiUrl}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...options.headers } })
  const text = await response.text()
  let body: Record<string, unknown>
  try { body = text ? JSON.parse(text) : {} } catch { body = { error: text ? `${text} (${response.status})` : `Request failed (${response.status})` } }
  if (!response.ok) throw new Error(String(body.error || `Request failed (${response.status})`))
  return body as T
}

export async function signInAdmin(email: string, password: string) {
  if (!apiUrl) return { user: { id: 'demo-admin', email }, profile: demoData.users[0] }
  const result = await request<{ token: string; user: AdminData['users'][number] }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password, role: 'admin' }) })
  localStorage.setItem('stockcount_admin_token', result.token)
  return { user: result.user, profile: result.user }
}
export async function createShopAdmin(shopName: string, fullName: string, email: string, password: string) { if (!apiUrl) return { user: { id: 'demo-admin', email }, profile: { ...demoData.users[0], full_name: fullName, email } }; return request<{ requiresConfirmation: true; email: string }>('/api/auth/admin/signup', { method: 'POST', body: JSON.stringify({ shopName, fullName, email, password }) }) }
export async function signOutAdmin() { localStorage.removeItem('stockcount_admin_token') }
export async function loadAdminData(): Promise<AdminData> { return apiUrl ? request<AdminData>('/api/admin/data') : structuredClone(demoData) }
export async function updateUserStatus(id: string, isActive: boolean) { if (apiUrl) return request(`/api/admin/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive }) }) }
export async function deleteUser(id: string) { if (apiUrl) return request(`/api/admin/users/${id}`, { method: 'DELETE' }) }
export async function updateThresholds(orgId: string, pct: number, units: number) { if (apiUrl) return request(`/api/admin/organizations/${orgId}/thresholds`, { method: 'PATCH', body: JSON.stringify({ pct, units }) }) }
export async function createUser(orgId: string, input: { full_name: string; email: string; role: 'counter' | 'auditor' | 'admin'; phone?: string }): Promise<User> { return apiUrl ? request<User>('/api/admin/users', { method: 'POST', body: JSON.stringify(input) }) : { id: `demo-${Date.now()}`, org_id: orgId, ...input, is_active: true, setup_status: 'invited' as const, created_at: new Date().toISOString() } }
export async function createLocation(orgId: string, input: { name: string; type: 'warehouse' | 'store' | 'site'; address?: string }): Promise<Location> { return apiUrl ? request<Location>('/api/admin/locations', { method: 'POST', body: JSON.stringify(input) }) : { id: `demo-${Date.now()}`, org_id: orgId, ...input } }
export async function createZone(locationId: string, input: { name: string; code?: string }): Promise<Zone> { return apiUrl ? request<Zone>('/api/admin/zones', { method: 'POST', body: JSON.stringify({ location_id: locationId, ...input }) }) : { id: `demo-${Date.now()}`, location_id: locationId, ...input } }
export async function createItem(orgId: string, input: { zone_id: string; name: string; sku: string; unit: string; system_qty: number; barcode?: string; category?: string }) { const result = await createItems(orgId, [input]); return result[0] }
export async function createItems(orgId: string, inputs: Array<{ zone_id: string; name: string; sku: string; unit: string; system_qty: number; barcode?: string; category?: string }>): Promise<Item[]> { if (!inputs.length) throw new Error('There are no valid products to import'); const uniqueSkus = new Set(inputs.map(item => item.sku.toLowerCase())); if (uniqueSkus.size !== inputs.length) throw new Error('The spreadsheet contains duplicate SKUs'); return apiUrl ? request<Item[]>('/api/admin/items', { method: 'POST', body: JSON.stringify({ items: inputs }) }) : inputs.map((input, index) => ({ id: `demo-import-${Date.now()}-${index}`, org_id: orgId, ...input, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })) }
export async function createExcelUpload(orgId: string, input: { fileName: string; columns: string[]; rowsPreview: Record<string, string>[]; importedCount: number; zoneId?: string; rawData: Record<string, string>[] }): Promise<AdminData['uploads'][number]> { return apiUrl ? request<AdminData['uploads'][number]>('/api/admin/excel-uploads', { method: 'POST', body: JSON.stringify(input) }) : { id: `demo-upload-${Date.now()}`, org_id: orgId, file_name: input.fileName, columns: input.columns, rows_preview: input.rowsPreview, imported_count: input.importedCount, zone_id: input.zoneId, uploaded_by: 'demo-admin', created_at: new Date().toISOString() } }
export async function scheduleStockCount(orgId: string, input: { name: string; location_id: string; zone_id: string; item_ids: string[]; counter_ids: string[]; mode: 'blind' | 'visible' | 'double'; auditor_id?: string }): Promise<CountSession[]> { if (!input.item_ids.length || !input.counter_ids.length || input.item_ids.length < input.counter_ids.length) throw new Error('Select at least one product for each counter'); return apiUrl ? request<CountSession[]>('/api/admin/sessions', { method: 'POST', body: JSON.stringify(input) }) : input.counter_ids.map((counterId, index) => ({ id: `demo-${Date.now()}-${index}`, org_id: orgId, location_id: input.location_id, zone_id: input.zone_id, name: input.name, item_ids: input.item_ids.filter((_, itemIndex) => itemIndex % input.counter_ids.length === index), mode: input.mode, status: 'draft' as const, assigned_counter_id: counterId, auditor_id: input.auditor_id, created_at: new Date().toISOString() })) }
