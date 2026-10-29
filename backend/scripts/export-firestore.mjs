#!/usr/bin/env node
/**
 * Dumps the live Firestore database to the JSON layout `php artisan
 * tikooh:import-firestore` expects.
 *
 * Run it against production with a service-account key, then hand the output
 * directory to the importer:
 *
 *   npm i firebase-admin
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *     node scripts/export-firestore.mjs ./firestore-export
 *   php artisan tikooh:import-firestore ./firestore-export --dry-run
 *
 * Sub-collection documents carry their parent ids as `_tenantId` / `_eventId`
 * so the importer can rebuild the relationships.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import admin from 'firebase-admin';

const outDir = process.argv[2] ?? './firestore-export';

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

/** Firestore Timestamps -> ISO strings, recursively. */
function normalise(value) {
  if (value === null || value === undefined) return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(normalise);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalise(v)]));
  }
  return value;
}

async function dumpTop(name) {
  const snap = await db.collection(name).get();
  const out = {};
  snap.forEach((doc) => { out[doc.id] = normalise(doc.data()); });
  return out;
}

async function dumpTenantSub(subcollection, extra = () => ({})) {
  const tenants = await db.collection('tenants').get();
  const out = {};

  for (const tenant of tenants.docs) {
    const snap = await tenant.ref.collection(subcollection).get();
    snap.forEach((doc) => {
      out[doc.id] = { ...normalise(doc.data()), _tenantId: tenant.id, ...extra(tenant, doc) };
    });
  }

  return out;
}

/** Walks tenants -> events -> <subcollection>. */
async function dumpEventSub(subcollection) {
  const tenants = await db.collection('tenants').get();
  const out = {};

  for (const tenant of tenants.docs) {
    const events = await tenant.ref.collection('events').get();

    for (const event of events.docs) {
      const snap = await event.ref.collection(subcollection).get();
      snap.forEach((doc) => {
        out[doc.id] = {
          ...normalise(doc.data()),
          _tenantId: tenant.id,
          _eventId: event.id,
        };
      });
    }
  }

  return out;
}

const collections = {
  tenants: () => dumpTop('tenants'),
  events: () => dumpTenantSub('events'),
  guests: () => dumpTenantSub('guests'),
  registration_fields: () => dumpTenantSub('registration_fields'),
  promo_codes: () => dumpTenantSub('promo_codes'),
  campaigns: () => dumpTenantSub('campaigns'),
  rooms: () => dumpTenantSub('rooms'),
  speakers: () => dumpEventSub('speakers'),
  sessions: () => dumpEventSub('sessions'),
  waitlist: () => dumpEventSub('waitlist'),
  tickets: () => dumpTop('tickets'),
  blog_posts: () => dumpTop('blog_posts'),
};

await mkdir(outDir, { recursive: true });

for (const [name, fetch] of Object.entries(collections)) {
  process.stdout.write(`Exporting ${name}… `);

  try {
    const data = await fetch();
    await writeFile(join(outDir, `${name}.json`), JSON.stringify(data, null, 2));
    console.log(`${Object.keys(data).length} documents`);
  } catch (error) {
    console.log(`FAILED: ${error.message}`);
  }
}

console.log(`\nDone. Import with:\n  php artisan tikooh:import-firestore ${outDir} --dry-run`);
