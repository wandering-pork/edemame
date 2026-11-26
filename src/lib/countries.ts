/**
 * Countries for "Country of Citizenship" style lookups (Visa Advisor).
 *
 * Names follow common English short names (ISO 3166-1, shortened where the
 * formal name is unwieldy, e.g. "Iran" not "Iran, Islamic Republic of").
 * `code` is the ISO 3166-1 alpha-3 code, the same code a passport's machine
 * readable zone uses for nationality, so a scanned "IND" maps to India.
 * `aliases` catch what people actually type: demonyms ("Indian", "Filipino")
 * and common short forms ("UK", "USA"). Older client records often hold a
 * demonym, since the field used to be free text with "e.g. Indian, British".
 */
export interface Country {
  name: string;
  code: string;
  aliases?: string[];
}

export const COUNTRIES: Country[] = [
  { name: 'Afghanistan', code: 'AFG', aliases: ['Afghan'] },
  { name: 'Albania', code: 'ALB', aliases: ['Albanian'] },
  { name: 'Algeria', code: 'DZA', aliases: ['Algerian'] },
  { name: 'Andorra', code: 'AND' },
  { name: 'Angola', code: 'AGO', aliases: ['Angolan'] },
  { name: 'Antigua and Barbuda', code: 'ATG' },
  { name: 'Argentina', code: 'ARG', aliases: ['Argentine', 'Argentinian'] },
  { name: 'Armenia', code: 'ARM', aliases: ['Armenian'] },
  { name: 'Australia', code: 'AUS', aliases: ['Australian'] },
  { name: 'Austria', code: 'AUT', aliases: ['Austrian'] },
  { name: 'Azerbaijan', code: 'AZE', aliases: ['Azerbaijani'] },
  { name: 'Bahamas', code: 'BHS' },
  { name: 'Bahrain', code: 'BHR', aliases: ['Bahraini'] },
  { name: 'Bangladesh', code: 'BGD', aliases: ['Bangladeshi'] },
  { name: 'Barbados', code: 'BRB' },
  { name: 'Belarus', code: 'BLR', aliases: ['Belarusian'] },
  { name: 'Belgium', code: 'BEL', aliases: ['Belgian'] },
  { name: 'Belize', code: 'BLZ' },
  { name: 'Benin', code: 'BEN' },
  { name: 'Bhutan', code: 'BTN', aliases: ['Bhutanese'] },
  { name: 'Bolivia', code: 'BOL', aliases: ['Bolivian'] },
  { name: 'Bosnia and Herzegovina', code: 'BIH', aliases: ['Bosnian'] },
  { name: 'Botswana', code: 'BWA' },
  { name: 'Brazil', code: 'BRA', aliases: ['Brazilian'] },
  { name: 'Brunei', code: 'BRN' },
  { name: 'Bulgaria', code: 'BGR', aliases: ['Bulgarian'] },
  { name: 'Burkina Faso', code: 'BFA' },
  { name: 'Burundi', code: 'BDI' },
  { name: 'Cabo Verde', code: 'CPV', aliases: ['Cape Verde'] },
  { name: 'Cambodia', code: 'KHM', aliases: ['Cambodian'] },
  { name: 'Cameroon', code: 'CMR', aliases: ['Cameroonian'] },
  { name: 'Canada', code: 'CAN', aliases: ['Canadian'] },
  { name: 'Central African Republic', code: 'CAF' },
  { name: 'Chad', code: 'TCD' },
  { name: 'Chile', code: 'CHL', aliases: ['Chilean'] },
  { name: 'China', code: 'CHN', aliases: ['Chinese', 'PRC'] },
  { name: 'Colombia', code: 'COL', aliases: ['Colombian'] },
  { name: 'Comoros', code: 'COM' },
  { name: 'Congo', code: 'COG', aliases: ['Republic of the Congo'] },
  { name: 'Congo (Democratic Republic)', code: 'COD', aliases: ['DRC', 'DR Congo'] },
  { name: 'Costa Rica', code: 'CRI', aliases: ['Costa Rican'] },
  { name: "Côte d'Ivoire", code: 'CIV', aliases: ['Ivory Coast', 'Cote dIvoire'] },
  { name: 'Croatia', code: 'HRV', aliases: ['Croatian'] },
  { name: 'Cuba', code: 'CUB', aliases: ['Cuban'] },
  { name: 'Cyprus', code: 'CYP', aliases: ['Cypriot'] },
  { name: 'Czechia', code: 'CZE', aliases: ['Czech', 'Czech Republic'] },
  { name: 'Denmark', code: 'DNK', aliases: ['Danish'] },
  { name: 'Djibouti', code: 'DJI' },
  { name: 'Dominica', code: 'DMA' },
  { name: 'Dominican Republic', code: 'DOM', aliases: ['Dominican'] },
  { name: 'Ecuador', code: 'ECU', aliases: ['Ecuadorian'] },
  { name: 'Egypt', code: 'EGY', aliases: ['Egyptian'] },
  { name: 'El Salvador', code: 'SLV', aliases: ['Salvadoran'] },
  { name: 'Equatorial Guinea', code: 'GNQ' },
  { name: 'Eritrea', code: 'ERI', aliases: ['Eritrean'] },
  { name: 'Estonia', code: 'EST', aliases: ['Estonian'] },
  { name: 'Eswatini', code: 'SWZ', aliases: ['Swaziland'] },
  { name: 'Ethiopia', code: 'ETH', aliases: ['Ethiopian'] },
  { name: 'Fiji', code: 'FJI', aliases: ['Fijian'] },
  { name: 'Finland', code: 'FIN', aliases: ['Finnish'] },
  { name: 'France', code: 'FRA', aliases: ['French'] },
  { name: 'Gabon', code: 'GAB' },
  { name: 'Gambia', code: 'GMB' },
  { name: 'Georgia', code: 'GEO', aliases: ['Georgian'] },
  { name: 'Germany', code: 'DEU', aliases: ['German'] },
  { name: 'Ghana', code: 'GHA', aliases: ['Ghanaian'] },
  { name: 'Greece', code: 'GRC', aliases: ['Greek'] },
  { name: 'Grenada', code: 'GRD' },
  { name: 'Guatemala', code: 'GTM', aliases: ['Guatemalan'] },
  { name: 'Guinea', code: 'GIN' },
  { name: 'Guinea-Bissau', code: 'GNB' },
  { name: 'Guyana', code: 'GUY' },
  { name: 'Haiti', code: 'HTI', aliases: ['Haitian'] },
  { name: 'Honduras', code: 'HND', aliases: ['Honduran'] },
  { name: 'Hong Kong', code: 'HKG' },
  { name: 'Hungary', code: 'HUN', aliases: ['Hungarian'] },
  { name: 'Iceland', code: 'ISL', aliases: ['Icelandic'] },
  { name: 'India', code: 'IND', aliases: ['Indian'] },
  { name: 'Indonesia', code: 'IDN', aliases: ['Indonesian'] },
  { name: 'Iran', code: 'IRN', aliases: ['Iranian'] },
  { name: 'Iraq', code: 'IRQ', aliases: ['Iraqi'] },
  { name: 'Ireland', code: 'IRL', aliases: ['Irish'] },
  { name: 'Israel', code: 'ISR', aliases: ['Israeli'] },
  { name: 'Italy', code: 'ITA', aliases: ['Italian'] },
  { name: 'Jamaica', code: 'JAM', aliases: ['Jamaican'] },
  { name: 'Japan', code: 'JPN', aliases: ['Japanese'] },
  { name: 'Jordan', code: 'JOR', aliases: ['Jordanian'] },
  { name: 'Kazakhstan', code: 'KAZ', aliases: ['Kazakh'] },
  { name: 'Kenya', code: 'KEN', aliases: ['Kenyan'] },
  { name: 'Kiribati', code: 'KIR' },
  { name: 'Kosovo', code: 'XKX' },
  { name: 'Kuwait', code: 'KWT', aliases: ['Kuwaiti'] },
  { name: 'Kyrgyzstan', code: 'KGZ' },
  { name: 'Laos', code: 'LAO', aliases: ['Lao', 'Laotian'] },
  { name: 'Latvia', code: 'LVA', aliases: ['Latvian'] },
  { name: 'Lebanon', code: 'LBN', aliases: ['Lebanese'] },
  { name: 'Lesotho', code: 'LSO' },
  { name: 'Liberia', code: 'LBR', aliases: ['Liberian'] },
  { name: 'Libya', code: 'LBY', aliases: ['Libyan'] },
  { name: 'Liechtenstein', code: 'LIE' },
  { name: 'Lithuania', code: 'LTU', aliases: ['Lithuanian'] },
  { name: 'Luxembourg', code: 'LUX' },
  { name: 'Macao', code: 'MAC', aliases: ['Macau'] },
  { name: 'Madagascar', code: 'MDG' },
  { name: 'Malawi', code: 'MWI', aliases: ['Malawian'] },
  { name: 'Malaysia', code: 'MYS', aliases: ['Malaysian'] },
  { name: 'Maldives', code: 'MDV', aliases: ['Maldivian'] },
  { name: 'Mali', code: 'MLI' },
  { name: 'Malta', code: 'MLT', aliases: ['Maltese'] },
  { name: 'Marshall Islands', code: 'MHL' },
  { name: 'Mauritania', code: 'MRT' },
  { name: 'Mauritius', code: 'MUS', aliases: ['Mauritian'] },
  { name: 'Mexico', code: 'MEX', aliases: ['Mexican'] },
  { name: 'Micronesia', code: 'FSM' },
  { name: 'Moldova', code: 'MDA', aliases: ['Moldovan'] },
  { name: 'Monaco', code: 'MCO' },
  { name: 'Mongolia', code: 'MNG', aliases: ['Mongolian'] },
  { name: 'Montenegro', code: 'MNE' },
  { name: 'Morocco', code: 'MAR', aliases: ['Moroccan'] },
  { name: 'Mozambique', code: 'MOZ' },
  { name: 'Myanmar', code: 'MMR', aliases: ['Burma', 'Burmese'] },
  { name: 'Namibia', code: 'NAM', aliases: ['Namibian'] },
  { name: 'Nauru', code: 'NRU' },
  { name: 'Nepal', code: 'NPL', aliases: ['Nepali', 'Nepalese'] },
  { name: 'Netherlands', code: 'NLD', aliases: ['Dutch', 'Holland'] },
  { name: 'New Zealand', code: 'NZL', aliases: ['New Zealander', 'Kiwi', 'NZ'] },
  { name: 'Nicaragua', code: 'NIC' },
  { name: 'Niger', code: 'NER' },
  { name: 'Nigeria', code: 'NGA', aliases: ['Nigerian'] },
  { name: 'North Korea', code: 'PRK' },
  { name: 'North Macedonia', code: 'MKD', aliases: ['Macedonian'] },
  { name: 'Norway', code: 'NOR', aliases: ['Norwegian'] },
  { name: 'Oman', code: 'OMN', aliases: ['Omani'] },
  { name: 'Pakistan', code: 'PAK', aliases: ['Pakistani'] },
  { name: 'Palau', code: 'PLW' },
  { name: 'Palestine', code: 'PSE', aliases: ['Palestinian'] },
  { name: 'Panama', code: 'PAN', aliases: ['Panamanian'] },
  { name: 'Papua New Guinea', code: 'PNG', aliases: ['PNG'] },
  { name: 'Paraguay', code: 'PRY', aliases: ['Paraguayan'] },
  { name: 'Peru', code: 'PER', aliases: ['Peruvian'] },
  { name: 'Philippines', code: 'PHL', aliases: ['Filipino', 'Filipina', 'Philippine'] },
  { name: 'Poland', code: 'POL', aliases: ['Polish'] },
  { name: 'Portugal', code: 'PRT', aliases: ['Portuguese'] },
  { name: 'Qatar', code: 'QAT', aliases: ['Qatari'] },
  { name: 'Romania', code: 'ROU', aliases: ['Romanian'] },
  { name: 'Russia', code: 'RUS', aliases: ['Russian'] },
  { name: 'Rwanda', code: 'RWA', aliases: ['Rwandan'] },
  { name: 'Saint Kitts and Nevis', code: 'KNA' },
  { name: 'Saint Lucia', code: 'LCA' },
  { name: 'Saint Vincent and the Grenadines', code: 'VCT' },
  { name: 'Samoa', code: 'WSM', aliases: ['Samoan'] },
  { name: 'San Marino', code: 'SMR' },
  { name: 'São Tomé and Príncipe', code: 'STP', aliases: ['Sao Tome and Principe'] },
  { name: 'Saudi Arabia', code: 'SAU', aliases: ['Saudi'] },
  { name: 'Senegal', code: 'SEN', aliases: ['Senegalese'] },
  { name: 'Serbia', code: 'SRB', aliases: ['Serbian'] },
  { name: 'Seychelles', code: 'SYC' },
  { name: 'Sierra Leone', code: 'SLE' },
  { name: 'Singapore', code: 'SGP', aliases: ['Singaporean'] },
  { name: 'Slovakia', code: 'SVK', aliases: ['Slovak'] },
  { name: 'Slovenia', code: 'SVN', aliases: ['Slovenian'] },
  { name: 'Solomon Islands', code: 'SLB' },
  { name: 'Somalia', code: 'SOM', aliases: ['Somali'] },
  { name: 'South Africa', code: 'ZAF', aliases: ['South African'] },
  { name: 'South Korea', code: 'KOR', aliases: ['Korea', 'Korean', 'Republic of Korea'] },
  { name: 'South Sudan', code: 'SSD' },
  { name: 'Spain', code: 'ESP', aliases: ['Spanish'] },
  { name: 'Sri Lanka', code: 'LKA', aliases: ['Sri Lankan'] },
  { name: 'Sudan', code: 'SDN', aliases: ['Sudanese'] },
  { name: 'Suriname', code: 'SUR' },
  { name: 'Sweden', code: 'SWE', aliases: ['Swedish'] },
  { name: 'Switzerland', code: 'CHE', aliases: ['Swiss'] },
  { name: 'Syria', code: 'SYR', aliases: ['Syrian'] },
  { name: 'Taiwan', code: 'TWN', aliases: ['Taiwanese'] },
  { name: 'Tajikistan', code: 'TJK' },
  { name: 'Tanzania', code: 'TZA', aliases: ['Tanzanian'] },
  { name: 'Thailand', code: 'THA', aliases: ['Thai'] },
  { name: 'Timor-Leste', code: 'TLS', aliases: ['East Timor'] },
  { name: 'Togo', code: 'TGO' },
  { name: 'Tonga', code: 'TON', aliases: ['Tongan'] },
  { name: 'Trinidad and Tobago', code: 'TTO' },
  { name: 'Tunisia', code: 'TUN', aliases: ['Tunisian'] },
  { name: 'Türkiye', code: 'TUR', aliases: ['Turkey', 'Turkish'] },
  { name: 'Turkmenistan', code: 'TKM' },
  { name: 'Tuvalu', code: 'TUV' },
  { name: 'Uganda', code: 'UGA', aliases: ['Ugandan'] },
  { name: 'Ukraine', code: 'UKR', aliases: ['Ukrainian'] },
  { name: 'United Arab Emirates', code: 'ARE', aliases: ['UAE', 'Emirati'] },
  { name: 'United Kingdom', code: 'GBR', aliases: ['UK', 'British', 'Great Britain', 'England', 'Scotland', 'Wales'] },
  { name: 'United States', code: 'USA', aliases: ['US', 'American', 'United States of America'] },
  { name: 'Uruguay', code: 'URY', aliases: ['Uruguayan'] },
  { name: 'Uzbekistan', code: 'UZB', aliases: ['Uzbek'] },
  { name: 'Vanuatu', code: 'VUT' },
  { name: 'Vatican City', code: 'VAT', aliases: ['Holy See'] },
  { name: 'Venezuela', code: 'VEN', aliases: ['Venezuelan'] },
  { name: 'Vietnam', code: 'VNM', aliases: ['Vietnamese', 'Viet Nam'] },
  { name: 'Yemen', code: 'YEM', aliases: ['Yemeni'] },
  { name: 'Zambia', code: 'ZMB', aliases: ['Zambian'] },
  { name: 'Zimbabwe', code: 'ZWE', aliases: ['Zimbabwean'] },
  { name: 'Stateless', code: 'XXA', aliases: ['No nationality'] },
];

