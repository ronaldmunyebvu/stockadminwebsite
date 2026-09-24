require('dotenv').config()
const express = require('express')
const cors = require('cors')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { Pool } = require('pg')
const nodemailer = require('nodemailer')

const app = express()
const port = Number(process.env.PORT || 8787)
const jwtSecret = process.env.JWT_SECRET || 'change-this-secret'
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: process.env.VERCEL ? 1 : 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      allowExitOnIdle: true
    })
  : null
if (pool && !process.env.VERCEL) setInterval(() => { pool.query('SELECT 1').catch(() => {}) }, 60000)
async function runMigrations() { if (!pool || !shouldRunMigrations) return; try { await pool.query('ALTER TABLE count_sessions ALTER COLUMN location_id DROP NOT NULL'); console.log('Migration: location_id is now nullable on count_sessions') } catch (err) { if (err.code !== '42710' && err.code !== 'P0001') console.error('Migration error:', err.message) } const fkFixes = [ { table: 'count_sessions', column: 'assigned_counter_id', fk: 'count_sessions_assigned_counter_id_fkey' }, { table: 'count_sessions', column: 'assigned_counter_2_id', fk: 'count_sessions_assigned_counter_2_id_fkey' }, { table: 'count_sessions', column: 'auditor_id', fk: 'count_sessions_auditor_id_fkey' }, { table: 'audit_logs', column: 'actor_id', fk: 'audit_logs_actor_id_fkey' }, { table: 'excel_uploads', column: 'uploaded_by', fk: 'excel_uploads_uploaded_by_fkey' }, { table: 'count_entries', column: 'counted_by', fk: 'count_entries_counted_by_fkey' } ]; for (const { table, column, fk } of fkFixes) { try { if (table === 'count_entries') await pool.query(`ALTER TABLE ${table} ALTER COLUMN ${column} DROP NOT NULL`); await pool.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${fk}`); await pool.query(`ALTER TABLE ${table} ADD CONSTRAINT ${fk} FOREIGN KEY (${column}) REFERENCES users(id) ON DELETE SET NULL`); console.log(`Migration: ${table}.${column} now ON DELETE SET NULL`) } catch (err) { if (err.code !== '42710') console.error(`Migration FK error (${fk}):`, err.message) } } try { await pool.query("CREATE TABLE IF NOT EXISTS count_reports (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, session_id uuid NOT NULL REFERENCES count_sessions(id) ON DELETE CASCADE, submitted_by uuid REFERENCES users(id) ON DELETE SET NULL, report_type text NOT NULL CHECK (report_type IN ('auditor','admin')), summary text, items_summary jsonb NOT NULL DEFAULT '[]'::jsonb, total_items int NOT NULL DEFAULT 0, matched_items int NOT NULL DEFAULT 0, variance_items int NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'draft', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(session_id))"); console.log('Migration: count_reports table ensured') } catch (err) { console.error('Migration count_reports error:', err.message) } try { await pool.query('CREATE INDEX IF NOT EXISTS reports_org_idx ON count_reports(org_id)'); } catch (err) { } try { await pool.query('ALTER TABLE count_sessions ADD COLUMN IF NOT EXISTS auditor_sample_item_ids jsonb'); console.log('Migration: auditor_sample_item_ids added') } catch (err) { console.error('Migration auditor_sample_item_ids error:', err.message) } try { await pool.query("ALTER TABLE count_entries ADD COLUMN IF NOT EXISTS entry_role text NOT NULL DEFAULT 'counter'"); console.log('Migration: entry_role added') } catch (err) { console.error('Migration entry_role error:', err.message) } try { await pool.query('ALTER TABLE count_entries ADD COLUMN IF NOT EXISTS counter_entry_id uuid'); console.log('Migration: counter_entry_id added') } catch (err) { console.error('Migration counter_entry_id error:', err.message) } try { await pool.query("DO $$ BEGIN ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check; ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','counter','auditor','seller')); EXCEPTION WHEN others THEN NULL; END $$"); console.log('Migration: seller role allowed') } catch (err) { console.error('Migration seller role error:', err.message) } try { await pool.query(`CREATE TABLE IF NOT EXISTS sales (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, item_id uuid NOT NULL REFERENCES items(id), seller_id uuid REFERENCES users(id) ON DELETE SET NULL, quantity numeric NOT NULL CHECK (quantity > 0), unit_price numeric NOT NULL DEFAULT 0, total numeric NOT NULL DEFAULT 0, sold_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now())`); console.log('Migration: sales table ensured') } catch (err) { console.error('Migration sales table error:', err.message) } try { await pool.query('CREATE INDEX IF NOT EXISTS sales_org_idx ON sales(org_id)') } catch (err) { } try { await pool.query('CREATE INDEX IF NOT EXISTS sales_sold_at_idx ON sales(sold_at)') } catch (err) { } try { await pool.query('CREATE INDEX IF NOT EXISTS sales_seller_idx ON sales(seller_id)') } catch (err) { } }
const shouldRunMigrations = process.env.RUN_MIGRATIONS === 'true' || !process.env.VERCEL
runMigrations()
if (pool && shouldRunMigrations) pool.query("ALTER TABLE items ADD COLUMN IF NOT EXISTS selling_price numeric NOT NULL DEFAULT 0").catch(err => console.error('Migration selling_price failed:', err.message))
if (pool && shouldRunMigrations) {
  pool.query("ALTER TABLE users ALTER COLUMN email DROP NOT NULL").catch(err => console.error('Migration email nullable failed:', err.message))
  pool.query("DO $$ BEGIN ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check; ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','counter','auditor','seller')); EXCEPTION WHEN others THEN NULL; END $$").catch(err => console.error('Migration seller role failed:', err.message))
  pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_code text").catch(err => console.error('Migration otp_code failed:', err.message))
  pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_expires_at timestamptz").catch(err => console.error('Migration otp_expires_at failed:', err.message))
  pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_purpose text").catch(err => console.error('Migration otp_purpose failed:', err.message))
  pool.query("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url text").catch(err => console.error('Migration logo_url failed:', err.message))
  pool.query("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS tagline text").catch(err => console.error('Migration tagline failed:', err.message))
  pool.query("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address text").catch(err => console.error('Migration org address failed:', err.message))
  pool.query("ALTER TABLE sales ALTER COLUMN item_id DROP NOT NULL").catch(err => console.error('Migration sales item_id nullable failed:', err.message))
  pool.query("DO $$ BEGIN ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_item_id_fkey; ALTER TABLE sales ADD CONSTRAINT sales_item_id_fkey FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL; EXCEPTION WHEN others THEN NULL; END $$").catch(err => console.error('Migration sales fk failed:', err.message))
  pool.query("ALTER TABLE sales ADD COLUMN IF NOT EXISTS item_name text").catch(err => console.error('Migration sales item_name failed:', err.message))
  pool.query("UPDATE sales s SET item_name = i.name FROM items i WHERE s.item_id = i.id AND s.item_name IS NULL").catch(() => {})
  pool.query(`CREATE TABLE IF NOT EXISTS quotations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    seller_id uuid REFERENCES users(id) ON DELETE SET NULL,
    reference text NOT NULL,
    customer_name text NOT NULL,
    customer_contact text,
    notes text,
    status text NOT NULL DEFAULT 'sent',
    total numeric NOT NULL DEFAULT 0,
    valid_until date,
    created_at timestamptz NOT NULL DEFAULT now()
  )`).catch(err => console.error('Migration quotations table failed:', err.message))
  pool.query(`CREATE TABLE IF NOT EXISTS quotation_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_id uuid NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    item_id uuid REFERENCES items(id) ON DELETE SET NULL,
    item_name text NOT NULL,
    sku text,
    unit text NOT NULL DEFAULT 'unit',
    quantity numeric NOT NULL CHECK (quantity > 0),
    unit_price numeric NOT NULL DEFAULT 0,
    total numeric NOT NULL DEFAULT 0
  )`).catch(err => console.error('Migration quotation_items table failed:', err.message))
  pool.query("CREATE INDEX IF NOT EXISTS quotations_org_idx ON quotations(org_id)").catch(() => {})
  pool.query(`CREATE TABLE IF NOT EXISTS user_sessions (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    token_sig text NOT NULL,
    issued_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz
  )`).catch(err => console.error('Migration user_sessions table failed:', err.message))
  pool.query("CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions (user_id)").catch(() => {})
  pool.query("CREATE UNIQUE INDEX IF NOT EXISTS user_sessions_active_idx ON user_sessions (user_id) WHERE revoked_at IS NULL").catch(err => console.error('Migration user_sessions unique index failed:', err.message))
  pool.query("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_type text NOT NULL DEFAULT 'basic'").catch(err => console.error('Migration plan_type failed:', err.message))
  pool.query("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_status text NOT NULL DEFAULT 'active'").catch(err => console.error('Migration plan_status failed:', err.message))
  pool.query("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_expires_at timestamptz").catch(err => console.error('Migration plan_expires_at failed:', err.message))
  pool.query("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_extra_members integer NOT NULL DEFAULT 0").catch(err => console.error('Migration plan_extra_members failed:', err.message))
  pool.query("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_paid_at timestamptz").catch(err => console.error('Migration plan_paid_at failed:', err.message))
  pool.query("UPDATE organizations SET plan_status='active', plan_expires_at=COALESCE(plan_expires_at, now() + interval '12 months') WHERE plan_status='active' AND plan_expires_at IS NULL").catch(err => console.error('Migration plan backfill failed:', err.message))
  pool.query(`CREATE TABLE IF NOT EXISTS payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    intent text NOT NULL DEFAULT 'subscribe',
    plan_type text NOT NULL DEFAULT 'basic',
    amount numeric NOT NULL DEFAULT 0,
    currency text NOT NULL DEFAULT 'USD',
    provider text NOT NULL DEFAULT 'ecocash',
    provider_ref text,
    status text NOT NULL DEFAULT 'pending',
    paid_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`).catch(err => console.error('Migration payments table failed:', err.message))
  pool.query("CREATE INDEX IF NOT EXISTS payments_org_idx ON payments (org_id)").catch(() => {})
  pool.query("ALTER TABLE payments ADD COLUMN IF NOT EXISTS customer_msisdn text").catch(() => {})
}
app.use(cors({ origin: true, credentials: true }))
app.use((req, res, next) => (req.body ? next() : express.json({ limit: '5mb' })(req, res, next)))

const CURRENCY = 'USD'
const PRICING = {
  basic: { price: 7.5, label: 'Basic', description: 'Up to 3 team members (admin + 2), 500 SKUs, 1 branch', members: 3, skus: 500, branches: 1 },
  extra_member: { price: 2.5, label: 'Extra member slot', description: 'One additional team member for a month' },
  unlimited: { price: 15, label: 'Unlimited', description: 'Unlimited team members, SKUs, and branches', members: null, skus: null, branches: null }
}
const isPaymentTestMode = () => process.env.PAYMENT_TEST_MODE === 'true' || process.env.NODE_ENV !== 'production'

const ECOCASH_SANDBOX_BASE = 'https://developers.ecocash.co.zw/sandbox/payment/v1'
function ecoCashConfig() {
  const prod = String(process.env.ECOCASH_ENVIRONMENT || '').toLowerCase() === 'production'
  return {
    enabled: Boolean(process.env.ECOCASH_API_USERNAME && process.env.ECOCASH_API_PASSWORD && process.env.ECOCASH_MERCHANT_CODE && process.env.ECOCASH_MERCHANT_NUMBER && process.env.ECOCASH_MERCHANT_PIN),
    baseUrl: (prod ? process.env.ECOCASH_PRODUCTION_BASE_URL : process.env.ECOCASH_BASE_URL) || ECOCASH_SANDBOX_BASE,
    apiUsername: process.env.ECOCASH_API_USERNAME,
    apiPassword: process.env.ECOCASH_API_PASSWORD,
    merchantCode: process.env.ECOCASH_MERCHANT_CODE,
    merchantNumber: process.env.ECOCASH_MERCHANT_NUMBER,
    merchantPin: process.env.ECOCASH_MERCHANT_PIN,
    notifyUrl: process.env.ECOCASH_NOTIFY_URL,
    tranType: process.env.ECOCASH_TRAN_TYPE || 'MERCHANT',
    operationStatus: process.env.ECOCASH_TRANSACTION_OPERATION_STATUS || 'Charged',
    channel: process.env.ECOCASH_CHANNEL || 'Online',
    categoryCode: process.env.ECOCASH_PURCHASE_CATEGORY_CODE || 'Online Payment',
  }
}
function normalizeMsisdn(value) { const digits = String(value || '').replace(/[^\d]/g, ''); if (!digits) return ''; if (digits.startsWith('263')) return digits; if (digits.startsWith('0')) return '263' + digits.slice(1); return '263' + digits }
function ecocashAuth(cfg) { return 'Basic ' + Buffer.from(`${cfg.apiUsername}:${cfg.apiPassword}`).toString('base64') }
function isEcoCashSuccess(data) {
  if (!data) return false
  const op = String(data.transactionOperationStatus || '').toLowerCase()
  if (['completed', 'charged', 'success', 'successful', 'paid', 'approved'].includes(op)) return true
  const rc = String(data.responseCode ?? data.ecocashResponseCode ?? '')
  if (data.ecocashReference && ['200', '000', '0000', '0', '00'].includes(rc)) return true
  return false
}
async function ecoCashCharge({ customerMsisdn, amount, currency, clientReference, notifyUrl, description }) {
  const cfg = ecoCashConfig()
  if (!cfg.enabled) throw new Error('EcoCash gateway is not configured (set ECOCASH_API_* variables)')
  const body = {
    clientCorrelator: clientReference || crypto.randomUUID(),
    referenceCode: clientReference || crypto.randomUUID(),
    endUserId: normalizeMsisdn(customerMsisdn),
    notifyUrl: notifyUrl || cfg.notifyUrl,
    remarks: description || 'StockCount subscription',
    transactionOperationStatus: cfg.operationStatus,
    tranType: cfg.tranType,
    paymentAmount: {
      charginginformation: { amount: Number(amount).toFixed(2), currency, description: description || 'StockCount subscription' },
      chargeMetaData: { channel: cfg.channel, purchaseCategoryCode: cfg.categoryCode, onBeHalfOf: 'StockCount' }
    },
    merchantCode: cfg.merchantCode,
    merchantPin: cfg.merchantPin,
    merchantNumber: cfg.merchantNumber,
    currencyCode: currency,
    countryCode: 'ZW',
    terminalID: 'StockCount',
    location: 'StockCount',
    superMerchantName: 'StockCount',
    merchantName: 'StockCount'
  }
  const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/transactions/amount/`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: ecocashAuth(cfg) }, body: JSON.stringify(body) })
  const text = await res.text().catch(() => '')
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { /* non-JSON response */ }
  if (!res.ok) throw new Error((data && (data.responseMessage || data.message || data.text)) || `EcoCash charge failed (HTTP ${res.status})`)
  return data
}
const paymentPollers = new Map()
async function pendingPaymentLookup(orgId) {
  const cfg = ecoCashConfig()
  if (!cfg.enabled) return
  const row = (await pool.query("select * from payments where org_id=$1 and status='pending' order by created_at desc limit 1", [orgId])).rows[0]
  if (!row || !row.customer_msisdn) return
  if (Date.now() - new Date(row.created_at).getTime() > 15 * 60 * 1000) return
  const key = 'pl:' + row.id
  const last = paymentPollers.get(key)
  if (last && Date.now() - last < 10000) return
  paymentPollers.set(key, Date.now())
  const endUser = normalizeMsisdn(row.customer_msisdn)
  const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(endUser)}/transactions/amount/${encodeURIComponent(row.id)}`, { headers: { Authorization: ecocashAuth(cfg) } })
  if (!res.ok) return
  const data = await res.json().catch(() => null)
  if (!isEcoCashSuccess(data)) return
  try { await confirmPayment({ id: row.id, ref: data.ecocashReference || data.serverReferenceCode || data.id || row.id }) } catch (err) { console.error('payment lookup confirm failed:', err.message) }
}

function subscriptionFromRow(org, usage) {
  const now = new Date()
  const expired = org.plan_expires_at && new Date(org.plan_expires_at) <= now
  const plan_status = org.plan_status === 'active' ? (expired ? 'expired' : 'active') : 'inactive'
  const plan_type = org.plan_type === 'unlimited' ? 'unlimited' : 'basic'
  return {
    org_name: org.name,
    plan_type,
    plan_status,
    paid: plan_status === 'active',
    expires_at: org.plan_expires_at ? new Date(org.plan_expires_at).toISOString() : null,
    extra_member_slots: Number(org.plan_extra_members || 0),
    members_allowed: plan_type === 'unlimited' ? null : PRICING.basic.members + Number(org.plan_extra_members || 0),
    skus_allowed: plan_type === 'unlimited' ? null : PRICING.basic.skus,
    branches_allowed: plan_type === 'unlimited' ? null : PRICING.basic.branches,
    members_used: usage.members,
    skus_used: usage.skus,
    branches_used: usage.branches,
    renewal_amount: plan_type === 'unlimited' ? PRICING.unlimited.price : PRICING.basic.price,
    currency: CURRENCY,
    test_mode: isPaymentTestMode(),
    pricing: PRICING
  }
}

async function getSubscription(orgId) {
  const org = await pool.query('select id, name, plan_type, plan_status, plan_expires_at, plan_extra_members from organizations where id=$1', [orgId])
  if (!org.rowCount) return null
  const [users, items, branches] = await Promise.all([
    pool.query('select count(*)::int as c from users where org_id=$1', [orgId]),
    pool.query('select count(*)::int as c from items where org_id=$1', [orgId]),
    pool.query('select count(*)::int as c from locations where org_id=$1', [orgId])
  ])
  return subscriptionFromRow(org.rows[0], { members: users.rows[0].c, skus: items.rows[0].c, branches: branches.rows[0].c })
}

const BILLING_OPEN_PATHS = new Set(['/api/health', '/api/auth/login', '/api/auth/logout', '/api/auth/signup', '/api/auth/admin/signup', '/api/auth/otp/send', '/api/auth/otp/verify', '/api/auth/reset-password', '/api/auth/confirm-email', '/api/auth/invite/verify', '/api/auth/invite/request', '/api/auth/invite/complete', '/api/mobile/org', '/api/payments/status', '/api/payments/initiate', '/api/payments/verify'])

function requirePaid(req, res, next) {
  const path = String(req.path || req.url).split('?')[0]
  if (!pool || !path.startsWith('/api/') || BILLING_OPEN_PATHS.has(path)) return next()
  const token = String(req.headers.authorization || '').replace('Bearer ', '')
  if (!token) return next()
  let decoded
  try { decoded = jwt.verify(token, jwtSecret) } catch { return next() }
  pool.query('select plan_status, plan_expires_at from organizations where id=$1', [decoded.orgId]).then(({ rows }) => {
    const org = rows[0]
    if (!org) return next()
    const active = org.plan_status === 'active' && (!org.plan_expires_at || new Date(org.plan_expires_at) > new Date())
    if (!active) return res.status(402).json({ error: 'Your shop subscription is inactive. Complete payment to unlock your shop.', code: 'SUBSCRIPTION_REQUIRED' })
    next()
  }).catch(() => next())
}
app.use(requirePaid)

function requireDatabase(req, res, next) { if (!pool) return res.status(503).json({ error: 'DATABASE_URL is not configured on the server' }); next() }
function issueToken(user, sid) { return jwt.sign({ id: user.id, orgId: user.org_id, role: user.role, email: user.email, sid }, jwtSecret, { expiresIn: '12h' }) }
function auth(req, res, next) {
  try {
    const token = String(req.headers.authorization || '').replace('Bearer ', '')
    const decoded = jwt.verify(token, jwtSecret)
    if (!pool) { req.user = decoded; return next() }
    pool.query('select 1 from user_sessions where id=$1 and user_id=$2 and revoked_at is null and expires_at > now()', [decoded.sid, decoded.id]).then(result => {
      if (!result.rowCount) return res.status(401).json({ error: 'Your session has ended. Please sign in again.' })
      req.user = decoded
      next()
    }).catch(err => { console.error('Session check failed:', err.message); req.user = decoded; next() })
  } catch { res.status(401).json({ error: 'Authentication required' }) }
}
function adminOnly(req, res, next) { if (req.user.role !== 'admin') return res.status(403).json({ error: 'Administrator access required' }); next() }
function makeCode() { return String(crypto.randomInt(100000, 999999)) }
async function sendMail(to, subject, text) {
  if (!process.env.SMTP_HOST) return
  const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_APP_PASSWORD } })
  await transporter.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text })
}
function isPhoneIdentifier(value) { return /^\+?[\d\s().-]{7,}$/.test(String(value || '').trim()) }
function normalizeIdentifier(value) { return String(value || '').trim() }
let atSms = null
const atApiKey = process.env.AT_API_KEY
if (atApiKey && process.env.AT_USERNAME) {
  try {
    const at = require('africastalking')({ apiKey: atApiKey, username: process.env.AT_USERNAME })
    atSms = at.SMS
  } catch (err) { console.error('Africa\'s Talking SDK init failed:', err.message) }
}
async function sendSms(phone, text) {
  if (!atSms) return console.log(`[SMS] -> ${phone}: ${text}`)
  const from = process.env.AT_SENDER_ID || undefined
  try { await atSms.send({ to: [phone], message: text, from }) } catch (err) { console.error(`[SMS] AT send failed -> ${phone}:`, err.message) }
}
async function deliverCode(identifier, code, purpose) {
  console.log(`[OTP] purpose=${purpose} identifier=${identifier} code=${code}`)
  if (isPhoneIdentifier(identifier)) {
    await sendSms(identifier, `Your StockCount ${purpose} code is ${code}. It expires in 10 minutes.`)
    return 'sms'
  }
  try { await sendMail(identifier, `Your StockCount ${purpose} code`, `Your StockCount verification code is: ${code}\n\nThis code expires in 10 minutes.`) } catch (err) { console.error('OTP email failed:', err.message) }
  return 'email'
}
async function issueOtp(user, purpose, identifier) {
  const code = makeCode()
  await pool.query("update users set otp_code=$1, otp_expires_at=now() + interval '10 minutes', otp_purpose=$2 where id=$3", [code, purpose, user.id])
  const channel = await deliverCode(identifier, code, purpose)
  return { channel, code }
}
const findUserByIdentifier = "select u.* from users u where u.is_active = true and (lower(coalesce(u.email,'')) = lower($1) or regexp_replace(coalesce(u.phone,''), '[^0-9]', '', 'g') = regexp_replace($2, '[^0-9]', '', 'g'))"

app.get('/api/health', (req, res) => res.json({ ok: true, database: Boolean(pool) }))
app.post('/api/auth/admin/signup', requireDatabase, async (req, res) => {
  const { shopName, fullName, identifier, email: legacyEmail, phone, password, logoUrl, tagline, address } = req.body
  const contact = normalizeIdentifier(identifier || phone || legacyEmail)
  const phoneOnly = isPhoneIdentifier(contact)
  if (!shopName || !fullName || !contact || !password || password.length < 6) return res.status(400).json({ error: 'Shop, name, email or phone, and a password of at least 6 characters are required' })
  const client = await pool.connect()
  let transactionActive = false
  try {
    await client.query('BEGIN')
    transactionActive = true
    if (phoneOnly) {
      const existing = await client.query("select id from users where regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = $1", [contact.replace(/\D/g, '')])
      if (existing.rowCount) throw new Error('Phone number already exists')
    } else {
      const existing = await client.query('select id from users where lower(email) = lower($1)', [contact.toLowerCase()])
      if (existing.rowCount) throw new Error('Email already exists')
    }
    const existingOrg = await client.query('select id from organizations where lower(name) = lower($1) for update', [shopName.trim()])
    let organizationId
    if (existingOrg.rowCount) {
      const members = await client.query('select count(*)::int as count from users where org_id=$1', [existingOrg.rows[0].id])
      if (members.rows[0].count > 0) throw new Error('A workspace with that name already exists. Choose a different shop name.')
      await client.query("update organizations set logo_url=$1, tagline=$2, address=$3, plan_status=CASE WHEN plan_status='active' AND plan_expires_at > now() THEN plan_status ELSE 'inactive' END where id=$4", [logoUrl || null, tagline ? String(tagline).trim() : null, address ? String(address).trim() : null, existingOrg.rows[0].id])
      organizationId = existingOrg.rows[0].id
    } else {
      const org = await client.query("insert into organizations (name, logo_url, tagline, address, plan_status) values ($1, $2, $3, $4, $5) returning id", [shopName.trim(), logoUrl || null, tagline ? String(tagline).trim() : null, address ? String(address).trim() : null, 'inactive'])
      organizationId = org.rows[0].id
    }
    const passwordHash = await bcrypt.hash(password, 12)
    const user = await client.query('insert into users (org_id, role, full_name, email, phone, password_hash, is_active, setup_status, email_verified) values ($1, $2, $3, $4, $5, $6, true, $7, false) returning id', [organizationId, 'admin', fullName.trim(), phoneOnly ? null : contact.toLowerCase(), phoneOnly ? contact : null, passwordHash, 'setup_complete'])
    await client.query('COMMIT')
    transactionActive = false
    const otp = await issueOtp(user.rows[0], 'signup', contact)
    res.status(201).json({ requiresOtp: true, requiresConfirmation: true, channel: otp.channel, identifier: contact, code: process.env.NODE_ENV === 'production' ? undefined : otp.code })
  } catch (error) { if (transactionActive) await client.query('ROLLBACK'); const message = error.code === '23505' ? 'A workspace or email with those details already exists.' : error.message; res.status(400).json({ error: message }) } finally { client.release() }
})
app.post('/api/auth/otp/send', requireDatabase, async (req, res) => {
  const identifier = normalizeIdentifier(req.body.identifier)
  const purpose = String(req.body.purpose || 'reset')
  if (!identifier) return res.status(400).json({ error: 'Email or phone number is required' })
  const result = await pool.query(findUserByIdentifier, [identifier, identifier])
  const user = result.rows[0]
  if (!user) return res.status(400).json({ error: 'No account matches that email or phone number' })
  const otp = await issueOtp(user, purpose, identifier)
  res.json({ ok: true, channel: otp.channel, code: process.env.NODE_ENV === 'production' ? undefined : otp.code })
})
app.post('/api/auth/otp/verify', requireDatabase, async (req, res) => {
  const identifier = normalizeIdentifier(req.body.identifier)
  const code = String(req.body.code || '').trim()
  const purpose = String(req.body.purpose || 'reset')
  const result = await pool.query(findUserByIdentifier, [identifier, identifier])
  const user = result.rows[0]
  if (!user || !user.otp_code || user.otp_code !== code || !user.otp_expires_at || new Date(user.otp_expires_at) < new Date() || (user.otp_purpose && user.otp_purpose !== purpose)) return res.status(400).json({ error: 'Invalid or expired code' })
  await pool.query('update users set email_verified=true, otp_code=null, otp_expires_at=null, otp_purpose=null where id=$1', [user.id])
  res.json({ ok: true })
})
app.post('/api/auth/reset-password', requireDatabase, async (req, res) => {
  const identifier = normalizeIdentifier(req.body.identifier)
  const code = String(req.body.code || '').trim()
  const password = String(req.body.password || '')
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })
  const result = await pool.query(findUserByIdentifier, [identifier, identifier])
  const user = result.rows[0]
  if (!user || !user.otp_code || user.otp_code !== code || !user.otp_expires_at || new Date(user.otp_expires_at) < new Date() || (user.otp_purpose && user.otp_purpose !== 'reset')) return res.status(400).json({ error: 'Invalid or expired code' })
  const passwordHash = await bcrypt.hash(password, 12)
  await pool.query('update users set password_hash=$1, otp_code=null, otp_expires_at=null, otp_purpose=null, email_verified=true where id=$2', [passwordHash, user.id])
  res.json({ ok: true })
})
app.get('/api/auth/confirm-email', async (req, res) => { if (!pool) return res.status(503).send('Database is not configured'); const result = await pool.query('update users set email_verified = true, email_confirmation_token = null where email_confirmation_token = $1 returning email', [req.query.token]); if (!result.rowCount) return res.status(400).send('This confirmation link is invalid or expired.'); const baseUrl = process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`; res.redirect(303, `${baseUrl.replace(/\/$/, '')}/?confirmed=1`) })
app.post('/api/auth/logout', requireDatabase, auth, async (req, res) => { try { if (req.user.sid) await pool.query('update user_sessions set revoked_at = now() where id=$1 and user_id=$2', [req.user.sid, req.user.id]) } catch (err) { console.error('Logout failed:', err.message) } res.json({ ok: true }) })
app.post('/api/auth/login', requireDatabase, async (req, res) => { const identifier = normalizeIdentifier(req.body.identifier || req.body.email); const { password, role } = req.body; const result = await pool.query(findUserByIdentifier, [identifier, identifier]); const user = result.rows[0]; if (!user || (role && user.role !== role) || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Invalid credentials' }); if (!user.email_verified) return res.status(403).json({ error: 'Verify your email or phone with the code we sent before signing in' }); const active = await pool.query('select 1 from user_sessions where user_id=$1 and revoked_at is null and expires_at > now()', [user.id]); if (active.rowCount) return res.status(409).json({ error: 'This account is already signed in on another device. Sign out there first, then try again.' }); await pool.query('delete from user_sessions where user_id=$1 and (revoked_at is not null or expires_at <= now())', [user.id]); const sid = crypto.randomUUID(); const token = issueToken(user, sid); try { await pool.query('insert into user_sessions (id, user_id, org_id, token_sig, expires_at) values ($1,$2,$3,$4, now() + $5::interval)', [sid, user.id, user.org_id, crypto.createHash('sha256').update(token).digest('hex'), '12 hours']) } catch (err) { if (err.code === '23505') return res.status(409).json({ error: 'This account is already signed in on another device. Sign out there first, then try again.' }); console.error('Session create failed:', err.message); return res.status(500).json({ error: 'Unable to start a session. Please try again.' }) } res.json({ token, user: publicUser(user), subscription: await getSubscription(user.org_id) }) })
app.post('/api/auth/invite/verify', requireDatabase, async (req, res) => { const { shopName, role, code } = req.body; const identifier = normalizeIdentifier(req.body.identifier || req.body.email); const result = await pool.query("select u.* from users u join organizations o on o.id = u.org_id where lower(o.name) = lower($1) and u.role = $3 and u.invite_code = $4 and u.is_active = true and (lower(coalesce(u.email,'')) = lower($2) or regexp_replace(coalesce(u.phone,''), '[^0-9]', '', 'g') = regexp_replace($5, '[^0-9]', '', 'g'))", [shopName, identifier, role, code, identifier]); if (!result.rowCount) return res.status(400).json({ error: 'Invalid invitation details' }); res.json({ user: publicUser(result.rows[0]) }) })
app.post('/api/auth/invite/request', requireDatabase, async (req, res) => { const { shopName, role } = req.body; const identifier = normalizeIdentifier(req.body.identifier || req.body.email); const result = await pool.query("select u.* from users u join organizations o on o.id = u.org_id where lower(o.name) = lower($1) and u.role = $3 and u.is_active = true and u.setup_status = $4 and (lower(coalesce(u.email,'')) = lower($2) or regexp_replace(coalesce(u.phone,''), '[^0-9]', '', 'g') = regexp_replace($5, '[^0-9]', '', 'g'))", [shopName, identifier, role, 'invited', identifier]); if (!result.rowCount) return res.status(400).json({ error: 'No active invitation matches that shop, email or phone, and role' }); const code = makeCode(); await pool.query('update users set invite_code=$1 where id=$2', [code, result.rows[0].id]); const channel = await deliverCode(identifier, code, 'invitation'); res.json({ channel, code: process.env.NODE_ENV === 'production' ? undefined : code }) })
app.post('/api/auth/invite/complete', requireDatabase, async (req, res) => { const { userId, fullName, password } = req.body; if (!userId || !fullName || !password || password.length < 6) return res.status(400).json({ error: 'Name and a password of at least 6 characters are required' }); const passwordHash = await bcrypt.hash(password, 12); const result = await pool.query('update users set full_name=$1, password_hash=$2, setup_status=$3, email_verified=true, invite_code=null where id=$4 and is_active=true and setup_status=$5 returning id,org_id,role,full_name,email,phone,is_active,setup_status,created_at', [fullName.trim(), passwordHash, 'setup_complete', userId, 'invited']); if (!result.rowCount) return res.status(400).json({ error: 'Invitation setup is no longer available' }); res.json(publicUser(result.rows[0])) })
async function confirmPayment(payment) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const existing = await client.query('select * from payments where id=$1 for update', [payment.id])
    if (!existing.rowCount) throw new Error('Payment not found')
    if (existing.rows[0].status === 'paid') return existing.rows[0]
    const p = existing.rows[0]
    await client.query("update payments set status='paid', paid_at=now(), provider_ref=$2 where id=$1", [payment.id, payment.ref])
    if (p.intent === 'extra_member') {
      await client.query("update organizations set plan_status='active', plan_extra_members = plan_extra_members + 1, plan_paid_at=now() where id=$1", [p.org_id])
    } else if (p.intent === 'upgrade' || p.plan_type === 'unlimited') {
      await client.query("update organizations set plan_type='unlimited', plan_status='active', plan_expires_at = GREATEST(COALESCE(plan_expires_at, now()), now()) + interval '1 month', plan_paid_at=now() where id=$1", [p.org_id])
    } else {
      await client.query("update organizations set plan_type='basic', plan_status='active', plan_expires_at = GREATEST(COALESCE(plan_expires_at, now()), now()) + interval '1 month', plan_paid_at=now() where id=$1", [p.org_id])
    }
    await client.query('COMMIT')
    return { ...p, status: 'paid', paid_at: new Date(), provider_ref: payment.ref }
  } catch (err) { await client.query('ROLLBACK'); throw err } finally { client.release() }
}

app.get('/api/payments/status', requireDatabase, auth, async (req, res) => { try { await pendingPaymentLookup(req.user.orgId) } catch { /* best effort */ } const sub = await getSubscription(req.user.orgId); if (!sub) return res.status(404).json({ error: 'Shop not found' }); res.json({ org_id: req.user.orgId, ...sub }) })

app.post('/api/payments/initiate', requireDatabase, auth, async (req, res) => {
  let intent = String(req.body.intent || 'subscribe')
  let planType = String(req.body.plan_type || 'basic')
  if (!['subscribe', 'upgrade', 'extra_member'].includes(intent)) intent = 'subscribe'
  if (!['basic', 'unlimited'].includes(planType)) planType = 'basic'
  if (planType === 'unlimited' && intent !== 'extra_member') intent = 'upgrade'
  const amount = intent === 'extra_member' ? PRICING.extra_member.price : intent === 'upgrade' ? PRICING.unlimited.price : (planType === 'unlimited' ? PRICING.unlimited.price : PRICING.basic.price)
  const customerMsisdn = String(req.body.customer_msisdn || req.body.customerMsisdn || '').replace(/[^\d]/g, '')
  const eco = ecoCashConfig()
  const payment = (await pool.query("insert into payments (org_id, intent, plan_type, amount, currency, provider, customer_msisdn) values ($1,$2,$3,$4,$5,$6,$7) returning *", [req.user.orgId, intent, planType, amount, CURRENCY, 'ecocash', customerMsisdn || null])).rows[0]
  if (isPaymentTestMode() && !eco.enabled) {
    try { await confirmPayment({ id: payment.id, ref: `TEST-${Date.now()}` }) } catch (err) { return res.status(500).json({ error: err.message }) }
    const paid = (await pool.query('select * from payments where id=$1', [payment.id])).rows[0]
    const subscription = await getSubscription(req.user.orgId)
    return res.status(201).json({ test_mode: true, payment: paid, subscription })
  }
  if (!eco.enabled) return res.status(503).json({ error: 'The EcoCash gateway is not configured yet (set ECOCASH_API_* variables).' })
  if (!customerMsisdn) return res.status(400).json({ error: 'Enter the EcoCash mobile number that should receive the payment request.' })
  let charge
  try {
    charge = await ecoCashCharge({ customerMsisdn, amount, currency: CURRENCY, clientReference: payment.id, notifyUrl: eco.notifyUrl, description: `StockCount ${intent === 'upgrade' ? 'Unlimited upgrade' : intent === 'extra_member' ? 'Extra member slot' : 'subscription'}` })
  } catch (err) {
    await pool.query("update payments set status='failed', provider_ref=$1 where id=$2", [String(err.message).slice(0, 300), payment.id])
    return res.status(502).json({ error: err.message })
  }
  if (isEcoCashSuccess(charge)) {
    try { await confirmPayment({ id: payment.id, ref: charge.ecocashReference || charge.serverReferenceCode || payment.id }) } catch (err) { return res.status(500).json({ error: err.message }) }
    const paid = (await pool.query('select * from payments where id=$1', [payment.id])).rows[0]
    const subscription = await getSubscription(req.user.orgId)
    return res.status(201).json({ test_mode: isPaymentTestMode(), payment: paid, subscription })
  }
  if (charge.ecocashReference || charge.serverReferenceCode) await pool.query('update payments set provider_ref=$1 where id=$2', [charge.ecocashReference || charge.serverReferenceCode, payment.id])
  res.status(202).json({ test_mode: isPaymentTestMode(), status: 'pending', pending: true, payment, message: `An EcoCash payment request was sent to ${normalizeMsisdn(customerMsisdn)}. Approve it on your phone to unlock your shop.` })
})

app.post('/api/payments/verify', requireDatabase, async (req, res) => {
  const body = req.body || {}
  const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET
  const paymentIdRaw = String(body.paymentId || body.payment_id || body.clientCorrelator || body.referenceCode || body.id || body.transactionId || '').replace(/[^\w-]/g, '')
  const payment = paymentIdRaw ? (await pool.query('select * from payments where id=$1', [paymentIdRaw])).rows[0] : null
  if (!payment) { res.json({ ok: true, status: 'ignored' }); return }
  if (body.secret) {
    if (!webhookSecret || body.secret !== webhookSecret) return res.status(403).json({ error: 'Invalid webhook secret' })
    if (body.status && String(body.status).toLowerCase() !== 'success') { await pool.query("update payments set status='failed' where id=$1", [payment.id]); return res.json({ ok: true, status: 'failed' }) }
    if (body.amount !== undefined && Number(body.amount) !== Number(payment.amount)) return res.status(400).json({ error: 'Amount mismatch' })
    let paid
    try { paid = await confirmPayment({ id: payment.id, ref: body.transactionId || payment.provider_ref || payment.id }) } catch (err) { return res.status(400).json({ error: err.message }) }
    const subscription = await getSubscription(payment.org_id)
    return res.json({ ok: true, payment: paid, subscription })
  }
  const eco = ecoCashConfig()
  if (!eco.enabled || !payment.customer_msisdn) { res.json({ ok: true, status: 'ignored' }); return }
  if (body.amount !== undefined && Number(body.amount) !== Number(payment.amount)) { res.json({ ok: true, status: 'ignored' }); return }
  if (isEcoCashSuccess(body)) {
    const endUser = normalizeMsisdn(payment.customer_msisdn)
    const resLookup = await fetch(`${eco.baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(endUser)}/transactions/amount/${encodeURIComponent(payment.id)}`, { headers: { Authorization: ecocashAuth(eco) } }).catch(() => null)
    const data = resLookup && resLookup.ok ? await resLookup.json().catch(() => null) : null
    if (isEcoCashSuccess(data)) {
      let paid
      try { paid = await confirmPayment({ id: payment.id, ref: data.ecocashReference || data.serverReferenceCode || body.ecocashReference || payment.id }) } catch { res.json({ ok: true, status: 'pending' }); return }
      const subscription = await getSubscription(payment.org_id)
      return res.json({ ok: true, payment: paid, subscription })
    }
  }
  res.json({ ok: true, status: 'pending' })
})

app.get('/api/admin/data', requireDatabase, auth, async (req, res) => { const id = req.user.orgId; const [org, users, locations, zones, items, sessions, logs, uploads, reports, sales] = await Promise.all([pool.query('select id,name,logo_url,tagline,address,variance_threshold_pct,variance_threshold_units from organizations where id=$1', [id]), pool.query('select id,org_id,role,full_name,email,phone,is_active,setup_status,created_at from users where org_id=$1 order by created_at', [id]), pool.query('select * from locations where org_id=$1 order by name', [id]), pool.query('select z.* from zones z join locations l on l.id=z.location_id where l.org_id=$1 order by z.name', [id]), pool.query('select * from items where org_id=$1 order by name', [id]), pool.query('select * from count_sessions where org_id=$1 order by created_at desc', [id]), pool.query('select * from audit_logs where org_id=$1 order by created_at desc limit 20', [id]), pool.query('select id,org_id,file_name,columns,rows_preview,raw_data,imported_count,zone_id,uploaded_by,created_at from excel_uploads where org_id=$1 order by created_at desc', [id]), pool.query('select r.*, u.full_name as submitted_by_name from count_reports r left join users u on u.id=r.submitted_by where r.org_id=$1 order by r.created_at desc', [id]), pool.query('select s.*, coalesce(s.item_name, i.name) as item_name, i.sku, i.unit as item_unit, u.full_name as seller_name from sales s left join items i on i.id=s.item_id left join users u on u.id=s.seller_id where s.org_id=$1 order by s.sold_at desc limit 500', [id])]); res.json({ source: 'neon', org: org.rows[0], users: users.rows, locations: locations.rows, zones: zones.rows, items: items.rows, sessions: sessions.rows, logs: logs.rows, uploads: uploads.rows, reports: reports.rows, sales: sales.rows }) })
app.get('/api/admin/sales', requireDatabase, auth, adminOnly, async (req, res) => {
  const params = [req.user.orgId]
  let where = 'where s.org_id=$1'
  if (req.query.from) { params.push(req.query.from); where += ` and date(s.sold_at) >= $${params.length}::date` }
  if (req.query.to) { params.push(req.query.to); where += ` and date(s.sold_at) <= $${params.length}::date` }
  const result = await pool.query(`select s.*, coalesce(s.item_name, i.name) as item_name, i.sku, i.unit as item_unit, i.barcode as item_barcode, u.full_name as seller_name from sales s left join items i on i.id=s.item_id left join users u on u.id=s.seller_id ${where} order by s.sold_at desc`, params)
  const sales = result.rows
  const byDate = new Map()
  for (const row of sales) {
    const day = String(row.sold_at).slice(0, 10)
    if (!byDate.has(day)) byDate.set(day, { date: day, total_sales: 0, total_revenue: 0, items_sold: 0, sales: [] })
    const bucket = byDate.get(day)
    bucket.total_sales += 1
    bucket.total_revenue += Number(row.total) || 0
    bucket.items_sold += Number(row.quantity) || 0
    bucket.sales.push(row)
  }
  const days = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date))
  res.json({ total_revenue: days.reduce((sum, day) => sum + day.total_revenue, 0), total_sales: days.reduce((sum, day) => sum + day.total_sales, 0), total_items_sold: days.reduce((sum, day) => sum + day.items_sold, 0), days })
})
app.patch('/api/admin/users/:id/status', requireDatabase, auth, adminOnly, async (req, res) => { const result = await pool.query('update users set is_active=$1 where id=$2 and org_id=$3 returning id,org_id,role,full_name,email,phone,is_active,setup_status,created_at', [Boolean(req.body.isActive), req.params.id, req.user.orgId]); res.json(result.rows[0]) })
app.patch('/api/admin/users/:id', requireDatabase, auth, adminOnly, async (req, res) => {
  try {
    const { full_name, role } = req.body
    const current = await pool.query('select * from users where id=$1 and org_id=$2', [req.params.id, req.user.orgId])
    if (!current.rowCount) return res.status(404).json({ error: 'Team member not found' })
    const user = current.rows[0]
    const fields = []
    const values = []
    if (full_name !== undefined) {
      values.push(String(full_name).trim())
      fields.push(`full_name=$${values.length}`)
    }
    if (role !== undefined) {
      if (!['admin', 'counter', 'auditor', 'seller'].includes(role)) return res.status(400).json({ error: 'Role must be admin, counter, auditor, or seller' })
      values.push(role)
      fields.push(`role=$${values.length}`)
    }
    const contactRequested = req.body.email !== undefined || req.body.phone !== undefined || req.body.contact !== undefined
    if (contactRequested) {
      const contact = normalizeIdentifier(req.body.contact ?? req.body.email ?? req.body.phone)
      if (contact) {
        const phoneOnly = isPhoneIdentifier(contact)
        if (phoneOnly) {
          const norm = contact.replace(/\D/g, '')
          const clash = await pool.query("select id from users where org_id=$1 and regexp_replace(coalesce(phone,''),'[^0-9]','','g')=$2 and id<>$3", [req.user.orgId, norm, req.params.id])
          if (clash.rowCount) return res.status(400).json({ error: 'That phone number is already used by another member of this shop' })
          const offset = values.length
          values.push(null, contact)
          fields.push(`email=$${offset + 1}`, `phone=$${offset + 2}`)
        } else {
          const clash = await pool.query('select id from users where org_id=$1 and lower(email)=lower($2) and id<>$3', [req.user.orgId, contact.toLowerCase(), req.params.id])
          if (clash.rowCount) return res.status(400).json({ error: 'That email is already used by another member of this shop' })
          values.push(contact.toLowerCase())
          fields.push(`email=$${values.length}`)
        }
      }
    } else {
      const contact = req.body.identifier
      if (contact) {
        const phoneOnly = isPhoneIdentifier(contact)
        const offset = values.length
        values.push(phoneOnly ? null : contact.toLowerCase(), phoneOnly ? contact : null)
        fields.push(`email=$${offset + 1}`, `phone=$${offset + 2}`)
      }
    }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' })
    values.push(req.params.id, req.user.orgId)
    const result = await pool.query(`update users set ${fields.join(', ')} where id=$${values.length - 1} and org_id=$${values.length} returning id,org_id,role,full_name,email,phone,is_active,setup_status,created_at`, values)
    await pool.query("insert into audit_logs (org_id,entity_type,entity_id,action,actor_id,payload) values ($1,$2,$3,$4,$5,$6)", [req.user.orgId, 'user', req.params.id, 'updated', req.user.id, JSON.stringify({ role: result.rows[0].role, full_name: result.rows[0].full_name })])
    res.json(result.rows[0])
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'That email or phone number is already used by another member of this shop' })
    res.status(500).json({ error: `Unable to update member: ${error.message}` })
  }
})
app.delete('/api/admin/users/:id', requireDatabase, auth, adminOnly, async (req, res) => { if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' }); const client = await pool.connect(); try { await client.query('BEGIN'); const user = await client.query('select id from users where id=$1 and org_id=$2', [req.params.id, req.user.orgId]); if (!user.rowCount) return res.status(404).json({ error: 'User not found' }); await client.query('update count_sessions set assigned_counter_id=null where assigned_counter_id=$1', [req.params.id]); await client.query('update count_sessions set assigned_counter_2_id=null where assigned_counter_2_id=$1', [req.params.id]); await client.query('update count_sessions set auditor_id=null where auditor_id=$1', [req.params.id]); await client.query('update audit_logs set actor_id=null where actor_id=$1', [req.params.id]); await client.query('update excel_uploads set uploaded_by=null where uploaded_by=$1', [req.params.id]); await client.query('update count_entries set counted_by=null where counted_by=$1', [req.params.id]); await client.query('update sales set seller_id=null where seller_id=$1', [req.params.id]); const result = await client.query('delete from users where id=$1 and org_id=$2', [req.params.id, req.user.orgId]); await client.query('COMMIT'); res.json({ success: true }) } catch (error) { await client.query('ROLLBACK'); res.status(500).json({ error: `Unable to delete user: ${error.message}` }) } finally { client.release() } })
app.patch('/api/admin/organizations/:id/thresholds', requireDatabase, auth, adminOnly, async (req, res) => { const result = await pool.query('update organizations set variance_threshold_pct=$1, variance_threshold_units=$2 where id=$3 and id=$4 returning id,name,variance_threshold_pct,variance_threshold_units', [req.body.pct, req.body.units, req.params.id, req.user.orgId]); res.json(result.rows[0]) })
app.post('/api/admin/users', requireDatabase, auth, adminOnly, async (req, res) => { try { const sub = await getSubscription(req.user.orgId); if (sub && sub.plan_type !== 'unlimited' && sub.members_used >= sub.members_allowed) return res.status(403).json({ error: `Your Basic plan includes ${sub.members_allowed} team members. Pay $${PRICING.extra_member.price.toFixed(2)} to add another member.`, code: 'LIMIT_REACHED', payment: { intent: 'extra_member', amount: PRICING.extra_member.price, label: 'Add another member slot' } }); const { full_name, role, phone } = req.body; const contact = normalizeIdentifier(req.body.email || req.body.identifier); if (!full_name || !contact || !role) return res.status(400).json({ error: 'Name, email or phone, and role are required' }); if (!['admin', 'counter', 'auditor', 'seller'].includes(role)) return res.status(400).json({ error: 'Role must be admin, counter, auditor, or seller' }); const phoneOnly = isPhoneIdentifier(contact); const existing = await pool.query(phoneOnly ? "select id from users where org_id=$1 and regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = regexp_replace($2, '[^0-9]', '', 'g')" : 'select id from users where org_id=$1 and lower(email)=lower($2)', [req.user.orgId, contact]); if (existing.rowCount) return res.status(400).json({ error: 'That email or phone is already a member of this shop' }); const code = makeCode(); const result = await pool.query('insert into users (org_id,full_name,email,role,phone,is_active,setup_status,invite_code,email_verified) values ($1,$2,$3,$4,$5,true,\'invited\',$6,true) returning id,org_id,role,full_name,email,phone,is_active,setup_status,created_at', [req.user.orgId, full_name.trim(), phoneOnly ? null : contact.toLowerCase(), role, phoneOnly ? contact : phone || null, code]); try { const channel = await deliverCode(contact, code, 'invitation'); res.status(201).json({ ...result.rows[0], channel, code: process.env.NODE_ENV === 'production' ? undefined : code }) } catch (error) { console.error('Invite code delivery failed:', error.message); res.status(201).json({ ...result.rows[0], channel: null, code: process.env.NODE_ENV === 'production' ? undefined : code }) } } catch (error) { if (error.code === '23505') return res.status(400).json({ error: 'A user with that email or phone already exists' }); res.status(500).json({ error: 'Failed to create user' }) } })
app.patch('/api/admin/items/:id', requireDatabase, auth, adminOnly, async (req, res) => { const { name, sku, unit, zone_id, system_qty, barcode, category, selling_price } = req.body; const current = await pool.query('select * from items where id=$1 and org_id=$2', [req.params.id, req.user.orgId]); if (!current.rowCount) return res.status(404).json({ error: 'Product not found' }); const item = current.rows[0]; if (sku && String(sku).trim() && sku !== item.sku) { const clash = await pool.query('select id from items where org_id=$1 and sku=$2 and id<>$3', [req.user.orgId, sku, req.params.id]); if (clash.rowCount) return res.status(400).json({ error: 'SKU already exists in this inventory' }) } const result = await pool.query('update items set name=$1, sku=$2, unit=$3, zone_id=$4, system_qty=$5, barcode=$6, category=$7, selling_price=$8, updated_at=now() where id=$9 and org_id=$10 returning *', [name ?? item.name, sku ?? item.sku, unit ?? item.unit, zone_id ?? item.zone_id, system_qty ?? item.system_qty, barcode ?? item.barcode, category ?? item.category, selling_price ?? item.selling_price, req.params.id, req.user.orgId]); res.json(result.rows[0]) })
app.delete('/api/admin/items/:id', requireDatabase, auth, adminOnly, async (req, res) => { const client = await pool.connect(); try { await client.query('BEGIN'); const item = await client.query('select * from items where id=$1 and org_id=$2', [req.params.id, req.user.orgId]); if (!item.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Product not found' }) } await client.query('update sales set item_name=coalesce(item_name, $1), item_id=null where item_id=$2', [item.rows[0].name, req.params.id]); await client.query('delete from count_entries where item_id=$1', [req.params.id]); await client.query('delete from items where id=$1', [req.params.id]); await client.query('COMMIT'); res.json({ success: true }) } catch (error) { await client.query('ROLLBACK'); res.status(500).json({ error: `Unable to delete product: ${error.message}` }) } finally { client.release() } })
app.delete('/api/admin/inventory', requireDatabase, auth, adminOnly, async (req, res) => { const client = await pool.connect(); try { await client.query('BEGIN'); const confirm = String(req.body.confirm || '').trim(); if (confirm !== 'DELETE') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Type DELETE to confirm' }) } await client.query('update sales s set item_name = coalesce(s.item_name, i.name), item_id = null from items i where s.item_id = i.id and s.org_id = $1', [req.user.orgId]); await client.query('delete from count_entries where item_id in (select id from items where org_id=$1)', [req.user.orgId]); const result = await client.query('delete from items where org_id=$1', [req.user.orgId]); await client.query('COMMIT'); res.json({ success: true, deleted: result.rowCount }) } catch (error) { await client.query('ROLLBACK'); res.status(500).json({ error: `Unable to delete inventory: ${error.message}` }) } finally { client.release() } })
app.patch('/api/admin/organization', requireDatabase, auth, adminOnly, async (req, res) => { const fields = []; const values = []; if (req.body.name !== undefined) { values.push(String(req.body.name).trim()); fields.push(`name=$${values.length}`) } if (req.body.tagline !== undefined) { values.push(req.body.tagline ? String(req.body.tagline).trim() : null); fields.push(`tagline=$${values.length}`) } if (req.body.logo_url !== undefined) { values.push(req.body.logo_url || null); fields.push(`logo_url=$${values.length}`) } if (req.body.address !== undefined) { values.push(req.body.address ? String(req.body.address).trim() : null); fields.push(`address=$${values.length}`) } if (!fields.length) return res.status(400).json({ error: 'Nothing to update' }); values.push(req.user.orgId); const result = await pool.query(`update organizations set ${fields.join(', ')} where id=$${values.length} returning id, name, logo_url, tagline, address, variance_threshold_pct, variance_threshold_units, created_at`, values); res.json(result.rows[0]) })
app.post('/api/admin/locations', requireDatabase, auth, adminOnly, async (req, res) => { const { name, type, address } = req.body; if (!String(name || '').trim() || !['warehouse', 'store', 'site'].includes(type)) return res.status(400).json({ error: 'A location name and type (warehouse, store, or site) are required' }); const sub = await getSubscription(req.user.orgId); if (sub && sub.plan_type !== 'unlimited' && sub.branches_used >= sub.branches_allowed) return res.status(403).json({ error: `Your Basic plan includes ${sub.branches_allowed} branch. Upgrade to the $${PRICING.unlimited.price} Unlimited plan to add more branches.`, code: 'LIMIT_REACHED', payment: { intent: 'upgrade', plan_type: 'unlimited', amount: PRICING.unlimited.price, label: 'Upgrade to Unlimited' } }); const result = await pool.query('insert into locations (org_id,name,type,address) values ($1,$2,$3,$4) returning *', [req.user.orgId, String(name).trim(), type, String(address || '').trim() || null]); res.status(201).json(result.rows[0]) })
app.post('/api/admin/zones', requireDatabase, auth, adminOnly, async (req, res) => { const { location_id, name, code } = req.body; if (!location_id || !String(name || '').trim()) return res.status(400).json({ error: 'A location and zone name are required' }); const location = await pool.query('select id from locations where id=$1 and org_id=$2', [location_id, req.user.orgId]); if (!location.rowCount) return res.status(404).json({ error: 'Location not found' }); const result = await pool.query('insert into zones (location_id,name,code) values ($1,$2,$3) returning *', [location_id, String(name).trim(), String(code || '').trim() || null]); res.status(201).json(result.rows[0]) })
app.post('/api/admin/items', requireDatabase, auth, adminOnly, async (req, res) => { const rows = Array.isArray(req.body.items) ? req.body.items : [req.body]; const sub = await getSubscription(req.user.orgId); if (sub && sub.plan_type !== 'unlimited' && rows.length && sub.skus_used + rows.length > sub.skus_allowed) return res.status(403).json({ error: `Your Basic plan allows up to ${sub.skus_allowed} SKUs. Upgrade to the $${PRICING.unlimited.price} Unlimited plan to store more products.`, code: 'LIMIT_REACHED', payment: { intent: 'upgrade', plan_type: 'unlimited', amount: PRICING.unlimited.price, label: 'Upgrade to Unlimited' } }); const values = []; const placeholders = rows.map((item, i) => { const offset = i * 9; values.push(req.user.orgId, item.zone_id, item.name, item.sku, item.unit || 'unit', item.system_qty || 0, item.barcode || null, item.category || null, item.selling_price || 0); return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9})` }).join(','); const result = await pool.query(`insert into items (org_id,zone_id,name,sku,unit,system_qty,barcode,category,selling_price) values ${placeholders} returning *`, values); res.status(201).json(result.rows) })
app.post('/api/admin/excel-uploads', requireDatabase, auth, adminOnly, async (req, res) => { const { fileName, columns, rowsPreview, importedCount, zoneId, rawData } = req.body; if (!fileName) return res.status(400).json({ error: 'File name is required' }); const result = await pool.query('insert into excel_uploads (org_id,file_name,columns,rows_preview,imported_count,zone_id,uploaded_by,raw_data) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id,org_id,file_name,columns,rows_preview,imported_count,zone_id,uploaded_by,created_at', [req.user.orgId, fileName, JSON.stringify(columns || []), JSON.stringify(rowsPreview || []), importedCount || 0, zoneId || null, req.user.id, JSON.stringify(rawData || [])]); res.status(201).json(result.rows[0]) })
app.post('/api/admin/sessions', requireDatabase, auth, adminOnly, async (req, res) => { const { name, location_id, zone_id, item_ids, counter_ids, mode, auditor_id, auditor_sample_item_ids } = req.body; if (!item_ids?.length || !counter_ids?.length || item_ids.length < counter_ids.length) return res.status(400).json({ error: 'Select at least one product per counter' }); const sampleIds = Array.isArray(auditor_sample_item_ids) ? auditor_sample_item_ids : []; if (auditor_id && sampleIds.length && sampleIds.some(id => !item_ids.includes(id))) return res.status(400).json({ error: 'Auditor sample products must be among the products assigned to a counter' }); const values = []; const placeholders = counter_ids.map((counterId, index) => { const assigned = item_ids.filter((_, itemIndex) => itemIndex % counter_ids.length === index); const assignedSamples = auditor_id ? assigned.filter(id => sampleIds.includes(id)) : []; const offset = values.length; values.push(req.user.orgId, location_id || null, zone_id || null, counter_ids.length === 1 ? name : `${name} - Assignment ${index + 1}`, mode || 'blind', assigned, counterId, auditor_id || null, assignedSamples.length ? assignedSamples : null); return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9})` }).join(','); const result = await pool.query(`insert into count_sessions (org_id,location_id,zone_id,name,mode,item_ids,assigned_counter_id,auditor_id,auditor_sample_item_ids) values ${placeholders} returning *`, values); res.status(201).json(result.rows) })
app.delete('/api/admin/org', requireDatabase, auth, adminOnly, async (req, res) => {
  const { confirm1, confirm2, shopName } = req.body
  if (String(confirm1 || '').trim().toLowerCase() !== 'my shop') return res.status(400).json({ error: 'First confirmation phrase must be "my shop"' })
  if (String(confirm2 || '').trim().toLowerCase() !== 'delete myshop') return res.status(400).json({ error: 'Second confirmation phrase must be "delete myshop"' })
  const org = await pool.query('select id, name from organizations where id=$1', [req.user.orgId])
  if (!org.rowCount) return res.status(404).json({ error: 'Shop not found' })
  if (String(shopName || '').trim().toLowerCase() !== String(org.rows[0].name).trim().toLowerCase()) return res.status(400).json({ error: 'The shop name you entered does not match this workspace' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('delete from count_entries where session_id in (select id from count_sessions where org_id=$1)', [req.user.orgId])
    await client.query('delete from count_reports where org_id=$1', [req.user.orgId])
    await client.query('delete from excel_uploads where org_id=$1', [req.user.orgId])
    await client.query('delete from audit_logs where org_id=$1', [req.user.orgId])
    await client.query('delete from sales where org_id=$1', [req.user.orgId])
    await client.query('delete from count_sessions where org_id=$1', [req.user.orgId])
    await client.query('delete from items where org_id=$1', [req.user.orgId])
    await client.query('delete from zones where location_id in (select id from locations where org_id=$1)', [req.user.orgId])
    await client.query('delete from locations where org_id=$1', [req.user.orgId])
    await client.query('delete from users where org_id=$1', [req.user.orgId])
    const result = await client.query('delete from organizations where id=$1 returning id', [req.user.orgId])
    await client.query('COMMIT')
    res.json({ success: true, deleted: Boolean(result.rowCount) })
  } catch (error) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: `Unable to delete shop: ${error.message}` })
  } finally { client.release() }
})
app.get('/api/mobile/org', requireDatabase, auth, async (req, res) => { const result = await pool.query('select id,name,logo_url,tagline,address,variance_threshold_pct,variance_threshold_units,created_at from organizations where id=$1', [req.user.orgId]); res.json(result.rows[0]) })
app.get('/api/mobile/sessions', requireDatabase, auth, async (req, res) => { const params = [req.user.orgId]; let sql = 'select * from count_sessions where org_id=$1 and (assigned_counter_id=$2 or assigned_counter_2_id=$2 or auditor_id=$2)'; params.push(req.user.id); if (req.query.status) { params.push(req.query.status); sql += ` and status=$${params.length}` } const result = await pool.query(sql + ' order by created_at desc', params); res.json(result.rows) })
app.get('/api/mobile/sessions/:id', requireDatabase, auth, async (req, res) => { const result = await pool.query('select * from count_sessions where id=$1 and org_id=$2', [req.params.id, req.user.orgId]); res.json(result.rows[0] || null) })
app.get('/api/mobile/sessions/:id/items', requireDatabase, auth, async (req, res) => { const session = await pool.query('select * from count_sessions where id=$1 and org_id=$2 and (assigned_counter_id=$3 or assigned_counter_2_id=$3 or auditor_id=$3)', [req.params.id, req.user.orgId, req.user.id]); if (!session.rowCount) return res.status(404).json({ error: 'Session not found' }); const s = session.rows[0]; const sampleSet = Array.isArray(s.auditor_sample_item_ids) ? new Set(s.auditor_sample_item_ids) : new Set(); const canSeeSystemQuantity = session.rows[0].mode === 'visible' || session.rows[0].auditor_id === req.user.id; const result = await pool.query(`select i.*, e.id as entry_id, e.counted_qty, e.system_qty as entry_system_qty, e.variance, e.counted_by, e.counted_at, e.is_flagged, e.notes, e.count_round, e.witnessed, e.witness_name, e.entry_role, e.counter_entry_id from items i join count_sessions s on s.id=$1 and s.org_id=$2 and i.id = any(s.item_ids) left join lateral (select * from count_entries where session_id=s.id and item_id=i.id order by count_round desc, counted_at desc limit 1) e on true order by i.name`, [req.params.id, req.user.orgId]); res.json(result.rows.map(row => ({ is_auditor_sample: sampleSet.has(row.id), system_qty: canSeeSystemQuantity ? row.system_qty : null, item: { id: row.id, org_id: row.org_id, zone_id: row.zone_id, name: row.name, barcode: row.barcode, sku: row.sku, unit: row.unit, category: row.category, system_qty: canSeeSystemQuantity ? row.system_qty : null, image_url: row.image_url, created_at: row.created_at, updated_at: row.updated_at }, entry: row.entry_id ? { id: row.entry_id, session_id: req.params.id, item_id: row.id, counted_qty: row.counted_qty, system_qty: canSeeSystemQuantity ? row.entry_system_qty : null, variance: row.variance, counted_by: row.counted_by, counted_at: row.counted_at, is_flagged: row.is_flagged, notes: row.notes, count_round: row.count_round, witnessed: row.witnessed, witness_name: row.witness_name, entry_role: row.entry_role || 'counter', counter_entry_id: row.counter_entry_id || null } : null }))) })
app.get('/api/mobile/sessions/:id/entries', requireDatabase, auth, async (req, res) => { const result = await pool.query('select e.*, i.name as item_name, i.sku, i.barcode, i.unit as item_unit, u.full_name as counter_name from count_entries e join count_sessions s on s.id=e.session_id and s.org_id=$2 and (s.assigned_counter_id=$3 or s.assigned_counter_2_id=$3 or s.auditor_id=$3) join items i on i.id=e.item_id join users u on u.id=e.counted_by where e.session_id=$1 order by e.counted_at', [req.params.id, req.user.orgId, req.user.id]); res.json(result.rows.map(row => ({ ...row, item: { id: row.item_id, name: row.item_name, sku: row.sku, barcode: row.barcode, unit: row.item_unit }, counter: { id: row.counted_by, full_name: row.counter_name } }))) })
app.post('/api/mobile/sessions/:id/start', requireDatabase, auth, async (req, res) => { const result = await pool.query('update count_sessions set status=$1, updated_at=now() where id=$2 and org_id=$3 and assigned_counter_id=$4 and status=$5 returning *', ['in_progress', req.params.id, req.user.orgId, req.user.id, 'draft']); if (!result.rowCount) return res.status(400).json({ error: 'Session cannot be started' }); res.json(result.rows[0]) })
app.post('/api/mobile/sessions/:id/entries', requireDatabase, auth, async (req, res) => { const { itemId, countedQty, notes, witnessed, witnessName } = req.body; const session = await pool.query('select s.*, o.variance_threshold_pct, o.variance_threshold_units from count_sessions s join organizations o on o.id=s.org_id where s.id=$1 and s.org_id=$2 and (s.assigned_counter_id=$3 or s.auditor_id=$3) and s.status in ($4,$5)', [req.params.id, req.user.orgId, req.user.id, 'in_progress', 'recount_assigned']); const item = await pool.query('select * from items where id=$1 and org_id=$2', [itemId, req.user.orgId]); if (!session.rowCount || !item.rowCount) return res.status(404).json({ error: 'Session or item not found' }); const s = session.rows[0]; const isAuditor = s.auditor_id === req.user.id; const sampleSet = Array.isArray(s.auditor_sample_item_ids) ? new Set(s.auditor_sample_item_ids) : new Set(); if (isAuditor && !sampleSet.has(itemId)) return res.status(403).json({ error: 'The auditor may only count the sample products assigned for verification' }); const current = await pool.query('select * from count_entries where session_id=$1 and item_id=$2 and counted_by=$3 order by count_round asc', [req.params.id, itemId, s.assigned_counter_id]); const countRound = isAuditor ? Math.max(1, current.rows.length) : (current.rows.length + 1); if (isAuditor) { const counterEntry = current.rows.find(e => e.count_round === countRound); if (!counterEntry) return res.status(400).json({ error: 'The counter must count this product first before you verify it' }); if (countRound === 3 && Number(countedQty) !== Number(counterEntry.counted_qty)) return res.status(400).json({ error: 'The auditor and counter must agree on the final count with a third person present' }); } if (countRound === 3 && (!witnessed || !String(witnessName || '').trim())) return res.status(400).json({ error: 'A third-party witness name is required for the third count' }); const product = item.rows[0]; const variance = Number(countedQty) - Number(product.system_qty); const isFlagged = Math.abs(variance) > 0 && (Math.abs(variance / Number(product.system_qty || 1)) * 100 > Number(session.rows[0].variance_threshold_pct) || Math.abs(variance) > Number(session.rows[0].variance_threshold_units)); const counterEntryId = isAuditor ? (current.rows.find(e => e.count_round === countRound)?.id || null) : null; const result = await pool.query('insert into count_entries (session_id,item_id,counted_qty,system_qty,variance,counted_by,is_flagged,notes,count_round,witnessed,witness_name,entry_role,counter_entry_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *', [req.params.id, itemId, countedQty, product.system_qty, variance, req.user.id, isFlagged, notes || null, countRound, Boolean(witnessed), witnessName?.trim() || null, isAuditor ? 'auditor' : 'counter', counterEntryId]); if (isAuditor && Number(countedQty) !== Number(current.rows.find(e => e.count_round === countRound)?.counted_qty)) { const targetId = current.rows.find(e => e.count_round === countRound)?.id; if (targetId) await pool.query('update count_entries set is_flagged=true where id=$1', [targetId]); } res.status(201).json(result.rows[0]) })
app.post('/api/mobile/sessions/:id/submit', requireDatabase, auth, async (req, res) => { const session = await pool.query('select * from count_sessions where id=$1 and org_id=$2 and assigned_counter_id=$3 and status in ($4,$5)', [req.params.id, req.user.orgId, req.user.id, 'in_progress', 'recount_assigned']); if (!session.rowCount) return res.status(400).json({ error: 'Session cannot be submitted' }); const s = session.rows[0]; const scopedIds = Array.isArray(s.recount_item_ids) && s.recount_item_ids.length ? s.recount_item_ids : s.item_ids; const sampleSet = Array.isArray(s.auditor_sample_item_ids) ? new Set(s.auditor_sample_item_ids) : new Set(); const entries = await pool.query('select * from count_entries where session_id=$1 and item_id = any($2::uuid[]) order by item_id, count_round, counted_at', [req.params.id, scopedIds]); const byItem = new Map(); for (const row of entries.rows) { const item = byItem.get(row.item_id) || { counter: null, auditor: null, counterRound: 0 }; if (row.entry_role === 'auditor') { if (!item.auditor || (row.count_round ?? 0) > (item.auditor.count_round ?? 0)) item.auditor = row; } else if (String(row.counted_by) === String(s.assigned_counter_id)) { if (!item.counter || (row.count_round ?? 0) > (item.counter.count_round ?? 0)) item.counter = row; item.counterRound = Math.max(item.counterRound, row.count_round ?? 0); } byItem.set(row.item_id, item); } for (const itemId of scopedIds) { const item = byItem.get(itemId) || { counter: null, auditor: null, counterRound: 0 }; if (!item.counter) return res.status(400).json({ error: 'Every item must be counted before submission' }); const isSample = sampleSet.has(itemId); if (isSample && s.auditor_id && (!item.auditor || Number(item.auditor.count_round) !== Number(item.counter.count_round))) return res.status(400).json({ error: 'Every sample product must be verified by the auditor before submission' }); const counterVariance = Number(item.counter.variance) !== 0; const auditorDisagrees = item.auditor ? Number(item.auditor.counted_qty) !== Number(item.counter.counted_qty) : false; const hasVariance = counterVariance || auditorDisagrees; if (hasVariance && Number(item.counter.count_round) < 3) return res.status(400).json({ error: 'Every item with a variance must be recounted before submission' }); } const newStatus = s.auditor_id ? 'submitted_to_admin' : 'submitted'; const result = await pool.query('update count_sessions set status=$1, submitted_at=now(), recount_item_ids=null, updated_at=now() where id=$2 and org_id=$3 and assigned_counter_id=$4 returning *', [newStatus, req.params.id, req.user.orgId, req.user.id]); if (!result.rowCount) return res.status(400).json({ error: 'Session cannot be submitted' }); await pool.query("insert into audit_logs (org_id,entity_type,entity_id,action,actor_id,payload) values ($1,$2,$3,$4,$5,$6)", [req.user.orgId, 'session', req.params.id, 'submitted', req.user.id, JSON.stringify({ routed_to: newStatus })]); res.json(result.rows[0]) })
app.post('/api/mobile/sessions/:id/approve', requireDatabase, auth, async (req, res) => { const client = await pool.connect(); try { await client.query('BEGIN'); const result = await client.query('update count_sessions set status=$1, auditor_id=$2, approved_at=now(), updated_at=now() where id=$3 and org_id=$4 and auditor_id=$2 and status=$5 returning *', ['approved', req.user.id, req.params.id, req.user.orgId, 'submitted']); if (!result.rowCount) return res.status(400).json({ error: 'Session cannot be approved' }); await client.query('update items i set system_qty=e.counted_qty, updated_at=now() from (select distinct on (item_id) item_id, counted_qty from count_entries where session_id=$1 order by item_id, count_round desc) e where i.id=e.item_id and i.org_id=$2', [req.params.id, req.user.orgId]); await client.query('insert into audit_logs (org_id,entity_type,entity_id,action,actor_id,payload) values ($1,$2,$3,$4,$5,$6)', [req.user.orgId, 'session', req.params.id, 'approved', req.user.id, JSON.stringify({ entries_updated: true })]); await client.query('COMMIT'); res.json(result.rows[0]) } catch (error) { await client.query('ROLLBACK'); res.status(400).json({ error: error.message }) } finally { client.release() } })
app.post('/api/mobile/sessions/:id/reject', requireDatabase, auth, async (req, res) => { const result = await pool.query('update count_sessions set status=$1, auditor_id=$2, rejected_at=now(), reject_reason=$3, updated_at=now() where id=$4 and org_id=$5 and auditor_id=$2 and status=$6 returning *', ['rejected', req.user.id, req.body.reason || 'Rejected by auditor', req.params.id, req.user.orgId, 'submitted']); if (!result.rowCount) return res.status(400).json({ error: 'Session cannot be rejected' }); await pool.query('insert into audit_logs (org_id,entity_type,entity_id,action,actor_id,payload,reason) values ($1,$2,$3,$4,$5,$6,$7)', [req.user.orgId, 'session', req.params.id, 'rejected', req.user.id, '{}', req.body.reason || null]); res.json(result.rows[0]) })
app.post('/api/mobile/sessions/:id/recount', requireDatabase, auth, async (req, res) => { const result = await pool.query('update count_sessions set status=$1, assigned_counter_id=$2, auditor_id=$3, updated_at=now() where id=$4 and org_id=$5 and auditor_id=$3 and status in ($6,$7) returning *', ['recount_assigned', req.body.counterId, req.user.id, req.params.id, req.user.orgId, 'submitted', 'rejected']); if (!result.rowCount) return res.status(400).json({ error: 'Session cannot be assigned for recount' }); await pool.query('insert into audit_logs (org_id,entity_type,entity_id,action,actor_id,payload) values ($1,$2,$3,$4,$5,$6)', [req.user.orgId, 'session', req.params.id, 'recount_assigned', req.user.id, JSON.stringify({ counter: req.body.counterId })]); res.json(result.rows[0]) })
app.get('/api/mobile/locations', requireDatabase, auth, async (req, res) => { const result = await pool.query('select * from locations where org_id=$1 order by name', [req.user.orgId]); res.json(result.rows) })
app.get('/api/mobile/zones', requireDatabase, auth, async (req, res) => { const result = await pool.query('select z.* from zones z join locations l on l.id=z.location_id where l.org_id=$1 and z.location_id=$2 order by z.name', [req.user.orgId, req.query.locationId]); res.json(result.rows) })
app.get('/api/mobile/items', requireDatabase, auth, async (req, res) => { const values = [req.user.orgId]; let sql = 'select * from items where org_id=$1'; if (req.query.zoneId) { values.push(req.query.zoneId); sql += ` and zone_id=$${values.length}` } if (req.query.search) { values.push(`%${req.query.search}%`); sql += ` and (name ilike $${values.length} or sku ilike $${values.length} or barcode ilike $${values.length})` } const result = await pool.query(sql + ' order by name', values); res.json(result.rows) })
app.get('/api/mobile/items/barcode/:barcode', requireDatabase, auth, async (req, res) => { const result = await pool.query('select * from items where org_id=$1 and barcode=$2', [req.user.orgId, req.params.barcode]); res.json(result.rows[0] || null) })
app.get('/api/mobile/audit-logs', requireDatabase, auth, async (req, res) => { const result = await pool.query('select * from audit_logs where org_id=$1 order by created_at desc limit 100', [req.user.orgId]); res.json(result.rows) })
app.post('/api/mobile/audit-logs', requireDatabase, auth, async (req, res) => { const { entityType, entityId, note } = req.body; const result = await pool.query('insert into audit_logs (org_id,entity_type,entity_id,action,actor_id,payload) values ($1,$2,$3,$4,$5,$6) returning *', [req.user.orgId, entityType, entityId, 'note', req.user.id, JSON.stringify({ note })]); res.status(201).json(result.rows[0]) })

app.get('/api/admin/sessions/:id/entries', requireDatabase, auth, adminOnly, async (req, res) => { const result = await pool.query('select e.*, i.name as item_name, i.sku, i.unit as item_unit, u.full_name as counter_name from count_entries e join count_sessions s on s.id=e.session_id and s.org_id=$2 join items i on i.id=e.item_id left join users u on u.id=e.counted_by where e.session_id=$1 order by i.name, e.count_round', [req.params.id, req.user.orgId]); res.json(result.rows.map(row => ({ ...row, item: { id: row.item_id, name: row.item_name, sku: row.sku, unit: row.item_unit }, counter: row.counted_by ? { id: row.counted_by, full_name: row.counter_name } : null }))) })

app.delete('/api/admin/sessions/:id', requireDatabase, auth, adminOnly, async (req, res) => { const session = await pool.query('select id, status from count_sessions where id=$1 and org_id=$2', [req.params.id, req.user.orgId]); if (!session.rowCount) return res.status(404).json({ error: 'Session not found' }); if (session.rows[0].status === 'in_progress') return res.status(400).json({ error: 'Cannot delete a session that is currently in progress' }); const client = await pool.connect(); try { await client.query('BEGIN'); await client.query('delete from count_entries where session_id=$1', [req.params.id]); await client.query('delete from count_reports where session_id=$1', [req.params.id]); await client.query('delete from count_sessions where id=$1 and org_id=$2', [req.params.id, req.user.orgId]); await client.query('COMMIT'); res.json({ success: true }) } catch (error) { await client.query('ROLLBACK'); res.status(500).json({ error: 'Unable to delete session' }) } finally { client.release() } })

app.post('/api/admin/sessions/:id/approve', requireDatabase, auth, adminOnly, async (req, res) => { const client = await pool.connect(); try { await client.query('BEGIN'); const session = await client.query('select * from count_sessions where id=$1 and org_id=$2 and status in ($3,$4)', [req.params.id, req.user.orgId, 'submitted', 'submitted_to_admin']); if (!session.rowCount) return res.status(400).json({ error: 'Session cannot be approved. It may not be in a submitted status.' }); await client.query('update count_sessions set status=$1, auditor_id=$2, approved_at=now(), updated_at=now() where id=$3', ['approved', req.user.id, req.params.id]); await client.query('update items i set system_qty=e.counted_qty, updated_at=now() from (select distinct on (item_id) item_id, counted_qty from count_entries where session_id=$1 order by item_id, count_round desc) e where i.id=e.item_id and i.org_id=$2', [req.params.id, req.user.orgId]); await client.query('insert into audit_logs (org_id,entity_type,entity_id,action,actor_id,payload) values ($1,$2,$3,$4,$5,$6)', [req.user.orgId, 'session', req.params.id, 'approved', req.user.id, JSON.stringify({ entries_updated: true, reviewed_by: 'admin' })]); await client.query('COMMIT'); const updated = await client.query('select * from count_sessions where id=$1', [req.params.id]); res.json(updated.rows[0]) } catch (error) { await client.query('ROLLBACK'); res.status(400).json({ error: error.message }) } finally { client.release() } })

app.post('/api/admin/sessions/:id/reject', requireDatabase, auth, adminOnly, async (req, res) => { const session = await pool.query('select * from count_sessions where id=$1 and org_id=$2 and status in ($3,$4)', [req.params.id, req.user.orgId, 'submitted', 'submitted_to_admin']); if (!session.rowCount) return res.status(400).json({ error: 'Session cannot be rejected. It may not be in a submitted status.' }); const result = await pool.query('update count_sessions set status=$1, auditor_id=$2, rejected_at=now(), reject_reason=$3, updated_at=now() where id=$4 and org_id=$5 returning *', ['rejected', req.user.id, req.body.reason || 'Rejected by admin', req.params.id, req.user.orgId]); await pool.query('insert into audit_logs (org_id,entity_type,entity_id,action,actor_id,payload,reason) values ($1,$2,$3,$4,$5,$6,$7)', [req.user.orgId, 'session', req.params.id, 'rejected', req.user.id, '{}', req.body.reason || null]); res.json(result.rows[0]) })

app.post('/api/admin/sessions/:id/recount', requireDatabase, auth, adminOnly, async (req, res) => { const session = await pool.query('select * from count_sessions where id=$1 and org_id=$2 and status in ($3,$4)', [req.params.id, req.user.orgId, 'submitted', 'submitted_to_admin']); if (!session.rowCount) return res.status(400).json({ error: 'Session cannot be assigned for recount. It may not be in a submitted status.' }); const sess = session.rows[0]; const entries = await pool.query('select e.item_id, e.variance, e.count_round from count_entries e where e.session_id=$1 order by e.item_id, e.count_round desc', [req.params.id]); const seen = new Map(); for (const row of entries.rows) { if (!seen.has(row.item_id)) seen.set(row.item_id, row); } const varianceItemIds = [...seen.values()].filter(e => Number(e.variance) !== 0 && Number(e.count_round) < 3).map(e => e.item_id); const counterId = req.body.counterId || sess.assigned_counter_id; const recountItems = varianceItemIds.length ? JSON.stringify(varianceItemIds) : null; const result = await pool.query('update count_sessions set status=$1, assigned_counter_id=$2, auditor_id=$3, recount_item_ids=$4, updated_at=now() where id=$5 and org_id=$6 returning *', ['recount_assigned', counterId, sess.auditor_id || null, recountItems, req.params.id, req.user.orgId]); await pool.query('insert into audit_logs (org_id,entity_type,entity_id,action,actor_id,payload) values ($1,$2,$3,$4,$5,$6)', [req.user.orgId, 'session', req.params.id, 'recount_assigned', req.user.id, JSON.stringify({ counter: counterId, assigned_by: 'admin', itemIds: varianceItemIds })]); res.json(result.rows[0]) })

app.post('/api/admin/sessions/:id/report', requireDatabase, auth, adminOnly, async (req, res) => { const { summary, report_type } = req.body; const session = await pool.query('select * from count_sessions where id=$1 and org_id=$2', [req.params.id, req.user.orgId]); if (!session.rowCount) return res.status(404).json({ error: 'Session not found' }); const entries = await pool.query('select e.*, i.name as item_name, i.sku from count_entries e join items i on i.id=e.item_id where e.session_id=$1 order by i.name, e.count_round desc', [req.params.id]); const seen = new Map(); for (const row of entries.rows) { if (!seen.has(row.item_id)) seen.set(row.item_id, row); } const itemsSummary = [...seen.values()].map(row => ({ item_id: row.item_id, name: row.item_name, sku: row.sku, system_qty: Number(row.system_qty), counted_qty: Number(row.counted_qty), variance: Number(row.variance), is_flagged: row.is_flagged, count_round: row.count_round })); const totalItems = itemsSummary.length; const matchedItems = itemsSummary.filter(item => item.variance === 0).length; const varianceItems = totalItems - matchedItems; const reportType = report_type || (session.rows[0].auditor_id === req.user.id ? 'auditor' : 'admin'); const existing = await pool.query('select id from count_reports where session_id=$1', [req.params.id]); let result; if (existing.rowCount) { result = await pool.query('update count_reports set summary=$1, items_summary=$2, total_items=$3, matched_items=$4, variance_items=$5, status=$6, report_type=$7, submitted_by=$8 where session_id=$9 returning *', [summary || null, JSON.stringify(itemsSummary), totalItems, matchedItems, varianceItems, 'submitted', reportType, req.user.id, req.params.id]); } else { result = await pool.query('insert into count_reports (org_id,session_id,submitted_by,report_type,summary,items_summary,total_items,matched_items,variance_items,status) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *', [req.user.orgId, req.params.id, req.user.id, reportType, summary || null, JSON.stringify(itemsSummary), totalItems, matchedItems, varianceItems, 'submitted']); } res.status(201).json(result.rows[0]) })

app.get('/api/admin/sessions/:id/report', requireDatabase, auth, adminOnly, async (req, res) => { const result = await pool.query('select r.*, u.full_name as submitted_by_name from count_reports r left join users u on u.id=r.submitted_by where r.session_id=$1 and r.org_id=$2', [req.params.id, req.user.orgId]); res.json(result.rows[0] || null) })

app.get('/api/quotations', requireDatabase, auth, async (req, res) => { const result = await pool.query('select q.*, u.full_name as seller_name, (select count(*)::int from quotation_items qi where qi.quotation_id=q.id) as line_count from quotations q left join users u on u.id=q.seller_id where q.org_id=$1 order by q.created_at desc', [req.user.orgId]); res.json(result.rows) })
app.get('/api/quotations/:id', requireDatabase, auth, async (req, res) => { const q = await pool.query('select q.*, u.full_name as seller_name, u.phone as seller_phone, o.name as org_name, o.logo_url, o.tagline, o.address as org_address from quotations q left join users u on u.id=q.seller_id join organizations o on o.id=q.org_id where q.id=$1 and q.org_id=$2', [req.params.id, req.user.orgId]); if (!q.rowCount) return res.status(404).json({ error: 'Quotation not found' }); const items = await pool.query('select * from quotation_items where quotation_id=$1 order by id', [req.params.id]); res.json({ ...q.rows[0], items: items.rows }) })
app.post('/api/quotations', requireDatabase, auth, async (req, res) => {
  const { customer_name, customer_contact, notes, valid_until, items } = req.body
  if (!customer_name || !String(customer_name).trim()) return res.status(400).json({ error: 'Customer name is required' })
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Add at least one product line' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const lineRows = []
    let total = 0
    for (const line of items) {
      const qty = Number(line.quantity)
      if (!line.item_id || !(qty > 0)) throw new Error('Each line needs a product and a quantity greater than zero')
      const item = await client.query('select * from items where id=$1 and org_id=$2', [line.item_id, req.user.orgId])
      if (!item.rowCount) throw new Error('A selected product no longer exists')
      const it = item.rows[0]
      const price = Number(line.unit_price) >= 0 ? Number(line.unit_price) : Number(it.selling_price) || 0
      const lineTotal = qty * price
      total += lineTotal
      lineRows.push({ item_id: it.id, item_name: it.name, sku: it.sku, unit: it.unit, quantity: qty, unit_price: price, total: lineTotal })
    }
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const reference = `QT-${day}-${crypto.randomInt(1000, 9999)}`
    const q = await client.query('insert into quotations (org_id, seller_id, reference, customer_name, customer_contact, notes, total, valid_until, status) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *', [req.user.orgId, req.user.id, reference, customer_name.trim(), customer_contact ? String(customer_contact).trim() : null, notes ? String(notes).trim() : null, total, valid_until || null, 'draft'])
    for (const line of lineRows) await client.query('insert into quotation_items (quotation_id, item_id, item_name, sku, unit, quantity, unit_price, total) values ($1,$2,$3,$4,$5,$6,$7,$8)', [q.rows[0].id, line.item_id, line.item_name, line.sku, line.unit, line.quantity, line.unit_price, line.total])
    await client.query('COMMIT')
    const saved = await pool.query('select q.*, u.full_name as seller_name, o.name as org_name, o.logo_url, o.tagline from quotations q left join users u on u.id=q.seller_id join organizations o on o.id=q.org_id where q.id=$1', [q.rows[0].id])
    const savedItems = await pool.query('select * from quotation_items where quotation_id=$1 order by id', [q.rows[0].id])
    res.status(201).json({ ...saved.rows[0], items: savedItems.rows })
  } catch (error) { await client.query('ROLLBACK'); res.status(400).json({ error: error.message }) } finally { client.release() }
})

app.use((err, req, res, next) => {
  res.status(err.status || (err.type && 400) || 500).json({ diagnostic: true, message: err.message, type: err.type, status: err.status, body: req.body, hasBodyGetter: 'body' in req })
})

module.exports = app
function publicUser(user) { return { id: user.id, org_id: user.org_id, role: user.role, full_name: user.full_name, email: user.email, phone: user.phone, is_active: user.is_active, setup_status: user.setup_status, created_at: user.created_at } }
