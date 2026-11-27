/**
 * @module domain/countries/countries
 * ISO 3166-1 alpha-2 country directory, Unicode flag generator, and offline
 * global city coordinate autocomplete dataset.
 */

/**
 * Country entry with ISO alpha-2 code, English name, and regional flag.
 */
export interface CountryEntry {
  code: string;
  name: string;
  flag: string;
}

/**
 * Curated offline city record with WGS84 coordinates.
 */
export interface CityCoordinateEntry {
  city: string;
  countryCode: string;
  latitude: number;
  longitude: number;
}

/**
 * Total sovereign countries denominator used for World Coverage percentage.
 */
export const TOTAL_UN_COUNTRIES = 195;

/**
 * Converts a 2-letter ISO country code into its Unicode flag emoji.
 * @param {string} code - 2-letter ISO 3166-1 alpha-2 country code.
 * @returns {string} Unicode flag emoji or globe fallback.
 */
export function getCountryFlag(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return '🌍';
  const base = 127397;
  return String.fromCodePoint(
    normalized.charCodeAt(0) + base,
    normalized.charCodeAt(1) + base,
  );
}

const RAW_COUNTRIES: ReadonlyArray<readonly [string, string]> = [
  ['AF', 'Afghanistan'], ['AL', 'Albania'], ['DZ', 'Algeria'], ['AD', 'Andorra'], ['AO', 'Angola'],
  ['AG', 'Antigua and Barbuda'], ['AR', 'Argentina'], ['AM', 'Armenia'], ['AU', 'Australia'], ['AT', 'Austria'],
  ['AZ', 'Azerbaijan'], ['BS', 'Bahamas'], ['BH', 'Bahrain'], ['BD', 'Bangladesh'], ['BB', 'Barbados'],
  ['BY', 'Belarus'], ['BE', 'Belgium'], ['BZ', 'Belize'], ['BJ', 'Benin'], ['BT', 'Bhutan'],
  ['BO', 'Bolivia'], ['BA', 'Bosnia and Herzegovina'], ['BW', 'Botswana'], ['BR', 'Brazil'], ['BN', 'Brunei'],
  ['BG', 'Bulgaria'], ['BF', 'Burkina Faso'], ['BI', 'Burundi'], ['CV', 'Cabo Verde'], ['KH', 'Cambodia'],
  ['CM', 'Cameroon'], ['CA', 'Canada'], ['CF', 'Central African Republic'], ['TD', 'Chad'], ['CL', 'Chile'],
  ['CN', 'China'], ['CO', 'Colombia'], ['KM', 'Comoros'], ['CG', 'Congo'], ['CR', 'Costa Rica'],
  ['HR', 'Croatia'], ['CU', 'Cuba'], ['CY', 'Cyprus'], ['CZ', 'Czechia'], ['CD', 'DR Congo'],
  ['DK', 'Denmark'], ['DJ', 'Djibouti'], ['DM', 'Dominica'], ['DO', 'Dominican Republic'], ['EC', 'Ecuador'],
  ['EG', 'Egypt'], ['SV', 'El Salvador'], ['GQ', 'Equatorial Guinea'], ['ER', 'Eritrea'], ['EE', 'Estonia'],
  ['SZ', 'Eswatini'], ['ET', 'Ethiopia'], ['FJ', 'Fiji'], ['FI', 'Finland'], ['FR', 'France'],
  ['GA', 'Gabon'], ['GM', 'Gambia'], ['GE', 'Georgia'], ['DE', 'Germany'], ['GH', 'Ghana'],
  ['GR', 'Greece'], ['GD', 'Grenada'], ['GT', 'Guatemala'], ['GN', 'Guinea'], ['GW', 'Guinea-Bissau'],
  ['GY', 'Guyana'], ['HT', 'Haiti'], ['HN', 'Honduras'], ['HU', 'Hungary'], ['IS', 'Iceland'],
  ['IN', 'India'], ['ID', 'Indonesia'], ['IR', 'Iran'], ['IQ', 'Iraq'], ['IE', 'Ireland'],
  ['IL', 'Israel'], ['IT', 'Italy'], ['CI', 'Ivory Coast'], ['JM', 'Jamaica'], ['JP', 'Japan'],
  ['JO', 'Jordan'], ['KZ', 'Kazakhstan'], ['KE', 'Kenya'], ['KI', 'Kiribati'], ['KW', 'Kuwait'],
  ['KG', 'Kyrgyzstan'], ['LA', 'Laos'], ['LV', 'Latvia'], ['LB', 'Lebanon'], ['LS', 'Lesotho'],
  ['LR', 'Liberia'], ['LY', 'Libya'], ['LI', 'Liechtenstein'], ['LT', 'Lithuania'], ['LU', 'Luxembourg'],
  ['MG', 'Madagascar'], ['MW', 'Malawi'], ['MY', 'Malaysia'], ['MV', 'Maldives'], ['ML', 'Mali'],
  ['MT', 'Malta'], ['MH', 'Marshall Islands'], ['MR', 'Mauritania'], ['MU', 'Mauritius'], ['MX', 'Mexico'],
  ['FM', 'Micronesia'], ['MD', 'Moldova'], ['MC', 'Monaco'], ['MN', 'Mongolia'], ['ME', 'Montenegro'],
  ['MA', 'Morocco'], ['MZ', 'Mozambique'], ['MM', 'Myanmar'], ['NA', 'Namibia'], ['NR', 'Nauru'],
  ['NP', 'Nepal'], ['NL', 'Netherlands'], ['NZ', 'New Zealand'], ['NI', 'Nicaragua'], ['NE', 'Niger'],
  ['NG', 'Nigeria'], ['KP', 'North Korea'], ['MK', 'North Macedonia'], ['NO', 'Norway'], ['OM', 'Oman'],
  ['PK', 'Pakistan'], ['PW', 'Palau'], ['PS', 'Palestine'], ['PA', 'Panama'], ['PG', 'Papua New Guinea'],
  ['PY', 'Paraguay'], ['PE', 'Peru'], ['PH', 'Philippines'], ['PL', 'Poland'], ['PT', 'Portugal'],
  ['QA', 'Qatar'], ['RO', 'Romania'], ['RU', 'Russia'], ['RW', 'Rwanda'], ['KN', 'Saint Kitts and Nevis'],
  ['LC', 'Saint Lucia'], ['VC', 'Saint Vincent and the Grenadines'], ['WS', 'Samoa'], ['SM', 'San Marino'],
  ['ST', 'Sao Tome and Principe'], ['SA', 'Saudi Arabia'], ['SN', 'Senegal'], ['RS', 'Serbia'],
  ['SC', 'Seychelles'], ['SL', 'Sierra Leone'], ['SG', 'Singapore'], ['SK', 'Slovakia'], ['SI', 'Slovenia'],
  ['SB', 'Solomon Islands'], ['SO', 'Somalia'], ['ZA', 'South Africa'], ['KR', 'South Korea'],
  ['SS', 'South Sudan'], ['ES', 'Spain'], ['LK', 'Sri Lanka'], ['SD', 'Sudan'], ['SR', 'Suriname'],
  ['SE', 'Sweden'], ['CH', 'Switzerland'], ['SY', 'Syria'], ['TW', 'Taiwan'], ['TJ', 'Tajikistan'],
  ['TZ', 'Tanzania'], ['TH', 'Thailand'], ['TL', 'Timor-Leste'], ['TG', 'Togo'], ['TO', 'Tonga'],
  ['TT', 'Trinidad and Tobago'], ['TN', 'Tunisia'], ['TR', 'Turkey'], ['TM', 'Turkmenistan'], ['TV', 'Tuvalu'],
  ['UG', 'Uganda'], ['UA', 'Ukraine'], ['AE', 'United Arab Emirates'], ['GB', 'United Kingdom'],
  ['US', 'United States'], ['UY', 'Uruguay'], ['UZ', 'Uzbekistan'], ['VU', 'Vanuatu'],
  ['VA', 'Vatican City'], ['VE', 'Venezuela'], ['VN', 'Vietnam'], ['YE', 'Yemen'], ['ZM', 'Zambia'],
  ['ZW', 'Zimbabwe'],
];

