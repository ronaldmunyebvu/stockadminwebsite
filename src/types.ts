export type UserRole = 'counter' | 'auditor' | 'admin'
export type SessionStatus = 'draft' | 'in_progress' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'recount_assigned'
export type LocationType = 'warehouse' | 'store' | 'site'

export interface User { id: string; org_id: string; full_name: string; email: string; role: UserRole; is_active: boolean; setup_status?: 'active' | 'invited' | 'setup_complete'; created_at: string }
export interface Location { id: string; org_id: string; name: string; type: LocationType; address?: string }
export interface Zone { id: string; location_id: string; name: string; code?: string }
export interface Item { id: string; org_id: string; zone_id: string; name: string; sku: string; barcode?: string; unit: string; category?: string; system_qty: number; updated_at: string }
export interface CountSession { id: string; org_id: string; location_id: string; zone_id?: string; name: string; status: SessionStatus; mode: 'blind' | 'visible' | 'double'; assigned_counter_id?: string; auditor_id?: string; created_at: string }
export interface AuditLog { id: string; org_id: string; entity_type: string; entity_id: string; action: string; actor_id: string; reason?: string; created_at: string }
export interface ExcelUpload { id: string; org_id: string; file_name: string; columns: string[]; rows_preview: Record<string, string>[]; imported_count: number; zone_id?: string; uploaded_by?: string; created_at: string }
export interface AdminData { org: { id: string; name: string; variance_threshold_pct: number; variance_threshold_units: number }; users: User[]; locations: Location[]; zones: Zone[]; items: Item[]; sessions: CountSession[]; logs: AuditLog[]; uploads: ExcelUpload[]; source: 'demo' | 'neon' }
