const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const neo4j = require('neo4j-driver');

async function test() {
  const uri = process.env.NEO4J_URI || 'neo4j://localhost:7687';
  const user = process.env.NEO4J_USER || process.env.NEO4J_USERNAME || 'neo4j';
  const password = process.env.NEO4J_PASSWORD || 'password';
  const database = process.env.NEO4J_DATABASE || undefined;

  console.log('Testing Neo4j connection to', uri, 'as', user, 'database', database || '(default)');

  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

  const session = driver.session(database ? { database } : {});
  try {
    const res = await session.run('RETURN 1 AS result');
    const val = res.records[0].get('result');
    console.log('Query succeeded, result =', val);
    await session.close();
    await driver.close();
    process.exit(0);
  } catch (err) {
    console.error('Neo4j connection test failed:', err.message || err);
    try { await session.close(); } catch (e) {}
    try { await driver.close(); } catch (e) {}
    process.exit(2);
  }
}

test();
