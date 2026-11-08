export function ageFromDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const birth = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  if (now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())) {
    age -= 1;
  }
  return age;
}

/**
 * @param {object} profile
 * @param {{ likedByMe?: boolean, hasLikedMe?: boolean, isOnline?: boolean }} [options]
 */
export function userProfileToPublic(profile, { likedByMe = false, hasLikedMe = false, isOnline } = {}) {
  return {
    id: profile.id,
    username: profile.username,
    firstName: profile.firstName,
    lastName: profile.lastName,
    gender: profile.gender,
    sexualPreference: profile.sexualPreference,
    bio: profile.bio,
    fameRating: profile.fameRating,
    tags: profile.tags,
    pictures: profile.pictures,
    isOnline: typeof isOnline === "boolean" ? isOnline : profile.isOnline,
    lastSeen: profile.lastSeen,
    age: ageFromDate(profile.dateOfBirth),
    location: profile.location ? { city: profile.location.city, neighborhood: profile.location.neighborhood } : null,
    likedByMe,
    hasLikedMe,
    isConnected: likedByMe && hasLikedMe,
  };
}
