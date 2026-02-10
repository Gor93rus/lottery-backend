import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create admin user with default password
  console.log('\n🔐 Creating admin user...');
  const defaultPassword = await bcrypt.hash('admin123!', 12);
  
  await prisma.adminUser.upsert({
    where: { telegramId: '432735601' },
    update: { passwordHash: defaultPassword },
    create: {
      telegramId: '432735601',
      username: 'admin',
      role: 'superadmin',
      passwordHash: defaultPassword,
      active: true
    }
  });

  console.log('✅ Admin user created');
  console.log('⚠️  Please change the default password immediately after first login!');

  // Create Weekend Special lottery
  const weekendSpecial = await prisma.lottery.upsert({
    where: { slug: 'weekend-special' },
    update: {},
    create: {
      slug: 'weekend-special',
      name: 'Weekend Special',
      description: 'Классическая лотерея 5 из 36 с ежедневными розыгрышами! Выберите 5 чисел от 1 до 36 и выиграйте до 500 TON!',
      numbersCount: 5,
      numbersMax: 36,
      ticketPrice: 1.0,
      jackpot: 500.0,
      drawTime: '18:00',
      drawTimezone: 'Europe/Moscow',
      active: true,
      featured: true,
      prizeStructure: {
        '5': 500,      // 5 из 5 совпадений - 500 TON (джекпот)
        '4': 50,       // 4 из 5 совпадений - 50 TON
        '3': 5,        // 3 из 5 совпадений - 5 TON
        '2': 0.5,      // 2 из 5 совпадений - 0.5 TON
        '1': 'free_ticket' // 1 из 5 совпадений - бесплатный билет
      }
    }
  });

  console.log('✅ Created lottery:', weekendSpecial.name);

  // Create fund for Weekend Special
  await prisma.lotteryFund.upsert({
    where: {
      lotteryId_currency: {
        lotteryId: weekendSpecial.id,
        currency: 'TON',
      },
    },
    update: {},
    create: {
      lotteryId: weekendSpecial.id,
      currency: 'TON',
    },
  });

  console.log('✅ Created fund for Weekend Special');

  // Create payout config
  await prisma.lotteryPayoutConfig.upsert({
    where: { lotteryId: weekendSpecial.id },
    update: {},
    create: {
      lotteryId: weekendSpecial.id,
      platformShare: 0.50,
      prizeShare: 0.50,
      reserveShare: 0.10,
      incomeShare: 0.90,
      jackpotShare: 0.15,
      payoutShare: 0.85,
      match4Share: 0.60,
      match3Share: 0.30,
      match2Share: 0.10,
      match1Fixed: 0.1,
    },
  });

  console.log('✅ Created payout config for Weekend Special');

  // Create draw schedule
  await prisma.drawSchedule.upsert({
    where: { lotteryId: weekendSpecial.id },
    update: {},
    create: {
      lotteryId: weekendSpecial.id,
      scheduleType: 'manual',
      enabled: false,
      timezone: 'Europe/Moscow',
    },
  });

  console.log('✅ Created draw schedule for Weekend Special');

  // Create first draw scheduled for today at 18:00 MSK
  const today = new Date();
  const drawTime = new Date(today);
  drawTime.setHours(18, 0, 0, 0);
  
  // If it's already past 18:00 today, schedule for tomorrow
  if (today.getHours() >= 18) {
    drawTime.setDate(drawTime.getDate() + 1);
  }

  const firstDraw = await prisma.draw.upsert({
    where: {
      lotteryId_drawNumber: {
        lotteryId: weekendSpecial.id,
        drawNumber: 1
      }
    },
    update: {},
    create: {
      lotteryId: weekendSpecial.id,
      drawNumber: 1,
      scheduledAt: drawTime,
      winningNumbers: [],
      status: 'scheduled',
      seedHash: null,
      seed: null,
      totalTickets: 0,
      totalPrizePool: 0,
      totalWinners: 0,
      totalPaid: 0
    }
  });

  console.log('✅ Created first draw:', {
    drawNumber: firstDraw.drawNumber,
    scheduledAt: firstDraw.scheduledAt.toISOString(),
    status: firstDraw.status
  });

  console.log('\n🎉 Database seeded successfully!');
  console.log('\n📊 Summary:');
  console.log('- 1 Lottery created (Weekend Special)');
  console.log('- 1 Fund initialized');
  console.log('- 1 Payout config created');
  console.log('- 1 Draw schedule created');
  console.log('- 1 Draw scheduled');
  console.log(`- Next draw: ${firstDraw.scheduledAt.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} MSK`);

  // Seed gamification data
  console.log('\n🌱 Seeding gamification data...');
  await seedGamification();
}

