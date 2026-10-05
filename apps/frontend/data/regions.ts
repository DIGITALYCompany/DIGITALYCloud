// The region catalog is shared with the backend (placement, plan rules), so both sides agree.
export {
  DEFAULT_REGION,
  REGIONS,
  REGION_AREAS,
  TIER_COVERAGE,
  getRegion,
  getRegionByLabel,
  isRegionAllowed,
  regionLabel,
  regionsForPlan,
  type Region,
  type RegionArea,
} from '@digitalycloud/shared';
