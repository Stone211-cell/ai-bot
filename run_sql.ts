import { PrismaClient } from './generated/prisma/index.js';
import * as fs from 'fs';

async function main() {
  const prisma = new PrismaClient();
  try {
    const sql = fs.readFileSync('create_global_knowledge.sql', 'utf8');
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      console.log('Executing:', statement.substring(0, 50).replace(/\n/g, ' '));
      await prisma.$executeRawUnsafe(statement);
    }
    console.log('✅ Tables created successfully!');
  } catch (error) {
    console.error('❌ Error executing SQL:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
