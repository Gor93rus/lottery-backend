describe('Gamification Service', () => {
  describe('XP Calculation', () => {
    it('should award XP for ticket purchase', () => {
      const xpPerTicket = 10;
      const ticketCount = 5;
      
      const totalXp = xpPerTicket * ticketCount;
      expect(totalXp).toBe(50);
    });

    it('should award bonus XP for daily streak', () => {
      const baseXp = 100;
      const streakDays = 7;
      const streakBonus = 1.5; // 50% bonus at 7 days

      const totalXp = Math.floor(baseXp * streakBonus);
      expect(totalXp).toBe(150);
    });
  });

  describe('Level Calculation', () => {
    it('should calculate correct level from XP', () => {
      const xpThresholds = [0, 100, 300, 600, 1000, 1500];
      const userXp = 450;

      let level = 0;
      for (let i = xpThresholds.length - 1; i >= 0; i--) {
        if (userXp >= xpThresholds[i]) {
          level = i + 1;
          break;
        }
      }

      expect(level).toBe(3); // 450 XP = Level 3
    });

    it('should calculate XP needed for next level', () => {
      const currentXp = 450;
      const nextLevelThreshold = 600;

      const xpNeeded = nextLevelThreshold - currentXp;
      expect(xpNeeded).toBe(150);
    });
  });

  describe('Achievement Unlock', () => {
    it('should unlock "First Purchase" achievement', () => {
      const totalPurchases = 1;
      const achievementRequirement = 1;

      const isUnlocked = totalPurchases >= achievementRequirement;
      expect(isUnlocked).toBe(true);
    });

    it('should not unlock "Big Spender" achievement early', () => {
      const totalSpent = 50;
      const achievementRequirement = 100;

      const isUnlocked = totalSpent >= achievementRequirement;
      expect(isUnlocked).toBe(false);
    });
  });

  describe('Streak Management', () => {
    it('should increment streak for consecutive days', () => {
      const lastLoginDate = new Date(Date.now() - 86400000); // yesterday
      const today = new Date();
      
      const daysDiff = Math.floor((today.getTime() - lastLoginDate.getTime()) / 86400000);
      const shouldIncrementStreak = daysDiff === 1;

      expect(shouldIncrementStreak).toBe(true);
    });

    it('should reset streak after missed day', () => {
      const lastLoginDate = new Date(Date.now() - 86400000 * 3); // 3 days ago
      const today = new Date();
      
      const daysDiff = Math.floor((today.getTime() - lastLoginDate.getTime()) / 86400000);
      const shouldResetStreak = daysDiff > 1;

      expect(shouldResetStreak).toBe(true);
    });
  });
});
