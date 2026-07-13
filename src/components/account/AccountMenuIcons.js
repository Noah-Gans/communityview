import React from 'react';

/**
 * Community View account-menu icons — same thin-stroke family as before,
 * with shapes tuned to this product (profile, billing, map, tour).
 */
const iconProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
  'aria-hidden': true,
};

const stroke = {
  stroke: 'currentColor',
  strokeWidth: 1.65,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

/** ID card / profile — account settings */
export const IconUser = () => (
  <svg {...iconProps}>
    <rect x="4" y="3" width="16" height="18" rx="3" {...stroke} />
    <circle cx="12" cy="10" r="2.75" {...stroke} />
    <path d="M8.5 16.5c.65-1.85 2-2.75 3.5-2.75s2.85.9 3.5 2.75" {...stroke} />
    <path d="M15.5 6h2.5" {...stroke} />
  </svg>
);

/** Subscription card + renewal arc */
export const IconCreditCard = () => (
  <svg {...iconProps}>
    <rect x="3" y="7" width="18" height="12" rx="2" {...stroke} />
    <path d="M3 11h18" {...stroke} />
    <path d="M7 15h5" {...stroke} />
    <path
      d="M17.5 4.5a3.25 3.25 0 1 1-2.3 5.55"
      {...stroke}
    />
    <path d="M17.5 4.5V7l2 1.1" {...stroke} />
  </svg>
);

/** Shield lock — change password */
export const IconLock = () => (
  <svg {...iconProps}>
    <path
      d="M12 3.75 7 6.25v4.9c0 2.85 2.15 5.1 5 6.35 2.85-1.25 5-3.5 5-6.35v-4.9L12 3.75Z"
      {...stroke}
    />
    <rect x="10.25" y="11" width="3.5" height="4" rx="1" {...stroke} />
    <path d="M12 11V9.75a1 1 0 0 1 2 0V11" {...stroke} />
  </svg>
);

/** Map pin + paint dots — highlight settings */
export const IconPalette = () => (
  <svg {...iconProps}>
    <path
      d="M12 20.5S7 16.8 7 12.2a5 5 0 1 1 10 0c0 4.6-5 8.3-5 8.3Z"
      {...stroke}
    />
    <circle cx="12" cy="12" r="1.75" {...stroke} />
    <circle cx="18.25" cy="6.25" r="1.5" fill="currentColor" opacity="0.4" />
    <circle cx="20" cy="10" r="1.15" fill="currentColor" opacity="0.65" />
    <path d="M17.25 5.25 19.5 3" {...stroke} />
  </svg>
);

/** Map frame + tour path — quick tour */
export const IconCompass = () => (
  <svg {...iconProps}>
    <rect x="3" y="4" width="18" height="16" rx="2" {...stroke} />
    <path d="M3 9.5h18M9 4v16" {...stroke} />
    <path
      d="M12.5 13.5 15 11l2.5 2.5M12.5 13.5v3"
      {...stroke}
    />
    <circle cx="11" cy="16.5" r="0.9" fill="currentColor" />
    <circle cx="15" cy="11" r="0.9" fill="currentColor" />
    <circle cx="17.5" cy="13.5" r="0.9" fill="currentColor" />
  </svg>
);

/** Exit door — sign out */
export const IconLogOut = () => (
  <svg {...iconProps}>
    <path
      d="M9.5 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3.5"
      {...stroke}
    />
    <path d="M13 12H4" {...stroke} />
    <path d="M17 8.5 20.5 12 17 15.5" {...stroke} />
    <path d="M11 12h9.5" {...stroke} />
  </svg>
);

export const IconChevronRight = () => (
  <svg {...iconProps} width={16} height={16}>
    <path d="M9.5 7.5 13 11l-3.5 3.5" {...stroke} />
  </svg>
);

export const IconChevronLeft = () => (
  <svg {...iconProps} width={20} height={20}>
    <path d="M14.5 7.5 11 11l3.5 3.5" {...stroke} />
  </svg>
);

/** Parcel / ID number */
export const IconParcel = () => (
  <svg {...iconProps}>
    <rect x="5" y="3" width="14" height="18" rx="2" {...stroke} />
    <path d="M9 8h6M9 12h6M9 16h4" {...stroke} />
  </svg>
);

/** Street address */
export const IconHome = () => (
  <svg {...iconProps}>
    <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" {...stroke} />
  </svg>
);

/** City / county location */
export const IconMapPin = () => (
  <svg {...iconProps}>
    <path d="M12 21s-6-4.6-6-10a6 6 0 1 1 12 0c0 5.4-6 10-6 10Z" {...stroke} />
    <circle cx="12" cy="11" r="2" {...stroke} />
  </svg>
);

/** Mailing address */
export const IconMail = () => (
  <svg {...iconProps}>
    <rect x="3" y="6" width="18" height="13" rx="2" {...stroke} />
    <path d="m3 8 9 6 9-6" {...stroke} />
  </svg>
);

/** Legal description */
export const IconDocument = () => (
  <svg {...iconProps}>
    <path d="M8 4h8l4 4v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" {...stroke} />
    <path d="M16 4v4h4M10 11h4M10 15h6" {...stroke} />
  </svg>
);

/** Flood zone section */
export const IconFlood = () => (
  <svg {...iconProps}>
    <path
      d="M12 3.5c-2.2 3.2-5 5.2-5 8.5a5 5 0 0 0 10 0c0-3.3-2.8-5.3-5-8.5Z"
      {...stroke}
    />
    <path d="M6.5 18.5c1.2 1 2.6 1.5 5.5 1.5s4.3-.5 5.5-1.5" {...stroke} />
  </svg>
);