/**
 * Full directory of countries with computed flag emojis.
 */
export const COUNTRIES: ReadonlyArray<CountryEntry> = RAW_COUNTRIES.map(([code, name]) => ({
  code,
  name,
  flag: getCountryFlag(code),
}));

/**
 * Fast lookup map from uppercase ISO alpha-2 code to `CountryEntry`.
 */
export const COUNTRY_BY_CODE: ReadonlyMap<string, CountryEntry> = new Map(
  COUNTRIES.map((entry) => [entry.code, entry]),
);

/**
 * Curated offline global cities dataset for instant zero-network autocomplete.
 */
export const GLOBAL_CITIES: ReadonlyArray<CityCoordinateEntry> = [
  { city: 'Amsterdam', countryCode: 'NL', latitude: 52.3676, longitude: 4.9041 },
  { city: 'Athens', countryCode: 'GR', latitude: 37.9838, longitude: 23.7275 },
  { city: 'Austin', countryCode: 'US', latitude: 30.2672, longitude: -97.7431 },
  { city: 'Bali (Canggu)', countryCode: 'ID', latitude: -8.6478, longitude: 115.1385 },
  { city: 'Bangkok', countryCode: 'TH', latitude: 13.7563, longitude: 100.5018 },
  { city: 'Barcelona', countryCode: 'ES', latitude: 41.3874, longitude: 2.1686 },
  { city: 'Berlin', countryCode: 'DE', latitude: 52.52, longitude: 13.405 },
  { city: 'Bogotá', countryCode: 'CO', latitude: 4.711, longitude: -74.0721 },
  { city: 'Brussels', countryCode: 'BE', latitude: 50.8503, longitude: 4.3517 },
  { city: 'Budapest', countryCode: 'HU', latitude: 47.4979, longitude: 19.0402 },
  { city: 'Buenos Aires', countryCode: 'AR', latitude: -34.6037, longitude: -58.3816 },
  { city: 'Cape Town', countryCode: 'ZA', latitude: -33.9249, longitude: 18.4241 },
  { city: 'Chicago', countryCode: 'US', latitude: 41.8781, longitude: -87.6298 },
  { city: 'Copenhagen', countryCode: 'DK', latitude: 55.6761, longitude: 12.5683 },
  { city: 'Dubai', countryCode: 'AE', latitude: 25.2048, longitude: 55.2708 },
  { city: 'Dublin', countryCode: 'IE', latitude: 53.3498, longitude: -6.2603 },
  { city: 'Florence', countryCode: 'IT', latitude: 43.7696, longitude: 11.2558 },
  { city: 'Frankfurt', countryCode: 'DE', latitude: 50.1109, longitude: 8.6821 },
  { city: 'Hanoi', countryCode: 'VN', latitude: 21.0278, longitude: 105.8342 },
  { city: 'Helsinki', countryCode: 'FI', latitude: 60.1699, longitude: 24.9384 },
  { city: 'Hong Kong', countryCode: 'CN', latitude: 22.3193, longitude: 114.1694 },
  { city: 'Istanbul', countryCode: 'TR', latitude: 41.0082, longitude: 28.9784 },
  { city: 'Krakow', countryCode: 'PL', latitude: 50.0647, longitude: 19.945 },
  { city: 'Kuala Lumpur', countryCode: 'MY', latitude: 3.139, longitude: 101.6869 },
  { city: 'Kyoto', countryCode: 'JP', latitude: 35.0116, longitude: 135.7681 },
  { city: 'Lima', countryCode: 'PE', latitude: -12.0464, longitude: -77.0428 },
  { city: 'Lisbon', countryCode: 'PT', latitude: 38.7223, longitude: -9.1393 },
  { city: 'London', countryCode: 'GB', latitude: 51.5072, longitude: -0.1276 },
  { city: 'Los Angeles', countryCode: 'US', latitude: 34.0522, longitude: -118.2437 },
  { city: 'Madrid', countryCode: 'ES', latitude: 40.4168, longitude: -3.7038 },
  { city: 'Manila', countryCode: 'PH', latitude: 14.5995, longitude: 120.9842 },
  { city: 'Marrakech', countryCode: 'MA', latitude: 31.6295, longitude: -7.9811 },
  { city: 'Medellín', countryCode: 'CO', latitude: 6.2476, longitude: -75.5658 },
  { city: 'Melbourne', countryCode: 'AU', latitude: -37.8136, longitude: 144.9631 },
  { city: 'Mexico City', countryCode: 'MX', latitude: 19.4326, longitude: -99.1332 },
  { city: 'Miami', countryCode: 'US', latitude: 25.7617, longitude: -80.1918 },
  { city: 'Milan', countryCode: 'IT', latitude: 45.4642, longitude: 9.19 },
  { city: 'Montreal', countryCode: 'CA', latitude: 45.5017, longitude: -73.5673 },
  { city: 'Munich', countryCode: 'DE', latitude: 48.1351, longitude: 11.582 },
  { city: 'New York', countryCode: 'US', latitude: 40.7128, longitude: -74.006 },
  { city: 'Nice', countryCode: 'FR', latitude: 43.7102, longitude: 7.262 },
  { city: 'Osaka', countryCode: 'JP', latitude: 34.6937, longitude: 135.5023 },
  { city: 'Oslo', countryCode: 'NO', latitude: 59.9139, longitude: 10.7522 },
  { city: 'Paris', countryCode: 'FR', latitude: 48.8566, longitude: 2.3522 },
  { city: 'Porto', countryCode: 'PT', latitude: 41.1579, longitude: -8.6291 },
  { city: 'Prague', countryCode: 'CZ', latitude: 50.0755, longitude: 14.4378 },
  { city: 'Reykjavik', countryCode: 'IS', latitude: 64.1466, longitude: -21.9426 },
  { city: 'Rio de Janeiro', countryCode: 'BR', latitude: -22.9068, longitude: -43.1729 },
  { city: 'Rome', countryCode: 'IT', latitude: 41.9028, longitude: 12.4964 },
  { city: 'San Francisco', countryCode: 'US', latitude: 37.7749, longitude: -122.4194 },
  { city: 'Santiago', countryCode: 'CL', latitude: -33.4489, longitude: -70.6693 },
  { city: 'São Paulo', countryCode: 'BR', latitude: -23.5505, longitude: -46.6333 },
  { city: 'Seoul', countryCode: 'KR', latitude: 37.5665, longitude: 126.978 },
  { city: 'Singapore', countryCode: 'SG', latitude: 1.3521, longitude: 103.8198 },
  { city: 'Stockholm', countryCode: 'SE', latitude: 59.3293, longitude: 18.0686 },
  { city: 'Sydney', countryCode: 'AU', latitude: -33.8688, longitude: 151.2093 },
  { city: 'Taipei', countryCode: 'TW', latitude: 25.033, longitude: 121.5654 },
  { city: 'Tel Aviv', countryCode: 'IL', latitude: 32.0853, longitude: 34.7818 },
  { city: 'Tokyo', countryCode: 'JP', latitude: 35.6762, longitude: 139.6503 },
  { city: 'Toronto', countryCode: 'CA', latitude: 43.6532, longitude: -79.3832 },
  { city: 'Valencia', countryCode: 'ES', latitude: 39.4699, longitude: -0.3763 },
  { city: 'Vancouver', countryCode: 'CA', latitude: 49.2827, longitude: -123.1207 },
  { city: 'Vienna', countryCode: 'AT', latitude: 48.2082, longitude: 16.3738 },
  { city: 'Warsaw', countryCode: 'PL', latitude: 52.2297, longitude: 21.0122 },
  { city: 'Zurich', countryCode: 'CH', latitude: 47.3769, longitude: 8.5417 },
];

