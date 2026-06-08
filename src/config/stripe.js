import { loadStripe } from '@stripe/stripe-js';

export const STRIPE_PUBLISHABLE_KEY =
  'pk_live_51QjmlpLhg9Kp46ld9puEgtqaxreaPxS1RmLw5Y9XR2hdgrhorL19mJJl3oV6FNeu8Wn23O8SNS0H0FnoqAlg9l4D00RfBRkhf2';

export const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

export const stripeElementsAppearance = {
  theme: 'night',
  variables: {
    colorPrimary: '#006b45',
    colorBackground: '#191919',
    colorText: '#ffffff',
    colorDanger: '#ff6b6b',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", "SF Pro Display", sans-serif',
    spacingUnit: '4px',
    borderRadius: '12px',
  },
};

export const stripeElementsAppearanceLight = {
  theme: 'stripe',
  variables: {
    colorPrimary: '#006b45',
    colorBackground: '#ffffff',
    colorText: '#111827',
    colorDanger: '#dc2626',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", sans-serif',
    spacingUnit: '4px',
    borderRadius: '10px',
  },
};