async function seedGamification() {
  // ====================
  // DAILY TASKS (7 tasks)
  // ====================
  
  await prisma.dailyTask.upsert({
    where: { taskId: 'daily_login' },
    update: {},
    create: {
      taskId: 'daily_login',
      name: '🔥 Ежедневный вход',
      nameEn: '🔥 Daily Login',
      type: 'LOGIN',
      target: 1,
      rewardXp: 5,
      rewardTon: 0,
      sortOrder: 1,
    },
  });

  await prisma.dailyTask.upsert({
    where: { taskId: 'buy_1_ticket' },
    update: {},
    create: {
      taskId: 'buy_1_ticket',
      name: '🎫 Купить билет',
      nameEn: '🎫 Buy a Ticket',
      type: 'BUY_TICKETS',
      target: 1,
      rewardXp: 10,
      rewardTon: 0,
      sortOrder: 2,
    },
  });

  await prisma.dailyTask.upsert({
    where: { taskId: 'buy_3_tickets' },
    update: {},
    create: {
      taskId: 'buy_3_tickets',
      name: '🎫 Купить 3 билета',
      nameEn: '🎫 Buy 3 Tickets',
      type: 'BUY_TICKETS',
      target: 3,
      rewardXp: 20,
      rewardTon: 0,
      sortOrder: 3,
    },
  });

  await prisma.dailyTask.upsert({
    where: { taskId: 'buy_5_tickets' },
    update: {},
    create: {
      taskId: 'buy_5_tickets',
      name: '🎫 Купить 5 билетов',
      nameEn: '🎫 Buy 5 Tickets',
      type: 'BUY_TICKETS',
      target: 5,
      rewardXp: 30,
      rewardTon: 0.05,
      sortOrder: 4,
    },
  });

  await prisma.dailyTask.upsert({
    where: { taskId: 'invite_friend' },
    update: {},
    create: {
      taskId: 'invite_friend',
      name: '👥 Пригласить друга',
      nameEn: '👥 Invite a Friend',
      type: 'REFERRAL',
      target: 1,
      rewardXp: 30,
      rewardTon: 0.1,
      sortOrder: 5,
    },
  });

  await prisma.dailyTask.upsert({
    where: { taskId: 'check_results' },
    update: {},
    create: {
      taskId: 'check_results',
      name: '🏆 Проверить результаты',
      nameEn: '🏆 Check Results',
      type: 'CHECK_RESULTS',
      target: 1,
      rewardXp: 3,
      rewardTon: 0,
      sortOrder: 6,
    },
  });

  await prisma.dailyTask.upsert({
    where: { taskId: 'streak_7_days' },
    update: {},
    create: {
      taskId: 'streak_7_days',
      name: '🔄 7 дней подряд',
      nameEn: '🔄 7-Day Streak',
      type: 'STREAK',
      target: 7,
      rewardXp: 50,
      rewardTon: 0,
      sortOrder: 7,
    },
  });

  console.log('✅ Created 7 daily tasks');

  // Note: Achievements seeding can be done by running seed-gamification.ts separately
  // or add the full achievement seeding here if needed
  
  console.log('✅ Gamification data seeded');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