const fold = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/gi, '').trim().toLowerCase();

/** The country a typed or stored value names exactly (name, ISO alpha-3 code or alias), or null. */
export function findCountry(value: string | undefined | null): Country | null {
  const q = fold(value ?? '');
  if (!q) return null;
  return COUNTRIES.find(c => fold(c.name) === q || c.code.toLowerCase() === q || c.aliases?.some(a => fold(a) === q)) ?? null;
}

/**
 * A stored value as the country name the picker uses: "IND", "Indian" or
 * "india" become "India". Anything unrecognised is kept as typed, so no
 * existing data is lost.
 */
export function normalizeCountry(value: string | undefined | null): string {
  return findCountry(value)?.name ?? (value ?? '').trim();
}

/**
 * Countries matching a search, best first: names starting with the query,
 * then an exact code or an alias starting with it, then names containing it.
 * An empty query returns every country.
 */
export function searchCountries(query: string): Country[] {
  const q = fold(query);
  if (!q) return COUNTRIES;
  const rank = (c: Country): number => {
    const name = fold(c.name);
    if (name.startsWith(q)) return 0;
    if (name.split(' ').some(w => w.startsWith(q))) return 1;
    if (c.code.toLowerCase() === q || c.aliases?.some(a => fold(a).startsWith(q))) return 2;
    if (name.includes(q)) return 3;
    return -1;
  };
  return COUNTRIES
    .map(c => ({ c, r: rank(c) }))
    .filter(x => x.r >= 0)
    .sort((a, b) => a.r - b.r)
    .map(x => x.c);
}
