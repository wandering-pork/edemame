import { describe, it, expect } from 'vitest';
import { COUNTRIES, findCountry, normalizeCountry, searchCountries } from './countries';

describe('countries', () => {
  it('has unique names and codes', () => {
    expect(new Set(COUNTRIES.map(c => c.name)).size).toBe(COUNTRIES.length);
    expect(new Set(COUNTRIES.map(c => c.code)).size).toBe(COUNTRIES.length);
  });

  it('finds a country by name, passport code or demonym', () => {
    expect(findCountry('india')?.name).toBe('India');
    expect(findCountry('IND')?.name).toBe('India');
    expect(findCountry('Indian')?.name).toBe('India');
    expect(findCountry('British')?.name).toBe('United Kingdom');
    expect(findCountry('GBR')?.name).toBe('United Kingdom');
    expect(findCountry('Filipino')?.name).toBe('Philippines');
    expect(findCountry('cote divoire')?.name).toBe("Côte d'Ivoire");
    expect(findCountry('')).toBeNull();
    expect(findCountry('Atlantis')).toBeNull();
  });

  it('normalizes stored values but keeps anything it does not recognise', () => {
    expect(normalizeCountry('NPL')).toBe('Nepal');
    expect(normalizeCountry('  vietnamese ')).toBe('Vietnam');
    expect(normalizeCountry('Atlantis')).toBe('Atlantis');
    expect(normalizeCountry(undefined)).toBe('');
  });

  it('ranks names that start with the query first', () => {
    const names = searchCountries('in').map(c => c.name);
    expect(names.slice(0, 2)).toEqual(['India', 'Indonesia']);
    expect(names).toContain('Argentina'); // contains "in", ranked later
    expect(names.indexOf('Argentina')).toBeGreaterThan(names.indexOf('Indonesia'));
  });

  it('matches word starts, codes and aliases', () => {
    expect(searchCountries('zealand')[0].name).toBe('New Zealand');
    expect(searchCountries('usa')[0].name).toBe('United States');
    expect(searchCountries('filip')[0].name).toBe('Philippines');
    expect(searchCountries('')).toHaveLength(COUNTRIES.length);
  });
});
