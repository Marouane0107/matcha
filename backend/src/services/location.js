import { pool } from '../config/db.js';
import { fail, fields, text } from '../utils/http.util.js';
import { profile } from './profile.js';
import { LOCATION_CATALOG } from '@matcha/shared';
import cityTimezones from 'city-timezones';
import { BlockList, isIP } from 'node:net';
import geoip from 'fast-geoip';

const nonPublic = new BlockList();
for (const [address, prefix] of Object.entries({ '0.0.0.0': 8, '10.0.0.0': 8, '100.64.0.0': 10, '127.0.0.0': 8, '169.254.0.0': 16, '172.16.0.0': 12, '192.0.0.0': 24, '192.0.2.0': 24, '192.168.0.0': 16, '198.18.0.0': 15, '198.51.100.0': 24, '203.0.113.0': 24, '224.0.0.0': 3 })) nonPublic.addSubnet(address, prefix);

export async function approximatePlace(address, lookup = geoip.lookup) {
  const ip = typeof address === 'string' ? address.replace(/^::ffff:/i, '') : '';
  const family = isIP(ip);
  if (family !== 4 || nonPublic.check(ip)) fail('LOCATION_REQUIRED');
  let result;
  try { result = await lookup(ip); } catch { fail('LOCATION_REQUIRED'); }
  if (!result || !Array.isArray(result.ll) || result.ll.length !== 2 || result.ll.some(value => typeof value !== 'number' || !Number.isFinite(value)) || Math.abs(result.ll[0]) > 90 || Math.abs(result.ll[1]) > 180 || !/^[A-Z]{2}$/.test(result.country)) fail('LOCATION_REQUIRED');
  const city = result.city || new Intl.DisplayNames(['en'], { type: 'region' }).of(result.country);
  if (!text(city, 1, 100)) fail('LOCATION_REQUIRED');
  return { city, neighborhood: null, latitude: Math.round(result.ll[0] * 10) / 10, longitude: Math.round(result.ll[1] * 10) / 10, mode: 'approximate' };
}

export async function approximateLocation(id, address) {
  const current = await profile(id);
  if (current.location) return current;
  const place = await approximatePlace(address);
  await pool.query('UPDATE profiles SET latitude=$2,longitude=$3,city=$4,neighborhood=NULL,location_mode=$5,location_string=$4,updated_at=NOW() WHERE user_id=$1 AND latitude IS NULL AND longitude IS NULL', [id, place.latitude, place.longitude, place.city, place.mode]);
  return profile(id);
}

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