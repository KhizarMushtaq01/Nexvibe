import { getData } from 'country-list';

// { code: 'US', name: 'United States' } for every ISO 3166-1 assigned
// country, sorted alphabetically by name for the admin country picker.
export const COUNTRIES = getData()
  .slice()
  .sort((a, b) => a.name.localeCompare(b.name));
