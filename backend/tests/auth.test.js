import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, isPasswordStrong, isCommonPassword } from '../src/utils/password.util.js';
import { generateToken, verifyToken, getExpiresInSeconds, validateJwtSecret } from '../src/utils/jwt.util.js';
import { authenticatedRateLimit } from '../src/middleware/rate-limit.middleware.js';
import { assertDevOrTest } from '../src/config/env.js';
import { pagination } from '../src/utils/http.util.js';

test('new password hashing preserves suffixes beyond bcrypt byte limit and Unicode', async () => {
  const prefix = 'A'.repeat(72);
  const hash = await hashPassword(prefix + 'Original123');
  assert.equal(await verifyPassword(prefix + 'Original123', hash), true);
  assert.equal(await verifyPassword(prefix + 'Different123', hash), false);
  const unicode = '界'.repeat(30) + '123';
  assert.equal(await verifyPassword(unicode, await hashPassword(unicode)), true);
});

test('password policy agrees with frontend structural bounds and rejects common candidates', () => {
  assert(isPasswordStrong('LongUniquePass123'));
  assert(!isPasswordStrong('Short123'));
  assert(!isPasswordStrong('x'.repeat(129) + '1'));
  assert(isCommonPassword('Password123!'));
  assert(!isCommonPassword('LongUniquePass123'));
});

test('JWT expiry is capped at fifteen minutes and invalid signatures are rejected', () => {
  process.env.JWT_SECRET = 'unit-test-only-signing-secret-with-32-bytes';
  assert.equal(getExpiresInSeconds('7d'), 900);
  assert.equal(getExpiresInSeconds('bad'), 900);
  const token = generateToken({ id: 'user', version: 0 });
  const decoded = verifyToken(token);
  assert.equal(decoded.exp - decoded.iat, 900);
  assert.throws(() => verifyToken(token.slice(0, -4) + 'bad!'));
});

test('JWT secrets shorter than 32 bytes are rejected', () => {
  const previous = process.env.JWT_SECRET;
  try {
    process.env.JWT_SECRET = 'short';
    assert.throws(validateJwtSecret, /at least 32 bytes/);
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
});

test('REST buckets are shared across user tokens and views have a separate limit', () => {
  const response = { code: 200, headers: {}, set(name, value) { this.headers[name] = value; return this; }, status(code) { this.code = code; return this; }, json(body) { return body; } };
  let accepted = 0;
  const request = { user: { id: 'rate-test-user' }, headers: { authorization: '' }, method: 'GET', originalUrl: '/api/profile' };
  for (let index = 0; index < 121; index++) {
    request.headers.authorization = `Bearer session-${index}`;
    authenticatedRateLimit(request, response, () => accepted++);
  }
  assert.equal(accepted, 120);
  assert.equal(response.code, 429);
  assert(Number(response.headers['Retry-After']) > 0);
  accepted = 0;
  request.user.id = 'view-rate-test-user';
  request.method = 'POST';
  request.originalUrl = '/api/profiles/target/view';
  for (let index = 0; index < 31; index++) authenticatedRateLimit(request, response, () => accepted++);
  assert.equal(accepted, 30);
});

test('pagination rejects nondecimal syntax and unsafe offsets', () => {
  assert.deepEqual(pagination({ page: '2', limit: '10' }), { page: 2, limit: 10 });
  for (const page of ['1e0', '0x1', '1.0', ' 1', '9007199254740991']) assert.throws(() => pagination({ page, limit: '100' }));
});

test('seed/reset guards require an explicitly confirmed local dev/test database', () => {
  const keys = ['NODE_ENV', 'DB_NAME', 'DB_HOST', 'DB_CONFIRM_NAME'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, { NODE_ENV: 'development', DB_NAME: 'matcha_test', DB_HOST: '127.0.0.1', DB_CONFIRM_NAME: '' });
    assert.throws(() => assertDevOrTest('Seed'));
    process.env.DB_CONFIRM_NAME = 'matcha_test';
    assert.doesNotThrow(() => assertDevOrTest('Seed'));
    process.env.DB_HOST = 'production.example.test';
    assert.throws(() => assertDevOrTest('Seed'));
    process.env.DB_HOST = '127.0.0.1'; process.env.NODE_ENV = 'production';
    assert.throws(() => assertDevOrTest('Seed'));
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});