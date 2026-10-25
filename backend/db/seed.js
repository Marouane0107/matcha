import bcrypt from 'bcrypt';
import { faker } from '@faker-js/faker';
import { pool } from '../src/config/db.js';

// Pre-define tags pool
const TAGS_POOL = [
  'coding', 'coffee', 'travel', 'art', 'music',
  'gaming', 'fitness', 'foodie', 'photography', 'movies',
  'books', 'tech', 'design', 'sports', 'yoga',
  'hiking', 'cooking', 'nature', 'fashion', 'science'
];

// Reference cities for realistic secondary geographic distribution
const SECONDARY_CITIES = [
  { city: 'Lyon, France', lat: 45.7640, lon: 4.8357 },
  { city: 'Marseille, France', lat: 43.2965, lon: 5.3698 },
  { city: 'Bordeaux, France', lat: 44.8378, lon: -0.5792 },
  { city: 'Lille, France', lat: 50.6292, lon: 3.0573 },
  { city: 'Strasbourg, France', lat: 48.5734, lon: 7.7521 },
  { city: 'Casablanca, Morocco', lat: 33.5731, lon: -7.5898 },
  { city: 'Rabat, Morocco', lat: 34.0209, lon: -6.8416 },
  { city: 'Marrakech, Morocco', lat: 31.6295, lon: -7.9811 }
];

