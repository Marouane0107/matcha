/**
 * Geo & Eligibility SQL Utilities
 *
 * All functions return raw SQL fragments and parameter arrays for use
 * in parameterized queries — zero ORM, zero string interpolation.
 */

// ─── Haversine Distance ─────────────────────────────────────────────
// Returns a SQL expression that computes the great-circle distance (km)
// between two coordinate pairs using the Haversine formula:
//   d = 6371 × 2 × asin(√(sin²(Δlat/2) + cos(lat₁)·cos(lat₂)·sin²(Δlon/2)))
//
// `userLatParam` and `userLonParam` are the $N placeholders for the
// authenticated user's coordinates.

/**
 * Build a raw SQL expression for Haversine distance in kilometres.
 *
 * @param {string} userLatParam – Placeholder like '$1' for current user latitude
 * @param {string} userLonParam – Placeholder like '$2' for current user longitude
 * @param {string} targetLatCol – Column reference for target latitude  (e.g. 'p.latitude')
 * @param {string} targetLonCol – Column reference for target longitude (e.g. 'p.longitude')
 * @returns {string} SQL expression evaluating to distance in km
 */
export function haversineSQL(userLatParam, userLonParam, targetLatCol = 'p.latitude', targetLonCol = 'p.longitude') {
  // Explicit ::float8 casts so pg can resolve parameter types inside math functions
  const lat = `(${userLatParam}::float8)`;
  const lon = `(${userLonParam}::float8)`;
  return `(
    6371.0 * 2.0 * ASIN(
      SQRT(
        POWER(SIN(RADIANS(${targetLatCol} - ${lat}) / 2.0), 2)
        + COS(RADIANS(${lat}))
          * COS(RADIANS(${targetLatCol}))
          * POWER(SIN(RADIANS(${targetLonCol} - ${lon}) / 2.0), 2)
      )
    )
  )`;
}

// ─── Eligibility Filter ─────────────────────────────────────────────
// Builds a WHERE-clause fragment (without the leading WHERE keyword)
// that excludes:
//   1. The authenticated user themselves.
//   2. Any user blocked by OR blocking the current user.
//   3. Incompatible gender ↔ sexual-preference combinations.
//
// Convention for gender / preference stored in the DB (from seed.js):
//   gender:            'male' | 'female' | 'other'
//   sexual_preference: 'heterosexual' | 'homosexual' | 'bisexual'
//
// Compatibility matrix:
//   bisexual  → matches everyone
//   heterosexual male   → target must be female
//   heterosexual female → target must be male
//   homosexual male     → target must be male
//   homosexual female   → target must be female
//   heterosexual other  → matches everyone (treated as bisexual)
//   homosexual other    → matches everyone (treated as bisexual)
//
// The filter is bidirectional: the current user must be interested in
// the target's gender AND the target must be interested in the current
// user's gender.

/**
 * Build eligibility WHERE conditions.
 *
 * @param {string} currentUserIdParam – Placeholder like '$1'
 * @param {string} currentGenderParam – Placeholder like '$3'
 * @param {string} currentPrefParam   – Placeholder like '$4'
 * @returns {{ sql: string }} SQL fragment to AND into a WHERE clause
 */
export function eligibilityFilterSQL(currentUserIdParam, currentGenderParam, currentPrefParam) {
  // Explicit casts so pg can resolve parameter types
  const uid    = `(${currentUserIdParam}::uuid)`;
  const gender = `(${currentGenderParam}::text)`;
  const pref   = `(${currentPrefParam}::text)`;

  // ── Block filter ──
  const blockFilter = `
    u.id != ${uid}
    AND NOT EXISTS (
      SELECT 1 FROM blocks b
      WHERE (b.blocker_id = ${uid} AND b.blocked_id = u.id)
         OR (b.blocker_id = u.id AND b.blocked_id = ${uid})
    )
  `;

  // ── Sexual-preference compatibility (bidirectional) ──
  // Current user → target: does the current user's preference match the target's gender?
  const currentToTarget = `
    (
      ${pref} = 'bisexual'
      OR ${gender} = 'other'
      OR (${pref} = 'heterosexual' AND ${gender} = 'male'   AND p.gender = 'female')
      OR (${pref} = 'heterosexual' AND ${gender} = 'female' AND p.gender = 'male')
      OR (${pref} = 'homosexual'   AND ${gender} = 'male'   AND p.gender = 'male')
      OR (${pref} = 'homosexual'   AND ${gender} = 'female' AND p.gender = 'female')
    )
  `;

  // Target → current user: does the target's preference match the current user's gender?
  const targetToCurrent = `
    (
      p.sexual_preference = 'bisexual'
      OR p.gender = 'other'
      OR (p.sexual_preference = 'heterosexual' AND p.gender = 'male'   AND ${gender} = 'female')
      OR (p.sexual_preference = 'heterosexual' AND p.gender = 'female' AND ${gender} = 'male')
      OR (p.sexual_preference = 'homosexual'   AND p.gender = 'male'   AND ${gender} = 'male')
      OR (p.sexual_preference = 'homosexual'   AND p.gender = 'female' AND ${gender} = 'female')
    )
  `;

  return {
    sql: `${blockFilter}\n    AND ${currentToTarget}\n    AND ${targetToCurrent}`
  };
}
