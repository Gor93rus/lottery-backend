/**
 * Admin Password Reset Script
 * 
 * Usage:
 *   npx tsx scripts/reset-admin-password.ts [telegramId] [newPassword]
 * 
 * Examples:
 *   npx tsx scripts/reset-admin-password.ts                    # Reset all admins to default password
 *   npx tsx scripts/reset-admin-password.ts 432735601          # Reset specific admin to default password
 *   npx tsx scripts/reset-admin-password.ts 432735601 MyPass123!  # Reset specific admin to custom password
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = 'Admin@123!';

async function main() {
  const args = process.argv.slice(2);
  const telegramId = args[0];
  const newPassword = args[1] || DEFAULT_PASSWORD;

  console.log('🔐 Admin Password Reset Script');
  console.log('================================\n');

  // Validate password strength
  if (newPassword.length < 8) {
    console.error('❌ Password must be at least 8 characters long');
    process.exit(1);
  }

  // Hash the new password
  const passwordHash = await bcrypt.hash(newPassword, 12);

  if (telegramId) {
    // Reset specific admin
    const admin = await prisma.adminUser.findUnique({
      where: { telegramId }
    });

    if (!admin) {
      console.error(`❌ Admin with Telegram ID ${telegramId} not found`);
      
      // List available admins
      const admins = await prisma.adminUser.findMany({
        select: { telegramId: true, username: true, role: true }
      });
      
      if (admins.length > 0) {
        console.log('\n📋 Available admins:');
        admins.forEach(a => {
          console.log(`   - Telegram ID: ${a.telegramId}, Username: ${a.username || 'N/A'}, Role: ${a.role}`);
        });
      }
      
      process.exit(1);
    }

    await prisma.adminUser.update({
      where: { telegramId },
      data: { passwordHash }
    });

    console.log(`✅ Password reset for admin:`);
    console.log(`   Telegram ID: ${admin.telegramId}`);
    console.log(`   Username: ${admin.username || 'N/A'}`);
    console.log(`   Role: ${admin.role}`);
  } else {
    // Reset all admins
    const result = await prisma.adminUser.updateMany({
      data: { passwordHash }
    });

    console.log(`✅ Password reset for ${result.count} admin(s)`);
    
    // List all admins
    const admins = await prisma.adminUser.findMany({
      select: { telegramId: true, username: true, role: true }
    });
    
    console.log('\n📋 Updated admins:');
    admins.forEach(a => {
      console.log(`   - Telegram ID: ${a.telegramId}, Username: ${a.username || 'N/A'}, Role: ${a.role}`);
    });
  }

  console.log(`\n🔑 New password: ${newPassword}`);
  console.log('\n⚠️  Please change this password after first login!');
  console.log('   Use: POST /api/admin/auth/set-password');
}

main()
  .catch((error) => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