export async function seedDatabase(targetCount = 520) {
  console.log(`🌱 Starting deterministic seed with ${targetCount} users (Seed: 42)...`);
  const startTime = Date.now();

  // Reset faker to constant seed
  faker.seed(42);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Seed Tags
    console.log('🏷️  Seeding tags...');
    const tagIds = [];
    for (const tagName of TAGS_POOL) {
      const res = await client.query(
        `INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [tagName]
      );
      tagIds.push({ id: res.rows[0].id, name: tagName });
    }

    // 2. Hash default password once for speed
    console.log('🔑 Hashing default password...');
    const defaultPasswordHash = await bcrypt.hash('Matcha123!', 10);

    // 3. Generate Users & Profiles
    console.log(`👥 Generating ${targetCount} users and profiles...`);
    const users = [];

    // Dedicated deterministic primary tester account
    users.push({
      username: 'matcha_tester',
      email: 'tester@matcha.com',
      passwordHash: defaultPasswordHash,
      firstName: 'Alex',
      lastName: 'Morgan',
      gender: 'male',
      sexualPreference: 'bisexual',
      birthDate: '1996-06-15', // 30 years old
      biography: 'Lead tester and developer. Love specialty coffee, traveling the world, and clean code.',
      latitude: 48.8566, // Paris Center
      longitude: 2.3522,
      locationString: 'Paris, France'
    });

    const genders = ['male', 'female', 'other'];
    const sexualPreferences = ['heterosexual', 'homosexual', 'bisexual'];

    for (let i = 1; i < targetCount; i++) {
      // Deterministic distribution
      const genderRoll = faker.number.float({ min: 0, max: 1 });
      const gender = genderRoll < 0.46 ? 'male' : genderRoll < 0.92 ? 'female' : 'other';

      const prefRoll = faker.number.float({ min: 0, max: 1 });
      const sexualPreference = prefRoll < 0.65 ? 'heterosexual' : prefRoll < 0.85 ? 'homosexual' : 'bisexual';

      const firstName = gender === 'female' ? faker.person.firstName('female') : faker.person.firstName('male');
      const lastName = faker.person.lastName();
      const username = `${firstName.toLowerCase()}_${lastName.toLowerCase()}_${i}`.replace(/[^a-z0-9_]/g, '');
      const email = `${username}@example.com`;

      const birthDateObj = faker.date.birthdate({ min: 18, max: 65, mode: 'age' });
      const birthDate = birthDateObj.toISOString().split('T')[0];

      // Geo clustering: 75% around Paris primary cluster, 25% spread out
      let latitude;
      let longitude;
      let locationString;

      if (faker.number.float({ min: 0, max: 1 }) < 0.75) {
        // Primary cluster: within ~30km of Paris center
        latitude = 48.8566 + (faker.number.float({ min: -0.25, max: 0.25 }));
        longitude = 2.3522 + (faker.number.float({ min: -0.35, max: 0.35 }));
        locationString = faker.helpers.arrayElement(['Paris 1er', 'Paris 11e', 'Paris 18e', 'Boulogne-Billancourt', 'Montreuil', 'Saint-Denis', 'Versailles']);
      } else {
        // Secondary regional spread
        const ref = faker.helpers.arrayElement(SECONDARY_CITIES);
        latitude = ref.lat + (faker.number.float({ min: -0.08, max: 0.08 }));
        longitude = ref.lon + (faker.number.float({ min: -0.08, max: 0.08 }));
        locationString = ref.city;
      }

      users.push({
        username,
        email,
        passwordHash: defaultPasswordHash,
        firstName,
        lastName,
        gender,
        sexualPreference,
        birthDate,
        biography: faker.person.bio(),
        latitude: parseFloat(latitude.toFixed(6)),
        longitude: parseFloat(longitude.toFixed(6)),
        locationString
      });
    }

    // Insert users and profiles in chunks
    const userRecords = []; // { id, ... }
    const chunkSize = 100;

    for (let c = 0; c < users.length; c += chunkSize) {
      const chunk = users.slice(c, c + chunkSize);
      for (const u of chunk) {
        const userRes = await client.query(
          `INSERT INTO users (username, email, password_hash, is_verified)
           VALUES ($1, $2, $3, true)
           RETURNING id`,
          [u.username, u.email, u.passwordHash]
        );
        const userId = userRes.rows[0].id;

        await client.query(
          `INSERT INTO profiles (
             user_id, first_name, last_name, birth_date, gender, 
             sexual_preference, biography, fame_rating, latitude, longitude, location_string
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            userId, u.firstName, u.lastName, u.birthDate, u.gender,
            u.sexualPreference, u.biography, 0.0, u.latitude, u.longitude, u.locationString
          ]
        );

        userRecords.push({ id: userId, ...u });
      }
    }

    // 4. Assign Tags (2 to 5 per user)
    console.log('🏷️  Assigning user tags...');
    for (const u of userRecords) {
      const tagCount = faker.number.int({ min: 2, max: 5 });
      const selectedTags = faker.helpers.arrayElements(tagIds, tagCount);
      for (const t of selectedTags) {
        await client.query(
          `INSERT INTO user_tags (user_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [u.id, t.id]
        );
      }
    }

    // 5. Photos: 1 to 4 photos per user, exactly 1 marked is_profile_picture = true
    console.log('📸 Seeding user photos...');
    for (let i = 0; i < userRecords.length; i++) {
      const u = userRecords[i];
      const photoCount = faker.number.int({ min: 1, max: 4 });
      for (let p = 0; p < photoCount; p++) {
        const isMain = p === 0;
        const photoUrl = `https://picsum.photos/seed/matcha-${u.id}-${p}/600/600`;
        await client.query(
          `INSERT INTO photos (user_id, url, is_profile_picture) VALUES ($1, $2, $3)`,
          [u.id, photoUrl, isMain]
        );
      }
    }

    // 6. Interconnected Likes, Mutual Matches, Visits & Messages
    console.log('❤️  Generating likes, matches, visits and messages...');
    const likesMap = new Map(); // "likerId:likedId" -> true
    const mutualPairs = [];

    // Sample 700 likes
    for (let i = 0; i < 700; i++) {
      const u1 = faker.helpers.arrayElement(userRecords);
      const u2 = faker.helpers.arrayElement(userRecords);
      if (u1.id === u2.id) continue;

      const key = `${u1.id}:${u2.id}`;
      if (likesMap.has(key)) continue;

      likesMap.set(key, true);
      await client.query(
        `INSERT INTO likes (liker_id, liked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [u1.id, u2.id]
      );

      // Check for mutual match
      const reciprocalKey = `${u2.id}:${u1.id}`;
      if (likesMap.has(reciprocalKey)) {
        mutualPairs.push([u1.id, u2.id]);
      }
    }

    // Seed guaranteed mutual matches for the primary tester
    const testerId = userRecords[0].id;
    for (let i = 1; i <= 8; i++) {
      const targetId = userRecords[i].id;
      await client.query(
        `INSERT INTO likes (liker_id, liked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [testerId, targetId]
      );
      await client.query(
        `INSERT INTO likes (liker_id, liked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [targetId, testerId]
      );
      mutualPairs.push([testerId, targetId]);
    }

    // Seed Messages for mutual matches
    console.log(`💬 Seeding sample conversations for ${mutualPairs.length} mutual matches...`);
    for (const [p1, p2] of mutualPairs) {
      const msgCount = faker.number.int({ min: 2, max: 5 });
      for (let m = 0; m < msgCount; m++) {
        const sender = m % 2 === 0 ? p1 : p2;
        const receiver = m % 2 === 0 ? p2 : p1;
        const content = faker.helpers.arrayElement([
          'Hey! How are you doing today?',
          'Nice to match with you! Love your photos.',
          'Hey there! Do you also like specialty coffee?',
          'Would love to grab a matcha latte sometime!',
          'Are you into coding or tech as well?'
        ]);
        await client.query(
          `INSERT INTO messages (sender_id, receiver_id, content, is_read) VALUES ($1, $2, $3, true)`,
          [sender, receiver, content]
        );
      }
    }

    // Seed Visits (1000 visits)
    console.log('👀 Seeding profile visits...');
    for (let v = 0; v < 1000; v++) {
      const visitor = faker.helpers.arrayElement(userRecords);
      const visited = faker.helpers.arrayElement(userRecords);
      if (visitor.id === visited.id) continue;
      await client.query(
        `INSERT INTO visits (visitor_id, visited_id) VALUES ($1, $2)`,
        [visitor.id, visited.id]
      );
    }

    // Seed Blocks (sample 25 blocks)
    console.log('🚫 Seeding sample blocks...');
    for (let b = 0; b < 25; b++) {
      const blocker = faker.helpers.arrayElement(userRecords);
      const blocked = faker.helpers.arrayElement(userRecords);
      if (blocker.id === blocked.id) continue;
      await client.query(
        `INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [blocker.id, blocked.id]
      );
    }

    // 7. Update Fame Ratings based on incoming likes
    console.log('⭐ Computing and updating fame ratings...');
    await client.query(`
      WITH like_counts AS (
        SELECT liked_id, COUNT(*) as cnt
        FROM likes
        GROUP BY liked_id
      )
      UPDATE profiles p
      SET fame_rating = LEAST(100.0, ROUND(COALESCE(lc.cnt * 12.5, 0.0)::numeric, 1))
      FROM like_counts lc
      WHERE p.user_id = lc.liked_id;
    `);

    // Give remaining profiles baseline random fame between 5 and 40
    await client.query(`
      UPDATE profiles
      SET fame_rating = ROUND((RANDOM() * 35 + 5)::numeric, 1)
      WHERE fame_rating = 0.0;
    `);

    await client.query('COMMIT');
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Deterministic seed complete in ${duration}s!`);
    console.log(`👤 Seeded users count: ${userRecords.length}`);
    console.log(`🔑 Tester account: tester@matcha.com / Matcha123! (Username: matcha_tester)`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error during seeding:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Run directly if called as a script
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seedDatabase()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
