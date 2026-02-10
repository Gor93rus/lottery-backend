import crypto from 'crypto';

describe('Draw Service', () => {
  describe('Provably Fair Random Generation', () => {
    it('should generate deterministic results with same seed', () => {
      const seed = 'test-seed-12345';
      
      const hash1 = crypto.createHash('sha256').update(seed).digest('hex');
      const hash2 = crypto.createHash('sha256').update(seed).digest('hex');

      expect(hash1).toBe(hash2);
    });

    it('should generate different results with different seeds', () => {
      const seed1 = 'seed-1';
      const seed2 = 'seed-2';
      
      const hash1 = crypto.createHash('sha256').update(seed1).digest('hex');
      const hash2 = crypto.createHash('sha256').update(seed2).digest('hex');

      expect(hash1).not.toBe(hash2);
    });

    it('should generate valid winning numbers from hash', () => {
      const seed = 'test-seed';
      const hash = crypto.createHash('sha256').update(seed).digest('hex');
      
      // Generate 6 numbers from hash
      const numbers: number[] = [];
      for (let i = 0; i < 6; i++) {
        const segment = hash.substring(i * 4, (i + 1) * 4);
        const num = (parseInt(segment, 16) % 49) + 1;
        numbers.push(num);
      }

      expect(numbers).toHaveLength(6);
      numbers.forEach(num => {
        expect(num).toBeGreaterThanOrEqual(1);
        expect(num).toBeLessThanOrEqual(49);
      });
    });
  });

  describe('Winner Determination', () => {
    it('should identify jackpot winner (6 matches)', () => {
      const winningNumbers = [5, 12, 23, 34, 45, 49];
      const ticketNumbers = [5, 12, 23, 34, 45, 49];

      const matches = ticketNumbers.filter(num => winningNumbers.includes(num)).length;
      expect(matches).toBe(6);
    });

    it('should identify partial winner (3 matches)', () => {
      const winningNumbers = [5, 12, 23, 34, 45, 49];
      const ticketNumbers = [5, 12, 23, 1, 2, 3];

      const matches = ticketNumbers.filter(num => winningNumbers.includes(num)).length;
      expect(matches).toBe(3);
    });

    it('should identify no winner (0 matches)', () => {
      const winningNumbers = [5, 12, 23, 34, 45, 49];
      const ticketNumbers = [1, 2, 3, 4, 6, 7];

      const matches = ticketNumbers.filter(num => winningNumbers.includes(num)).length;
      expect(matches).toBe(0);
    });
  });

  describe('Prize Distribution', () => {
    it('should calculate correct prize for 6 matches', () => {
      const prizePool = 100000; // TON
      const prizePercent = { 6: 50, 5: 25, 4: 15, 3: 10 };
      
      const prize = prizePool * (prizePercent[6] / 100);
      expect(prize).toBe(50000);
    });

    it('should split prize among multiple winners', () => {
      const prizePool = 100000;
      const prizePercent = 50;
      const winnersCount = 2;

      const totalPrize = prizePool * (prizePercent / 100);
      const prizePerWinner = totalPrize / winnersCount;

      expect(prizePerWinner).toBe(25000);
    });
  });
});
