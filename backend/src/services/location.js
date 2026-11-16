import { pool } from '../config/db.js';
import { fail, fields, text } from '../utils/http.util.js';
import { profile } from './profile.js';
import { LOCATION_CATALOG } from '@matcha/shared';
import cityTimezones from 'city-timezones';

const cities = Object.fromEntries(LOCATION_CATALOG.map(place => [place.id, [place.latitude, place.longitude]]));
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function resolveCity(value) {
  const [name, ...qualifiers] = value.split(',').map(normalize);
  if (!qualifiers.length && Object.hasOwn(cities, name)) return cities[name];
  const matches = cityTimezones.cityMapping.filter(place => [place.city, place.city_ascii].some(value => normalize(value) === name) && qualifiers.every(qualifier => [place.country, place.province, place.iso2, place.iso3, place.state_ansi].some(value => value && normalize(value) === qualifier)));
  if (matches.length !== 1) fail();
  return [matches[0].lat, matches[0].lng];
}
export async function updateLocation(id, body) {
  fields(body, body?.mode === 'gps' ? ['mode', 'city', 'neighborhood', 'latitude', 'longitude'] : ['mode', 'city', 'neighborhood'], ['mode', 'city', 'neighborhood']);
  if (!['gps', 'manual'].includes(body.mode) || !text(body.city, 1, 100) || body.neighborhood !== null && !text(body.neighborhood, 1, 100)) fail();
  let latitude = body.latitude, longitude = body.longitude;
  if (body.mode === 'gps') {
    if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) fail();
  } else {
    [latitude, longitude] = resolveCity(body.city);
  }
  await pool.query('UPDATE profiles SET latitude=$2,longitude=$3,city=$4,neighborhood=$5,location_mode=$6,location_string=$4,updated_at=NOW() WHERE user_id=$1', [id, latitude, longitude, body.city.trim(), body.neighborhood?.trim() ?? null, body.mode]);
  return profile(id);
}