export const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "plus", "regular"];

export function hasActiveSubscription(subscriptionStatus) {
  return ACTIVE_SUBSCRIPTION_STATUSES.includes(subscriptionStatus);
}
