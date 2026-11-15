// Venue contact details, from the Serve Pickleball Yard Google Maps listing.
export const CONTACT = {
  name: "Serve Pickleball Yard",
  address: "Santa Fe, Agoo, 2504 La Union",
  addressShort: "Santa Fe, Agoo, La Union",
  phone: "0945 840 5038",
  phoneHref: "tel:+639458405038",
  email: "servepy2026@gmail.com",
  messenger: "Serve Pickleball Yard", // add the Facebook page link here when available
  lat: 16.3021975,
  lng: 120.376886,
} as const;

const q = encodeURIComponent(`${CONTACT.name}, ${CONTACT.addressShort}`);

/** Embeddable map (no API key needed), centered on the venue pin. */
export const MAP_EMBED_URL = `https://maps.google.com/maps?q=${q}&ll=${CONTACT.lat},${CONTACT.lng}&z=16&output=embed`;

/** Opens Google Maps (app on phones) with directions to the venue. */
export const DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${CONTACT.lat},${CONTACT.lng}`;