/**
 * Searches offline global cities by prefix or substring match.
 * @param {string} query - User search string.
 * @param {number} [limit] - Maximum number of suggestions to return.
 * @returns {CityCoordinateEntry[]} Matching city entries.
 */
export function searchCities(query: string, limit: number = 8): CityCoordinateEntry[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return GLOBAL_CITIES.slice(0, limit);

  const prefixMatches: CityCoordinateEntry[] = [];
  const substringMatches: CityCoordinateEntry[] = [];

  for (const entry of GLOBAL_CITIES) {
    const cityLower = entry.city.toLowerCase();
    const countryName = (COUNTRY_BY_CODE.get(entry.countryCode)?.name ?? '').toLowerCase();
    if (cityLower.startsWith(normalized)) {
      prefixMatches.push(entry);
    } else if (cityLower.includes(normalized) || countryName.includes(normalized)) {
      substringMatches.push(entry);
    }
  }

  return [...prefixMatches, ...substringMatches].slice(0, limit);
}

/**
 * Resolves a country code or country name string to a 2-letter ISO code.
 * @param {string} query - Country code, country name, or partial name.
 * @returns {string | null} Uppercase ISO alpha-2 code if resolved.
 */
export function findCountryByQuery(query: string): string | null {
  const clean = query.trim();
  if (!clean) return null;
  const upper = clean.toUpperCase();
  if (COUNTRY_BY_CODE.has(upper)) return upper;

  const lower = clean.toLowerCase();
  const exact = COUNTRIES.find((c) => c.name.toLowerCase() === lower);
  if (exact) return exact.code;

  const partial = COUNTRIES.find((c) => c.name.toLowerCase().includes(lower));
  return partial ? partial.code : null;
}
