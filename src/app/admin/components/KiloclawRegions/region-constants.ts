export type RegionDef = {
  code: string;
  label: string;
  description?: string;
  score?: number;
};

export const META_REGIONS: RegionDef[] = [
  { code: 'eu', label: 'Europe', description: 'Fly meta-region — all EU datacenters' },
  { code: 'us', label: 'United States', description: 'Fly meta-region — all US datacenters' },
];

export const SPECIFIC_REGIONS: RegionDef[] = [
  { code: 'arn', label: 'Stockholm', score: 15.04 },
  { code: 'cdg', label: 'Paris', score: 14.63 },
  { code: 'iad', label: 'Ashburn', score: 13.85 },
  { code: 'ams', label: 'Amsterdam', score: 13.58 },
  { code: 'fra', label: 'Frankfurt', score: 13.16 },
  { code: 'lhr', label: 'London', score: 12.25 },
  { code: 'lax', label: 'Los Angeles', score: 9.68 },
  { code: 'ewr', label: 'Newark', score: 9.07 },
  { code: 'sjc', label: 'San Jose', score: 8.4 },
  { code: 'ord', label: 'Chicago', score: 8.2 },
  { code: 'dfw', label: 'Dallas', score: 6.8 },
  { code: 'yyz', label: 'Toronto', score: 5.17 },
];

const META_CODES = new Set(META_REGIONS.map(r => r.code));
const SPECIFIC_CODES = new Set(SPECIFIC_REGIONS.map(r => r.code));

/** Check if a region list mixes meta and specific codes. */
export function hasMixedRegionTypes(regions: string[]): boolean {
  const hasMeta = regions.some(r => META_CODES.has(r));
  const hasSpecific = regions.some(r => SPECIFIC_CODES.has(r));
  return hasMeta && hasSpecific;
}
