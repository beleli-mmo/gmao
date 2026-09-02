/**
 * Initialise CouchDB pour la production : crée les bases nécessaires à la
 * réplication PouchDB et pousse le design-doc de validation.
 *
 *   COUCH_URL="https://admin:pass@xxx.cloudantnosqldb.appdomain.cloud" npm run couch:setup
 */
import nano from 'nano';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const COUCH_URL = process.env.COUCH_URL;
if (!COUCH_URL) {
  console.error('COUCH_URL manquant');
  process.exit(1);
}

const couch = nano(COUCH_URL);
const DBS = [
  process.env.COUCH_FIELD_DB ?? 'field-tickets',
  process.env.COUCH_REF_DB ?? 'field-ref',
  process.env.COUCH_META_DB ?? 'sync-meta',
];

const here = dirname(fileURLToPath(import.meta.url));
const designDoc = JSON.parse(readFileSync(join(here, '../../../infra/couchdb/field-tickets.design.json'), 'utf8'));

async function main() {
  const existing = await couch.db.list();
  for (const name of DBS) {
    if (existing.includes(name)) {
      console.log(`= ${name} (déjà présente)`);
    } else {
      await couch.db.create(name);
      console.log(`+ ${name} créée`);
    }
  }

  const field = couch.db.use(DBS[0]);
  try {
    const current = (await field.get(designDoc._id)) as any;
    await field.insert({ ...designDoc, _rev: current._rev });
    console.log(`~ design-doc mis à jour sur ${DBS[0]}`);
  } catch {
    await field.insert(designDoc);
    console.log(`+ design-doc installé sur ${DBS[0]}`);
  }

  console.log('CouchDB prêt.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
