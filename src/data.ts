import type { AdminData } from './types'

const today = new Date()
const daysAgo = (days: number) => new Date(today.getTime() - days * 86400000).toISOString()

export const demoData: AdminData = {
  source: 'demo',
  org: { id: 'org-1', name: 'New Shop', variance_threshold_pct: 5, variance_threshold_units: 10 },
  uploads: [],
  users: [
    { id: 'u1', org_id: 'org-1', full_name: 'Ava Moyo', email: 'ava@newshop.co', role: 'admin', is_active: true, created_at: daysAgo(90) },
    { id: 'u2', org_id: 'org-1', full_name: 'Tendai Ncube', email: 'tendai@newshop.co', role: 'counter', is_active: true, created_at: daysAgo(36) },
    { id: 'u3', org_id: 'org-1', full_name: 'Rudo Chirwa', email: 'rudo@newshop.co', role: 'counter', is_active: true, created_at: daysAgo(22) },
    { id: 'u4', org_id: 'org-1', full_name: 'Munashe Dube', email: 'munashe@newshop.co', role: 'auditor', is_active: true, created_at: daysAgo(18) },
    { id: 'u5', org_id: 'org-1', full_name: 'Kuda Sibanda', email: 'kuda@newshop.co', role: 'counter', is_active: false, created_at: daysAgo(12) },
  ],
  locations: [
    { id: 'loc1', org_id: 'org-1', name: 'Central Warehouse', type: 'warehouse', address: '14 Samora Machel Ave' },
    { id: 'loc2', org_id: 'org-1', name: 'Avondale Store', type: 'store', address: '88 King George Road' },
  ],
  zones: [
    { id: 'z1', location_id: 'loc1', name: 'Dry Goods', code: 'DW-01' },
    { id: 'z2', location_id: 'loc1', name: 'Cold Room', code: 'CR-01' },
    { id: 'z3', location_id: 'loc2', name: 'Shop Floor', code: 'SF-01' },
  ],
  items: [
    { id: 'i1', org_id: 'org-1', zone_id: 'z1', name: 'Sunrise Maize Meal 10kg', sku: 'SM-10KG', barcode: '600100100001', unit: 'bag', category: 'Staples', system_qty: 248, updated_at: daysAgo(1) },
    { id: 'i2', org_id: 'org-1', zone_id: 'z1', name: 'Golden Grain Rice 5kg', sku: 'GG-RICE-5', barcode: '600100100002', unit: 'bag', category: 'Staples', system_qty: 174, updated_at: daysAgo(1) },
    { id: 'i3', org_id: 'org-1', zone_id: 'z1', name: 'Clearwater Cooking Oil 2L', sku: 'CW-OIL-2', barcode: '600100100003', unit: 'bottle', category: 'Pantry', system_qty: 96, updated_at: daysAgo(2) },
    { id: 'i4', org_id: 'org-1', zone_id: 'z2', name: 'Fresh Milk 1L', sku: 'FM-1L', barcode: '600100100004', unit: 'carton', category: 'Chilled', system_qty: 82, updated_at: daysAgo(1) },
    { id: 'i5', org_id: 'org-1', zone_id: 'z2', name: 'Farmhouse Yoghurt 500ml', sku: 'FY-500', barcode: '600100100005', unit: 'cup', category: 'Chilled', system_qty: 61, updated_at: daysAgo(1) },
    { id: 'i6', org_id: 'org-1', zone_id: 'z3', name: 'Crisp & Co. Potato Chips', sku: 'CC-CHIPS', barcode: '600100100006', unit: 'packet', category: 'Snacks', system_qty: 132, updated_at: daysAgo(3) },
    { id: 'i7', org_id: 'org-1', zone_id: 'z3', name: 'Bright Cola 500ml', sku: 'BC-500', barcode: '600100100007', unit: 'bottle', category: 'Drinks', system_qty: 206, updated_at: daysAgo(2) },
    { id: 'i8', org_id: 'org-1', zone_id: 'z3', name: 'Cedar Soap Bar', sku: 'CS-BAR', barcode: '600100100008', unit: 'bar', category: 'Household', system_qty: 118, updated_at: daysAgo(4) },
  ],
  sessions: [
    { id: 's1', org_id: 'org-1', location_id: 'loc1', zone_id: 'z1', name: 'March dry goods cycle', status: 'under_review', mode: 'blind', assigned_counter_id: 'u2', auditor_id: 'u4', created_at: daysAgo(0) },
    { id: 's2', org_id: 'org-1', location_id: 'loc2', zone_id: 'z3', name: 'Avondale weekly count', status: 'in_progress', mode: 'visible', assigned_counter_id: 'u3', created_at: daysAgo(1) },
    { id: 's3', org_id: 'org-1', location_id: 'loc1', zone_id: 'z2', name: 'Cold room verification', status: 'approved', mode: 'double', assigned_counter_id: 'u2', auditor_id: 'u4', created_at: daysAgo(3) },
    { id: 's4', org_id: 'org-1', location_id: 'loc1', zone_id: 'z1', name: 'Opening count', status: 'draft', mode: 'blind', assigned_counter_id: 'u3', created_at: daysAgo(0) },
  ],
  logs: [
    { id: 'l1', org_id: 'org-1', entity_type: 'session', entity_id: 's3', action: 'approved', actor_id: 'u4', created_at: daysAgo(1) },
    { id: 'l2', org_id: 'org-1', entity_type: 'item', entity_id: 'i4', action: 'updated', actor_id: 'u1', created_at: daysAgo(1) },
    { id: 'l3', org_id: 'org-1', entity_type: 'user', entity_id: 'u5', action: 'deactivated', actor_id: 'u1', created_at: daysAgo(2) },
    { id: 'l4', org_id: 'org-1', entity_type: 'session', entity_id: 's1', action: 'submitted', actor_id: 'u2', created_at: daysAgo(0) },
  ],
}
