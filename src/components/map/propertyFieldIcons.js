import {
  IconHome,
  IconMapPin,
  IconDocument,
  IconCreditCard,
  IconPalette,
  IconFlood,
} from '../account/AccountMenuIcons';

/** Icons for expanded property detail section headers (Building, Zoning, etc.) */
export function getPropertySectionIcon(sectionTitle) {
  const text = (sectionTitle || '').toLowerCase();

  if (text.includes('general') || text.includes('overview')) {
    return IconHome;
  }
  if (text.includes('building')) {
    return IconHome;
  }
  if (text.includes('flood') || text.includes('fema')) {
    return IconFlood;
  }
  if (text.includes('zoning') || text.includes('land use')) {
    return IconPalette;
  }
  if (text.includes('financial') || text.includes('tax') || text.includes('value')) {
    return IconCreditCard;
  }
  if (text.includes('land') || text.includes('acre')) {
    return IconMapPin;
  }

  return IconDocument;
}
