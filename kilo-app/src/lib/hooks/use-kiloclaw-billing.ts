type ClawBillingStatus = {
  hasAccess: boolean;
  accessReason: 'trial' | 'subscription' | 'earlybird' | null;
  trialEligible: boolean;
  trial: {
    startedAt: string;
    endsAt: string;
    daysRemaining: number;
    expired: boolean;
  } | null;
  subscription: {
    plan: 'commit' | 'standard';
    status: 'active' | 'past_due' | 'canceled' | 'unpaid';
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string;
    commitEndsAt: string | null;
    scheduledPlan: 'commit' | 'standard' | null;
    scheduledBy: 'auto' | 'user' | null;
  } | null;
  earlybird: {
    purchased: boolean;
    expiresAt: string;
    daysRemaining: number;
  } | null;
  instance: {
    exists: boolean;
    status: 'running' | 'stopped' | 'provisioned' | 'destroying' | null;
    suspendedAt: string | null;
    destructionDeadline: string | null;
    destroyed: boolean;
  } | null;
};

type ClawBannerState =
  | 'trial_active'
  | 'trial_ending_soon'
  | 'trial_ending_very_soon'
  | 'trial_expires_today'
  | 'earlybird_active'
  | 'earlybird_ending_soon'
  | 'subscription_canceling'
  | 'subscription_past_due'
  | 'subscribed'
  | 'none';

type ClawLockReason =
  | 'trial_expired_instance_alive'
  | 'trial_expired_instance_destroyed'
  | 'earlybird_expired'
  | 'subscription_expired_instance_alive'
  | 'subscription_expired_instance_destroyed'
  | 'past_due_grace_exceeded'
  | 'no_access'
  | null;

export type { ClawBillingStatus, ClawBannerState, ClawLockReason };

export function deriveBannerState(billing: ClawBillingStatus): ClawBannerState {
  if (billing.subscription) {
    if (billing.subscription.status === 'past_due' || billing.subscription.status === 'unpaid')
      return 'subscription_past_due';
    if (billing.subscription.cancelAtPeriodEnd) return 'subscription_canceling';
    if (billing.subscription.status === 'active') return 'subscribed';
  }
  if (billing.trial && !billing.trial.expired) {
    const d = billing.trial.daysRemaining;
    if (d === 0) return 'trial_expires_today';
    if (d <= 1) return 'trial_ending_very_soon';
    if (d <= 2) return 'trial_ending_soon';
    return 'trial_active';
  }
  if (billing.earlybird) {
    if (billing.earlybird.daysRemaining <= 0) return 'none';
    if (billing.earlybird.daysRemaining <= 30) return 'earlybird_ending_soon';
    return 'earlybird_active';
  }
  return 'none';
}

export function deriveLockReason(billing: ClawBillingStatus): ClawLockReason {
  if (!billing.hasAccess) {
    if (billing.subscription?.status === 'canceled') {
      return billing.instance?.destroyed
        ? 'subscription_expired_instance_destroyed'
        : 'subscription_expired_instance_alive';
    }
    if (billing.subscription?.status === 'past_due' || billing.subscription?.status === 'unpaid') {
      return 'past_due_grace_exceeded';
    }
    if (billing.trial?.expired) {
      return billing.instance?.destroyed
        ? 'trial_expired_instance_destroyed'
        : 'trial_expired_instance_alive';
    }
    if (billing.earlybird && billing.earlybird.daysRemaining <= 0) {
      return 'earlybird_expired';
    }
    if (billing.instance) {
      return 'no_access';
    }
  }
  return null;
}

export function formatBillingDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}
