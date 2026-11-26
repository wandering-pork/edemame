import { describe, it, expect } from 'vitest';
import { titleNamesSubclass, titleWithoutClient } from './caseTitle';

describe('titleWithoutClient', () => {
  it('drops a trailing client name after a separator', () => {
    expect(titleWithoutClient('Skilled Independent (Subclass 189) - brad bird', 'brad bird')).toBe('Skilled Independent (Subclass 189)');
    expect(titleWithoutClient('Partner visa, Arjun Mehta', 'arjun mehta')).toBe('Partner visa');
    expect(titleWithoutClient('Student 500 – Mai Nguyen ', 'Mai Nguyen')).toBe('Student 500');
  });
  it('leaves other titles alone', () => {
    expect(titleWithoutClient('Brad Bird partner application', 'Brad Bird')).toBe('Brad Bird partner application');
    expect(titleWithoutClient('brad bird', 'brad bird')).toBe('brad bird');
    expect(titleWithoutClient('Visa (Subclass 189)', undefined)).toBe('Visa (Subclass 189)');
    expect(titleWithoutClient('Visa for J. (Smith)', 'J. (Smith)')).toBe('Visa for J. (Smith)');
    expect(titleWithoutClient('Visa - J. (Smith)', 'J. (Smith)')).toBe('Visa');
  });
});

describe('titleNamesSubclass', () => {
  it('finds the subclass number as a whole number', () => {
    expect(titleNamesSubclass('Skilled Independent (Subclass 189)', '189')).toBe(true);
    expect(titleNamesSubclass('Partner (Subclass 820)', '820')).toBe(true);
    expect(titleNamesSubclass('Case 1890', '189')).toBe(false);
    expect(titleNamesSubclass('General case', '482')).toBe(false);
  });
});
