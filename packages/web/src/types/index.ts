// ─── Auth / Profiles ──────────────────────────────────────────────────────────

export type UserRole = "admin" | "manager" | "viewer" | "client";

export type Permission =
  | "dashboard"
  | "mpo"
  | "clients"
  | "finance"
  | "budgets"
  | "revenue-target"
  | "reports"
  | "calendar"
  | "analytics"
  | "reminders"
  | "users"
  | "audit"
  | "invoice-wf"
  | "settings"
  | "dataviz"
  | "feed"
  | "production"
  | "portal";

export interface Profile {
  id: string;
  workspace_id: string;
  name: string;
  email: string;
  role: UserRole;
  permissions: Permission[];
  color: string;
  initials: string;
  created_at: string;
}

// ─── Workspaces ───────────────────────────────────────────────────────────────

export interface Workspace {
  id: string;
  name: string;
  brand_color: string;
  plan: "free" | "pro" | "enterprise";
  created_at: string;
}

// ─── Clients & Vendors ────────────────────────────────────────────────────────

export type ClientType = "Client" | "Vendor";
export type RecordStatus = "active" | "inactive";

export interface Client {
  id: string;
  workspace_id: string;
  name: string;
  type: ClientType;
  industry: string;
  contact: string;
  email: string;
  phone?: string;
  spend: number;
  status: RecordStatus;
  created_at?: string;
}

// ─── Media Purchase Orders ────────────────────────────────────────────────────

export type MPOStatus = "draft" | "pending" | "active" | "completed" | "cancelled";
export type MPOExecStatus = "pending" | "on-track" | "delayed" | "completed";
export type MediaChannel = "TV" | "Print" | "Radio" | "Digital" | "OOH" | "Online";
export type Currency = "NGN" | "USD" | "GBP" | "EUR" | "GHS" | "KES";

export interface MPODocument {
  id: string;
  name: string;
  size: number;
  type: string;
  ts: string;
  uploaded_by: string;
}

export interface MPO {
  id: string;
  workspace_id: string;
  client: string;
  vendor: string;
  campaign: string;
  amount: number;
  status: MPOStatus;
  start: string;   // ISO date
  end: string;     // ISO date
  exec: MPOExecStatus;
  channel: MediaChannel;
  currency: Currency;
  docs: MPODocument[];
  created_by?: string;
  created_at?: string;
}

// ─── Invoices / Receivables ───────────────────────────────────────────────────

export type InvoiceWFStatus = "draft" | "review" | "approved" | "sent";
export type InvoiceStatus = "pending" | "partial" | "paid" | "overdue";

export interface Invoice {
  id: string;
  workspace_id: string;
  client: string;
  mpo: string;       // MPO.id
  amount: number;
  due: string;       // ISO date
  paid: number;
  wfStatus: InvoiceWFStatus;
  status: InvoiceStatus;
  currency: Currency;
  docs: MPODocument[];
  created_at?: string;
}

// ─── Payables ─────────────────────────────────────────────────────────────────

export interface Payable {
  id: string;
  workspace_id: string;
  vendor: string;
  mpo: string;         // MPO.id
  amount: number;
  due: string;         // ISO date
  paid: number;
  description: string;
  status: InvoiceStatus;
  currency: Currency;
  created_at?: string;
}

// ─── Budgets ──────────────────────────────────────────────────────────────────

export interface Budget {
  id: string;
  workspace_id: string;
  mpo_id: string;
  budget_amount: number;
  spent_amount: number;
  alert_pct: number;   // 0-100, e.g. 80 = alert at 80% spent
  period?: string;
  created_at?: string;
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export interface Comment {
  id: string;
  entity_id: string;   // any table's id as text
  user_id: string;
  user_name: string;
  user_color: string;
  user_initials: string;
  text: string;
  created_at: string;
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export type AuditTag = "create" | "workflow" | "payment" | "reminder" | "delete" | "update";

export interface AuditEntry {
  id: string;
  workspace_id: string;
  user_id: string;
  user_name: string;
  user_color: string;
  initials: string;
  action: string;
  entity: string;
  entity_id: string;
  detail: string;
  tag: AuditTag;
  ts: string;
  created_at?: string;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export type NotificationType = "payment" | "overdue" | "workflow" | "reminder" | "create" | "system";

export interface Notification {
  id: string;
  workspace_id: string;
  user_id?: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  ts: string;
  created_at?: string;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface AppSettings {
  companyName: string;
  companyEmail: string;
  address: string;
  phone: string;
  regNumber: string;
  tagline: string;
  brandColor: string;
  fiscalYearStart: string;
  taxRate: number;
  paymentTerms: number;
  defaultCurrency: Currency;
  notifOverdue: boolean;
  notifUpcoming: boolean;
  notifWorkflow: boolean;
  notifAI: boolean;
}

// ─── Supabase DB row types (snake_case from DB) ───────────────────────────────

export interface DBProfile {
  id: string;
  workspace_id: string;
  name: string;
  role: UserRole;
  permissions: string[];
  color: string;
  initials: string;
  created_at: string;
}

export interface DBMpo {
  id: string;
  workspace_id: string;
  client_id: string | null;
  vendor_id: string | null;
  campaign: string;
  channel: string;
  amount: number;
  currency: string;
  status: string;
  exec_status: string;
  start_date: string;
  end_date: string;
  docs: MPODocument[];
  created_by: string | null;
  created_at: string;
}

export interface DBInvoice {
  id: string;
  workspace_id: string;
  mpo_id: string | null;
  client_id: string | null;
  amount: number;
  paid: number;
  due_date: string;
  wf_status: string;
  currency: string;
  docs: MPODocument[];
  created_at: string;
}

export interface DBPayable {
  id: string;
  workspace_id: string;
  mpo_id: string | null;
  vendor_id: string | null;
  amount: number;
  paid: number;
  due_date: string;
  description: string;
  status: string;
  currency: string;
  created_at: string;
}
