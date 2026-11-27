/**
 * @module domain/countries/countries
 * ISO 3166-1 alpha-2 world country and territory directory with continents,
 * capital cities + WGS84 coordinates, Unicode flag generator, country quick-search,
 * and offline global city coordinate autocomplete dataset.
 */

/**
 * Geographic continent classification displayed on country quick-search chips.
 */
export type ContinentName =
  | 'Africa'
  | 'Asia'
  | 'Europe'
  | 'North America'
  | 'Oceania'
  | 'South America';

/**
 * Country or territory entry with ISO alpha-2 code, English name, continent,
 * regional flag, and capital coordinates for fallback pin resolution.
 */
export interface CountryEntry {
  code: string;
  name: string;
  flag: string;
  continent: ContinentName;
  capital: string;
  capitalLatitude: number;
  capitalLongitude: number;
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

/**
 * Normalizes a geographic name by trimming, lowercasing, and stripping diacritics.
 * @param {string} value - Raw city or country name.
 * @returns {string} Diacritic-free lowercase string.
 */
export function normalizeGeoText(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

type RawCountryTuple = readonly [
  code: string,
  name: string,
  continent: ContinentName,
  capital: string,
  lat: number,
  lng: number,
];

const RAW_COUNTRIES: ReadonlyArray<RawCountryTuple> = [
  ['AF', 'Afghanistan', 'Asia', 'Kabul', 34.5553, 69.2075],
  ['AL', 'Albania', 'Europe', 'Tirana', 41.3275, 19.8187],
  ['DZ', 'Algeria', 'Africa', 'Algiers', 36.7538, 3.0588],
  ['AD', 'Andorra', 'Europe', 'Andorra la Vella', 42.5063, 1.5218],
  ['AO', 'Angola', 'Africa', 'Luanda', -8.839, 13.2894],
  ['AG', 'Antigua and Barbuda', 'North America', "Saint John's", 17.1274, -61.8468],
  ['AR', 'Argentina', 'South America', 'Buenos Aires', -34.6037, -58.3816],
  ['AM', 'Armenia', 'Asia', 'Yerevan', 40.1792, 44.4991],
  ['AW', 'Aruba', 'North America', 'Oranjestad', 12.5092, -70.0086],
  ['AU', 'Australia', 'Oceania', 'Canberra', -35.2809, 149.13],
  ['AT', 'Austria', 'Europe', 'Vienna', 48.2082, 16.3738],
  ['AZ', 'Azerbaijan', 'Asia', 'Baku', 40.4093, 49.8671],
  ['BS', 'Bahamas', 'North America', 'Nassau', 25.0443, -77.3504],
  ['BH', 'Bahrain', 'Asia', 'Manama', 26.2285, 50.586],
  ['BD', 'Bangladesh', 'Asia', 'Dhaka', 23.8103, 90.4125],
  ['BB', 'Barbados', 'North America', 'Bridgetown', 13.0969, -59.6145],
  ['BY', 'Belarus', 'Europe', 'Minsk', 53.9006, 27.559],
  ['BE', 'Belgium', 'Europe', 'Brussels', 50.8503, 4.3517],
  ['BZ', 'Belize', 'North America', 'Belmopan', 17.251, -88.759],
  ['BJ', 'Benin', 'Africa', 'Porto-Novo', 6.4969, 2.6289],
  ['BM', 'Bermuda', 'North America', 'Hamilton', 32.2949, -64.7814],
  ['BT', 'Bhutan', 'Asia', 'Thimphu', 27.4728, 89.6393],
  ['BO', 'Bolivia', 'South America', 'Sucre', -19.0196, -65.2619],
  ['BA', 'Bosnia and Herzegovina', 'Europe', 'Sarajevo', 43.8563, 18.4131],
  ['BW', 'Botswana', 'Africa', 'Gaborone', -24.6282, 25.9231],
  ['BR', 'Brazil', 'South America', 'Brasília', -15.7975, -47.8919],
  ['BN', 'Brunei', 'Asia', 'Bandar Seri Begawan', 4.9031, 114.9398],
  ['BG', 'Bulgaria', 'Europe', 'Sofia', 42.6977, 23.3219],
  ['BF', 'Burkina Faso', 'Africa', 'Ouagadougou', 12.3714, -1.5197],
  ['BI', 'Burundi', 'Africa', 'Gitega', -3.4264, 29.9306],
  ['CV', 'Cabo Verde', 'Africa', 'Praia', 14.933, -23.5133],
  ['KH', 'Cambodia', 'Asia', 'Phnom Penh', 11.5564, 104.9282],
  ['CM', 'Cameroon', 'Africa', 'Yaoundé', 3.848, 11.5021],
  ['CA', 'Canada', 'North America', 'Ottawa', 45.4215, -75.6972],
  ['KY', 'Cayman Islands', 'North America', 'George Town', 19.2869, -81.3674],
  ['CF', 'Central African Republic', 'Africa', 'Bangui', 4.3947, 18.5582],
  ['TD', 'Chad', 'Africa', "N'Djamena", 12.1348, 15.0557],
  ['CL', 'Chile', 'South America', 'Santiago', -33.4489, -70.6693],
  ['CN', 'China', 'Asia', 'Beijing', 39.9042, 116.4074],
  ['CO', 'Colombia', 'South America', 'Bogotá', 4.711, -74.0721],
  ['KM', 'Comoros', 'Africa', 'Moroni', -11.7172, 43.2473],
  ['CG', 'Congo', 'Africa', 'Brazzaville', -4.2634, 15.2429],
  ['CR', 'Costa Rica', 'North America', 'San José', 9.9281, -84.0907],
  ['HR', 'Croatia', 'Europe', 'Zagreb', 45.815, 15.9819],
  ['CU', 'Cuba', 'North America', 'Havana', 23.1136, -82.3666],
  ['CW', 'Curaçao', 'North America', 'Willemstad', 12.1224, -68.8824],
  ['CY', 'Cyprus', 'Europe', 'Nicosia', 35.1856, 33.3823],
  ['CZ', 'Czechia', 'Europe', 'Prague', 50.0755, 14.4378],
  ['CD', 'DR Congo', 'Africa', 'Kinshasa', -4.4419, 15.2663],
  ['DK', 'Denmark', 'Europe', 'Copenhagen', 55.6761, 12.5683],
  ['DJ', 'Djibouti', 'Africa', 'Djibouti', 11.8251, 42.5903],
  ['DM', 'Dominica', 'North America', 'Roseau', 15.3092, -61.3794],
  ['DO', 'Dominican Republic', 'North America', 'Santo Domingo', 18.4861, -69.9312],
  ['EC', 'Ecuador', 'South America', 'Quito', -0.1807, -78.4678],
  ['EG', 'Egypt', 'Africa', 'Cairo', 30.0444, 31.2357],
  ['SV', 'El Salvador', 'North America', 'San Salvador', 13.6929, -89.2182],
  ['GQ', 'Equatorial Guinea', 'Africa', 'Malabo', 3.7504, 8.7371],
  ['ER', 'Eritrea', 'Africa', 'Asmara', 15.3229, 38.9251],
  ['EE', 'Estonia', 'Europe', 'Tallinn', 59.437, 24.7536],
  ['SZ', 'Eswatini', 'Africa', 'Mbabane', -26.3054, 31.1367],
  ['ET', 'Ethiopia', 'Africa', 'Addis Ababa', 9.032, 38.7469],
  ['FO', 'Faroe Islands', 'Europe', 'Tórshavn', 62.0079, -6.79],
  ['FJ', 'Fiji', 'Oceania', 'Suva', -18.1416, 178.4419],
  ['FI', 'Finland', 'Europe', 'Helsinki', 60.1699, 24.9384],
  ['FR', 'France', 'Europe', 'Paris', 48.8566, 2.3522],
  ['PF', 'French Polynesia', 'Oceania', 'Papeete', -17.5516, -149.5585],
  ['GA', 'Gabon', 'Africa', 'Libreville', 0.4162, 9.4673],
  ['GM', 'Gambia', 'Africa', 'Banjul', 13.4549, -16.579],
  ['GE', 'Georgia', 'Asia', 'Tbilisi', 41.7151, 44.8271],
  ['DE', 'Germany', 'Europe', 'Berlin', 52.52, 13.405],
  ['GH', 'Ghana', 'Africa', 'Accra', 5.6037, -0.187],
  ['GI', 'Gibraltar', 'Europe', 'Gibraltar', 36.1408, -5.3536],
  ['GR', 'Greece', 'Europe', 'Athens', 37.9838, 23.7275],
  ['GL', 'Greenland', 'North America', 'Nuuk', 64.1814, -51.6941],
  ['GD', 'Grenada', 'North America', "Saint George's", 12.0561, -61.7486],
  ['GP', 'Guadeloupe', 'North America', 'Basse-Terre', 15.9958, -61.7255],
  ['GU', 'Guam', 'Oceania', 'Hagåtña', 13.4757, 144.7489],
  ['GT', 'Guatemala', 'North America', 'Guatemala City', 14.6349, -90.5069],
  ['GN', 'Guinea', 'Africa', 'Conakry', 9.6412, -13.5784],
  ['GW', 'Guinea-Bissau', 'Africa', 'Bissau', 11.8817, -15.6178],
  ['GY', 'Guyana', 'South America', 'Georgetown', 6.8013, -58.1551],
  ['HT', 'Haiti', 'North America', 'Port-au-Prince', 18.5944, -72.3074],
  ['HN', 'Honduras', 'North America', 'Tegucigalpa', 14.0723, -87.1921],
  ['HK', 'Hong Kong', 'Asia', 'Hong Kong', 22.3193, 114.1694],
  ['HU', 'Hungary', 'Europe', 'Budapest', 47.4979, 19.0402],
  ['IS', 'Iceland', 'Europe', 'Reykjavik', 64.1466, -21.9426],
  ['IN', 'India', 'Asia', 'New Delhi', 28.6139, 77.209],
  ['ID', 'Indonesia', 'Asia', 'Jakarta', -6.2088, 106.8456],
  ['IR', 'Iran', 'Asia', 'Tehran', 35.6892, 51.389],
  ['IQ', 'Iraq', 'Asia', 'Baghdad', 33.3152, 44.3661],
  ['IE', 'Ireland', 'Europe', 'Dublin', 53.3498, -6.2603],
  ['IL', 'Israel', 'Asia', 'Jerusalem', 31.7683, 35.2137],
  ['IT', 'Italy', 'Europe', 'Rome', 41.9028, 12.4964],
  ['CI', 'Ivory Coast', 'Africa', 'Yamoussoukro', 6.8276, -5.2893],
  ['JM', 'Jamaica', 'North America', 'Kingston', 17.9714, -76.7936],
  ['JP', 'Japan', 'Asia', 'Tokyo', 35.6762, 139.6503],
  ['JO', 'Jordan', 'Asia', 'Amman', 31.9454, 35.9284],
  ['KZ', 'Kazakhstan', 'Asia', 'Astana', 51.1694, 71.4491],
  ['KE', 'Kenya', 'Africa', 'Nairobi', -1.2921, 36.8219],
  ['KI', 'Kiribati', 'Oceania', 'South Tarawa', 1.3291, 172.979],
  ['XK', 'Kosovo', 'Europe', 'Pristina', 42.6629, 21.1655],
  ['KW', 'Kuwait', 'Asia', 'Kuwait City', 29.3759, 47.9774],
  ['KG', 'Kyrgyzstan', 'Asia', 'Bishkek', 42.8746, 74.5698],
  ['LA', 'Laos', 'Asia', 'Vientiane', 17.9757, 102.6331],
  ['LV', 'Latvia', 'Europe', 'Riga', 56.9496, 24.1052],
  ['LB', 'Lebanon', 'Asia', 'Beirut', 33.8938, 35.5018],
  ['LS', 'Lesotho', 'Africa', 'Maseru', -29.3151, 27.4869],
  ['LR', 'Liberia', 'Africa', 'Monrovia', 6.3156, -10.8074],
  ['LY', 'Libya', 'Africa', 'Tripoli', 32.8872, 13.1913],
  ['LI', 'Liechtenstein', 'Europe', 'Vaduz', 47.141, 9.5209],
  ['LT', 'Lithuania', 'Europe', 'Vilnius', 54.6872, 25.2797],
  ['LU', 'Luxembourg', 'Europe', 'Luxembourg', 49.6116, 6.1319],
  ['MO', 'Macau', 'Asia', 'Macau', 22.1987, 113.5439],
  ['MG', 'Madagascar', 'Africa', 'Antananarivo', -18.8792, 47.5079],
  ['MW', 'Malawi', 'Africa', 'Lilongwe', -13.9626, 33.7741],
  ['MY', 'Malaysia', 'Asia', 'Kuala Lumpur', 3.139, 101.6869],
  ['MV', 'Maldives', 'Asia', 'Malé', 4.1755, 73.5093],
  ['ML', 'Mali', 'Africa', 'Bamako', 12.6392, -8.0029],
  ['MT', 'Malta', 'Europe', 'Valletta', 35.8989, 14.5146],
  ['MH', 'Marshall Islands', 'Oceania', 'Majuro', 7.1164, 171.1858],
  ['MQ', 'Martinique', 'North America', 'Fort-de-France', 14.6161, -61.0588],
  ['MR', 'Mauritania', 'Africa', 'Nouakchott', 18.0735, -15.9582],
  ['MU', 'Mauritius', 'Africa', 'Port Louis', -20.1609, 57.5012],
  ['MX', 'Mexico', 'North America', 'Mexico City', 19.4326, -99.1332],
  ['FM', 'Micronesia', 'Oceania', 'Palikir', 6.9248, 158.161],
  ['MD', 'Moldova', 'Europe', 'Chișinău', 47.0105, 28.8638],
  ['MC', 'Monaco', 'Europe', 'Monaco', 43.7384, 7.4246],
  ['MN', 'Mongolia', 'Asia', 'Ulaanbaatar', 47.8864, 106.9057],
  ['ME', 'Montenegro', 'Europe', 'Podgorica', 42.4304, 19.2594],
  ['MA', 'Morocco', 'Africa', 'Rabat', 34.0209, -6.8416],
  ['MZ', 'Mozambique', 'Africa', 'Maputo', -25.9692, 32.5732],
  ['MM', 'Myanmar', 'Asia', 'Naypyidaw', 19.7633, 96.0785],
  ['NA', 'Namibia', 'Africa', 'Windhoek', -22.5609, 17.0658],
  ['NR', 'Nauru', 'Oceania', 'Yaren', -0.5477, 166.9209],
  ['NP', 'Nepal', 'Asia', 'Kathmandu', 27.7172, 85.324],
  ['NL', 'Netherlands', 'Europe', 'Amsterdam', 52.3676, 4.9041],
  ['NC', 'New Caledonia', 'Oceania', 'Nouméa', -22.2758, 166.458],
  ['NZ', 'New Zealand', 'Oceania', 'Wellington', -41.2865, 174.7762],
  ['NI', 'Nicaragua', 'North America', 'Managua', 12.115, -86.2362],
  ['NE', 'Niger', 'Africa', 'Niamey', 13.5116, 2.1254],
  ['NG', 'Nigeria', 'Africa', 'Abuja', 9.0765, 7.3986],
  ['KP', 'North Korea', 'Asia', 'Pyongyang', 39.0392, 125.7625],
  ['MK', 'North Macedonia', 'Europe', 'Skopje', 41.9981, 21.4254],
  ['NO', 'Norway', 'Europe', 'Oslo', 59.9139, 10.7522],
  ['OM', 'Oman', 'Asia', 'Muscat', 23.588, 58.3829],
  ['PK', 'Pakistan', 'Asia', 'Islamabad', 33.6844, 73.0479],
  ['PW', 'Palau', 'Oceania', 'Ngerulmud', 7.5004, 134.6243],
  ['PS', 'Palestine', 'Asia', 'Ramallah', 31.9038, 35.2034],
  ['PA', 'Panama', 'North America', 'Panama City', 8.9824, -79.5199],
  ['PG', 'Papua New Guinea', 'Oceania', 'Port Moresby', -9.4438, 147.1803],
  ['PY', 'Paraguay', 'South America', 'Asunción', -25.2637, -57.5759],
  ['PE', 'Peru', 'South America', 'Lima', -12.0464, -77.0428],
  ['PH', 'Philippines', 'Asia', 'Manila', 14.5995, 120.9842],
  ['PL', 'Poland', 'Europe', 'Warsaw', 52.2297, 21.0122],
  ['PT', 'Portugal', 'Europe', 'Lisbon', 38.7223, -9.1393],
  ['PR', 'Puerto Rico', 'North America', 'San Juan', 18.4655, -66.1057],
  ['QA', 'Qatar', 'Asia', 'Doha', 25.2854, 51.531],
  ['RE', 'Réunion', 'Africa', 'Saint-Denis', -20.8821, 55.4507],
  ['RO', 'Romania', 'Europe', 'Bucharest', 44.4268, 26.1025],
  ['RU', 'Russia', 'Europe', 'Moscow', 55.7558, 37.6173],
  ['RW', 'Rwanda', 'Africa', 'Kigali', -1.9441, 30.0619],
  ['KN', 'Saint Kitts and Nevis', 'North America', 'Basseterre', 17.3026, -62.7177],
  ['LC', 'Saint Lucia', 'North America', 'Castries', 14.0101, -60.9875],
  ['VC', 'Saint Vincent and the Grenadines', 'North America', 'Kingstown', 13.1587, -61.2248],
  ['WS', 'Samoa', 'Oceania', 'Apia', -13.8333, -171.7667],
  ['SM', 'San Marino', 'Europe', 'San Marino', 43.9356, 12.4473],
  ['ST', 'Sao Tome and Principe', 'Africa', 'São Tomé', 0.3365, 6.7273],
  ['SA', 'Saudi Arabia', 'Asia', 'Riyadh', 24.7136, 46.6753],
  ['SN', 'Senegal', 'Africa', 'Dakar', 14.7167, -17.4677],
  ['RS', 'Serbia', 'Europe', 'Belgrade', 44.7866, 20.4489],
  ['SC', 'Seychelles', 'Africa', 'Victoria', -4.6191, 55.4513],
  ['SL', 'Sierra Leone', 'Africa', 'Freetown', 8.4657, -13.2317],
  ['SG', 'Singapore', 'Asia', 'Singapore', 1.3521, 103.8198],
  ['SK', 'Slovakia', 'Europe', 'Bratislava', 48.1486, 17.1077],
  ['SI', 'Slovenia', 'Europe', 'Ljubljana', 46.0569, 14.5058],
  ['SB', 'Solomon Islands', 'Oceania', 'Honiara', -9.4456, 159.9729],
  ['SO', 'Somalia', 'Africa', 'Mogadishu', 2.0469, 45.3182],
  ['ZA', 'South Africa', 'Africa', 'Pretoria', -25.7479, 28.2293],
  ['KR', 'South Korea', 'Asia', 'Seoul', 37.5665, 126.978],
  ['SS', 'South Sudan', 'Africa', 'Juba', 4.8594, 31.5713],
  ['ES', 'Spain', 'Europe', 'Madrid', 40.4168, -3.7038],
  ['LK', 'Sri Lanka', 'Asia', 'Colombo', 6.9271, 79.8612],
  ['SD', 'Sudan', 'Africa', 'Khartoum', 15.5007, 32.5599],
  ['SR', 'Suriname', 'South America', 'Paramaribo', 5.852, -55.2038],
  ['SE', 'Sweden', 'Europe', 'Stockholm', 59.3293, 18.0686],
  ['CH', 'Switzerland', 'Europe', 'Bern', 46.948, 7.4474],
  ['SY', 'Syria', 'Asia', 'Damascus', 33.5138, 36.2765],
  ['TW', 'Taiwan', 'Asia', 'Taipei', 25.033, 121.5654],
  ['TJ', 'Tajikistan', 'Asia', 'Dushanbe', 38.5598, 68.787],
  ['TZ', 'Tanzania', 'Africa', 'Dodoma', -6.163, 35.7516],
  ['TH', 'Thailand', 'Asia', 'Bangkok', 13.7563, 100.5018],
  ['TL', 'Timor-Leste', 'Asia', 'Dili', -8.5569, 125.5603],
  ['TG', 'Togo', 'Africa', 'Lomé', 6.1319, 1.2228],
  ['TO', 'Tonga', 'Oceania', "Nuku'alofa", -21.1393, -175.2049],
  ['TT', 'Trinidad and Tobago', 'North America', 'Port of Spain', 10.6549, -61.5019],
  ['TN', 'Tunisia', 'Africa', 'Tunis', 36.8065, 10.1815],
  ['TR', 'Turkey', 'Asia', 'Ankara', 39.9334, 32.8597],
  ['TM', 'Turkmenistan', 'Asia', 'Ashgabat', 37.9601, 58.3261],
  ['TV', 'Tuvalu', 'Oceania', 'Funafuti', -8.5211, 179.1962],
  ['UG', 'Uganda', 'Africa', 'Kampala', 0.3476, 32.5825],
  ['UA', 'Ukraine', 'Europe', 'Kyiv', 50.4501, 30.5234],
  ['AE', 'United Arab Emirates', 'Asia', 'Abu Dhabi', 24.4539, 54.3773],
  ['GB', 'United Kingdom', 'Europe', 'London', 51.5072, -0.1276],
  ['US', 'United States', 'North America', 'Washington, D.C.', 38.9072, -77.0369],
  ['UY', 'Uruguay', 'South America', 'Montevideo', -34.9011, -56.1645],
  ['UZ', 'Uzbekistan', 'Asia', 'Tashkent', 41.2995, 69.2401],
  ['VU', 'Vanuatu', 'Oceania', 'Port Vila', -17.7333, 168.3273],
  ['VA', 'Vatican City', 'Europe', 'Vatican City', 41.9029, 12.4534],
  ['VE', 'Venezuela', 'South America', 'Caracas', 10.4806, -66.9036],
  ['VN', 'Vietnam', 'Asia', 'Hanoi', 21.0278, 105.8342],
  ['YE', 'Yemen', 'Asia', "Sana'a", 15.3694, 44.191],
  ['ZM', 'Zambia', 'Africa', 'Lusaka', -15.3875, 28.3228],
  ['ZW', 'Zimbabwe', 'Africa', 'Harare', -17.8252, 31.0335],
];

/**
 * Full directory of countries and territories with computed flag emojis,
 * continents, and capital city coordinates.
 */
export const COUNTRIES: ReadonlyArray<CountryEntry> = RAW_COUNTRIES.map(
  ([code, name, continent, capital, capitalLatitude, capitalLongitude]) => ({
    code,
    name,
    flag: getCountryFlag(code),
    continent,
    capital,
    capitalLatitude,
    capitalLongitude,
  }),
);

/**
 * Fast lookup map from uppercase ISO alpha-2 code to `CountryEntry`.
 */
export const COUNTRY_BY_CODE: ReadonlyMap<string, CountryEntry> = new Map(
  COUNTRIES.map((entry) => [entry.code, entry]),
);

const ADDITIONAL_GLOBAL_CITIES: ReadonlyArray<CityCoordinateEntry> = [
  { city: 'Austin', countryCode: 'US', latitude: 30.2672, longitude: -97.7431 },
  { city: 'Bali (Canggu)', countryCode: 'ID', latitude: -8.6478, longitude: 115.1385 },
  { city: 'Barcelona', countryCode: 'ES', latitude: 41.3874, longitude: 2.1686 },
  { city: 'Bilbao', countryCode: 'ES', latitude: 43.263, longitude: -2.935 },
  { city: 'Bologna', countryCode: 'IT', latitude: 44.4949, longitude: 11.3426 },
  { city: 'Bordeaux', countryCode: 'FR', latitude: 44.8378, longitude: -0.5792 },
  { city: 'Boston', countryCode: 'US', latitude: 42.3601, longitude: -71.0589 },
  { city: 'Cancún', countryCode: 'MX', latitude: 21.1619, longitude: -86.8515 },
  { city: 'Cape Town', countryCode: 'ZA', latitude: -33.9249, longitude: 18.4241 },
  { city: 'Cartagena', countryCode: 'CO', latitude: 10.391, longitude: -75.4794 },
  { city: 'Chicago', countryCode: 'US', latitude: 41.8781, longitude: -87.6298 },
  { city: 'Dubai', countryCode: 'AE', latitude: 25.2048, longitude: 55.2708 },
  { city: 'Edinburgh', countryCode: 'GB', latitude: 55.9533, longitude: -3.1883 },
  { city: 'Florence', countryCode: 'IT', latitude: 43.7696, longitude: 11.2558 },
  { city: 'Frankfurt', countryCode: 'DE', latitude: 50.1109, longitude: 8.6821 },
  { city: 'Geneva', countryCode: 'CH', latitude: 46.2044, longitude: 6.1432 },
  { city: 'Guadalajara', countryCode: 'MX', latitude: 20.6597, longitude: -103.3496 },
  { city: 'Hamburg', countryCode: 'DE', latitude: 53.5511, longitude: 9.9937 },
  { city: 'Ho Chi Minh City', countryCode: 'VN', latitude: 10.8231, longitude: 106.6297 },
  { city: 'Ibiza', countryCode: 'ES', latitude: 38.9067, longitude: 1.4206 },
  { city: 'Istanbul', countryCode: 'TR', latitude: 41.0082, longitude: 28.9784 },
  { city: 'Krakow', countryCode: 'PL', latitude: 50.0647, longitude: 19.945 },
  { city: 'Kyoto', countryCode: 'JP', latitude: 35.0116, longitude: 135.7681 },
  { city: 'Los Angeles', countryCode: 'US', latitude: 34.0522, longitude: -118.2437 },
  { city: 'Lyon', countryCode: 'FR', latitude: 45.764, longitude: 4.8357 },
  { city: 'Malaga', countryCode: 'ES', latitude: 36.7213, longitude: -4.4214 },
  { city: 'Manchester', countryCode: 'GB', latitude: 53.4808, longitude: -2.2426 },
  { city: 'Marrakech', countryCode: 'MA', latitude: 31.6295, longitude: -7.9811 },
  { city: 'Marseille', countryCode: 'FR', latitude: 43.2965, longitude: 5.3698 },
  { city: 'Medellín', countryCode: 'CO', latitude: 6.2476, longitude: -75.5658 },
  { city: 'Melbourne', countryCode: 'AU', latitude: -37.8136, longitude: 144.9631 },
  { city: 'Miami', countryCode: 'US', latitude: 25.7617, longitude: -80.1918 },
  { city: 'Milan', countryCode: 'IT', latitude: 45.4642, longitude: 9.19 },
  { city: 'Montreal', countryCode: 'CA', latitude: 45.5017, longitude: -73.5673 },
  { city: 'Mumbai', countryCode: 'IN', latitude: 19.076, longitude: 72.8777 },
  { city: 'Munich', countryCode: 'DE', latitude: 48.1351, longitude: 11.582 },
  { city: 'Naples', countryCode: 'IT', latitude: 40.8518, longitude: 14.2681 },
  { city: 'New York', countryCode: 'US', latitude: 40.7128, longitude: -74.006 },
  { city: 'Nice', countryCode: 'FR', latitude: 43.7102, longitude: 7.262 },
  { city: 'Osaka', countryCode: 'JP', latitude: 34.6937, longitude: 135.5023 },
  { city: 'Palermo', countryCode: 'IT', latitude: 38.1157, longitude: 13.3615 },
  { city: 'Porto', countryCode: 'PT', latitude: 41.1579, longitude: -8.6291 },
  { city: 'Rio de Janeiro', countryCode: 'BR', latitude: -22.9068, longitude: -43.1729 },
  { city: 'Rotterdam', countryCode: 'NL', latitude: 51.9244, longitude: 4.4777 },
  { city: 'San Francisco', countryCode: 'US', latitude: 37.7749, longitude: -122.4194 },
  { city: 'São Paulo', countryCode: 'BR', latitude: -23.5505, longitude: -46.6333 },
  { city: 'Seattle', countryCode: 'US', latitude: 47.6062, longitude: -122.3321 },
  { city: 'Seville', countryCode: 'ES', latitude: 37.3891, longitude: -5.9845 },
  { city: 'Shanghai', countryCode: 'CN', latitude: 31.2304, longitude: 121.4737 },
  { city: 'Sydney', countryCode: 'AU', latitude: -33.8688, longitude: 151.2093 },
  { city: 'Tel Aviv', countryCode: 'IL', latitude: 32.0853, longitude: 34.7818 },
  { city: 'Toronto', countryCode: 'CA', latitude: 43.6532, longitude: -79.3832 },
  { city: 'Turin', countryCode: 'IT', latitude: 45.0703, longitude: 7.6869 },
  { city: 'Valencia', countryCode: 'ES', latitude: 39.4699, longitude: -0.3763 },
  { city: 'Vancouver', countryCode: 'CA', latitude: 49.2827, longitude: -123.1207 },
  { city: 'Venice', countryCode: 'IT', latitude: 45.4408, longitude: 12.3155 },
  { city: 'Zurich', countryCode: 'CH', latitude: 47.3769, longitude: 8.5417 },
];

/**
 * Curated offline global cities dataset combining every world capital and major metro hubs
 * for instant zero-network autocomplete and geocoding.
 */
export const GLOBAL_CITIES: ReadonlyArray<CityCoordinateEntry> = (() => {
  const seen = new Set<string>();
  const merged: CityCoordinateEntry[] = [];

  for (const country of COUNTRIES) {
    const key = `${normalizeGeoText(country.capital)}::${country.code}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push({
        city: country.capital,
        countryCode: country.code,
        latitude: country.capitalLatitude,
        longitude: country.capitalLongitude,
      });
    }
  }

  for (const entry of ADDITIONAL_GLOBAL_CITIES) {
    const key = `${normalizeGeoText(entry.city)}::${entry.countryCode}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(entry);
    }
  }

  return merged.sort((a, b) => a.city.localeCompare(b.city));
})();

/**
 * Searches world countries and territories instantaneously by ISO code, country name, or continent.
 * @param {string} query - User search text.
 * @param {number} [limit] - Maximum quick-match chips to return.
 * @returns {CountryEntry[]} Matching countries ordered by relevance.
 */
export function searchCountries(query: string, limit: number = 8): CountryEntry[] {
  const normalized = normalizeGeoText(query);
  if (!normalized) {
    const featuredCodes = ['IT', 'FR', 'ES', 'US', 'BR', 'JP', 'GB', 'DE'];
    return featuredCodes
      .map((code) => COUNTRY_BY_CODE.get(code))
      .filter((entry): entry is CountryEntry => Boolean(entry))
      .slice(0, limit);
  }

  const exactCode: CountryEntry[] = [];
  const prefixName: CountryEntry[] = [];
  const substringMatch: CountryEntry[] = [];

  for (const entry of COUNTRIES) {
    const codeLower = entry.code.toLowerCase();
    const nameNorm = normalizeGeoText(entry.name);
    const continentNorm = normalizeGeoText(entry.continent);
    const capitalNorm = normalizeGeoText(entry.capital);

    if (codeLower === normalized) {
      exactCode.push(entry);
    } else if (nameNorm.startsWith(normalized) || codeLower.startsWith(normalized)) {
      prefixName.push(entry);
    } else if (
      nameNorm.includes(normalized) ||
      continentNorm.includes(normalized) ||
      capitalNorm.includes(normalized)
    ) {
      substringMatch.push(entry);
    }
  }

  return [...exactCode, ...prefixName, ...substringMatch].slice(0, limit);
}

/**
 * Searches offline global cities by prefix or substring match.
 * @param {string} query - User search string.
 * @param {number} [limit] - Maximum number of suggestions to return.
 * @returns {CityCoordinateEntry[]} Matching city entries.
 */
export function searchCities(query: string, limit: number = 8): CityCoordinateEntry[] {
  const normalized = normalizeGeoText(query);
  if (!normalized) return GLOBAL_CITIES.slice(0, limit);

  const prefixMatches: CityCoordinateEntry[] = [];
  const substringMatches: CityCoordinateEntry[] = [];

  for (const entry of GLOBAL_CITIES) {
    const cityLower = normalizeGeoText(entry.city);
    const countryName = normalizeGeoText(COUNTRY_BY_CODE.get(entry.countryCode)?.name ?? '');
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

  const lower = normalizeGeoText(clean);
  const exact = COUNTRIES.find((c) => normalizeGeoText(c.name) === lower);
  if (exact) return exact.code;

  const partial = COUNTRIES.find((c) => normalizeGeoText(c.name).includes(lower));
  return partial ? partial.code : null;
}
