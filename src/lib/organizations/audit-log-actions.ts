import z from 'zod';

// Base audit log action type that doesn't depend on @kilocode/db/schema
// This is used by schema.ts and re-exported from organization-audit-logs.ts

export type AuditLogAction = z.infer<typeof AuditLogAction>;

// NOTE: (bmc) - do not change these action names.
// if you introduce a new event action, please use present tense for consistency.
export const AuditLogAction = z.enum([
  'organization.user.login', // ✅
  'organization.user.logout', // TODO: (bmc) - not sure nextauth lets us get this?
  'organization.user.accept_invite', // ✅
  'organization.user.send_invite', // ✅
  'organization.user.revoke_invite', // ✅
  'organization.settings.change', // ✅
  'organization.purchase_credits', // ✅
  'organization.promo_credit_granted', // ✅
  'organization.member.remove', // ✅
  'organization.member.change_role', // ✅
  'organization.sso.auto_provision', // ✅
  'organization.sso.set_domain', // ✅
  'organization.sso.remove_domain', // ✅
  'organization.mode.create', // ✅
  'organization.mode.update', // ✅
  'organization.mode.delete', // ✅
  'organization.created', // ✅
  'organization.token.generate', // ✅
]);
