/**
 * Seed Fund Models
 * Seeds lottery fund configurations for Weekend Special TON and USDT
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface LotteryConfig {
  lottery: {
    slug: string;
    name: string;
    description: string;
    ticketPrice: number;
    currency: string;
    numbersCount: number;
    numbersMax: number;
    numbersMin?: number;
    isActive?: boolean;
    featured?: boolean;
  };
  fund: {
    currency: string;
    totalCollected: number;
    prizePool: number;
    jackpotPool: number;
    payoutPool: number;
    platformPool: number;
    reservePool: number;
  };
  payoutConfig: {
    platformShare: number;
    prizeShare: number;
    reserveShare: number;
    incomeShare: number;
    jackpotShare: number;
    payoutShare: number;
    match4Share: number;
    match3Share: number;
    match2Share: number;
    match1Fixed: number;
  };
  drawSchedule: {
    scheduleType: string;
    enabled: boolean;
    timezone: string;
  };
}

async function seedLotteryFunds() {
  console.log('🌱 Starting lottery fund seed...');

  // Weekend Special TON Configuration
  const weekendSpecialTonConfig: LotteryConfig = {
    lottery: {
      slug: 'weekend-special-ton',
      name: 'Weekend Special TON',
      description: 'Еженедельная лотерея в TON',
      ticketPrice: 1.0,
      currency: 'TON',
      numbersCount: 5,
      numbersMax: 36,
      numbersMin: 1,
      isActive: true,
      featured: true,
    },
    fund: {
      currency: 'TON',
      totalCollected: 0,
      prizePool: 0,
      jackpotPool: 0,
      payoutPool: 0,
      platformPool: 0,
      reservePool: 0,
    },
    payoutConfig: {
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
    drawSchedule: {
      scheduleType: 'manual',
      enabled: false,
      timezone: 'Europe/Moscow',
    },
  };

  // Weekend Special USDT Configuration
  const weekendSpecialUsdtConfig: LotteryConfig = {
    lottery: {
      slug: 'weekend-special-usdt',
      name: 'Weekend Special USDT',
      description: 'Еженедельная лотерея в USDT',
      ticketPrice: 1.0,
      currency: 'USDT',
      numbersCount: 5,
      numbersMax: 36,
      numbersMin: 1,
      isActive: true,
      featured: false,
    },
    fund: {
      currency: 'USDT',
      totalCollected: 0,
      prizePool: 0,
      jackpotPool: 0,
      payoutPool: 0,
      platformPool: 0,
      reservePool: 0,
    },
    payoutConfig: {
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
    drawSchedule: {
      scheduleType: 'manual',
      enabled: false,
      timezone: 'Europe/Moscow',
    },
  };

  // Seed both configurations
  const configs = [weekendSpecialTonConfig, weekendSpecialUsdtConfig];

  for (const config of configs) {
    console.log(`\n📝 Creating ${config.lottery.name}...`);

    // Create or update lottery
    const lottery = await prisma.lottery.upsert({
      where: { slug: config.lottery.slug },
      update: {},
      create: {
        slug: config.lottery.slug,
        name: config.lottery.name,
        description: config.lottery.description,
        numbersCount: config.lottery.numbersCount,
        numbersMax: config.lottery.numbersMax,
        ticketPrice: config.lottery.ticketPrice,
        ticketPriceNano: (config.lottery.ticketPrice * 1e9).toString(),
        jackpot: 500.0,
        drawTime: '18:00',
        drawTimezone: 'Europe/Moscow',
        active: config.lottery.isActive ?? true,
        featured: config.lottery.featured ?? false,
        currency: config.lottery.currency,
        prizeStructure: {
          '5': 500,
          '4': 50,
          '3': 5,
          '2': 0.5,
          '1': 'free_ticket',
        },
      },
    });

    console.log(`  ✅ Lottery created: ${lottery.name}`);

    // Create fund
    const fund = await prisma.lotteryFund.upsert({
      where: {
        lotteryId_currency: {
          lotteryId: lottery.id,
          currency: config.fund.currency,
        },
      },
      update: {},
      create: {
        lotteryId: lottery.id,
        currency: config.fund.currency,
        totalCollected: config.fund.totalCollected,
        prizePool: config.fund.prizePool,
        jackpotPool: config.fund.jackpotPool,
        payoutPool: config.fund.payoutPool,
        platformPool: config.fund.platformPool,
        reservePool: config.fund.reservePool,
      },
    });

    console.log(`  ✅ Fund created: ${fund.currency}`);

    // Create payout config
    const payoutConfig = await prisma.lotteryPayoutConfig.upsert({
      where: { lotteryId: lottery.id },
      update: {},
      create: {
        lotteryId: lottery.id,
        platformShare: config.payoutConfig.platformShare,
        prizeShare: config.payoutConfig.prizeShare,
        reserveShare: config.payoutConfig.reserveShare,
        incomeShare: config.payoutConfig.incomeShare,
        jackpotShare: config.payoutConfig.jackpotShare,
        payoutShare: config.payoutConfig.payoutShare,
        match5Share: 0, // Jackpot handled separately
        match4Share: config.payoutConfig.match4Share,
        match3Share: config.payoutConfig.match3Share,
        match2Share: config.payoutConfig.match2Share,
        match1Fixed: config.payoutConfig.match1Fixed,
      },
    });

    console.log('  ✅ Payout config created');

    // Create draw schedule
    const drawSchedule = await prisma.drawSchedule.upsert({
      where: { lotteryId: lottery.id },
      update: {},
      create: {
        lotteryId: lottery.id,
        scheduleType: config.drawSchedule.scheduleType,
        enabled: config.drawSchedule.enabled,
        timezone: config.drawSchedule.timezone,
      },
    });

    console.log('  ✅ Draw schedule created');
  }

  console.log('\n🎉 Lottery fund seed completed successfully!');
  console.log('\n📊 Summary:');
  console.log('- 2 Lotteries created (Weekend Special TON & USDT)');
  console.log('- 2 Funds initialized');
  console.log('- 2 Payout configs created');
  console.log('- 2 Draw schedules created');
}

async function main() {
  await seedLotteryFunds();
}

main()
  .catch((e) => {
    console.error('❌ Error seeding lottery funds:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
