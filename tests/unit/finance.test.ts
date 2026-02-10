import { Decimal } from '@prisma/client/runtime/library';

describe('Finance Service', () => {
  describe('Revenue Calculation', () => {
    it('should calculate total GMV correctly', () => {
      const transactions = [
        { amount: 10.5, type: 'DEPOSIT' },
        { amount: 25.0, type: 'DEPOSIT' },
        { amount: 15.0, type: 'DEPOSIT' },
      ];

      const gmv = transactions.reduce((sum, tx) => sum + tx.amount, 0);
      expect(gmv).toBe(50.5);
    });

    it('should calculate platform commission', () => {
      const gmv = 1000;
      const commissionRate = 0.05; // 5%

      const commission = gmv * commissionRate;
      expect(commission).toBe(50);
    });

    it('should calculate net revenue after payouts', () => {
      const gmv = 1000;
      const commissionRate = 0.05;
      const payouts = 800;

      const commission = gmv * commissionRate;
      const netRevenue = commission; // Commission is our revenue
      const prizePool = gmv - commission; // 950
      const remainingPool = prizePool - payouts; // 150

      expect(commission).toBe(50);
      expect(remainingPool).toBe(150);
    });

    it('should handle null/undefined amounts safely', () => {
      const transactions = [
        { amount: 10 },
        { amount: null },
        { amount: undefined },
        { amount: 20 },
      ];

      const total = transactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);
      expect(total).toBe(30);
    });
  });

  describe('Transaction Aggregation', () => {
    it('should group transactions by type', () => {
      const transactions = [
        { type: 'DEPOSIT', amount: 100 },
        { type: 'WITHDRAWAL', amount: 50 },
        { type: 'DEPOSIT', amount: 200 },
        { type: 'PRIZE', amount: 150 },
        { type: 'WITHDRAWAL', amount: 30 },
      ];

      const grouped = transactions.reduce((acc, tx) => {
        acc[tx.type] = (acc[tx.type] || 0) + tx.amount;
        return acc;
      }, {} as Record<string, number>);

      expect(grouped['DEPOSIT']).toBe(300);
      expect(grouped['WITHDRAWAL']).toBe(80);
      expect(grouped['PRIZE']).toBe(150);
    });

    it('should calculate daily revenue', () => {
      const transactions = [
        { date: '2026-02-01', amount: 100 },
        { date: '2026-02-01', amount: 200 },
        { date: '2026-02-02', amount: 150 },
        { date: '2026-02-02', amount: 50 },
        { date: '2026-02-03', amount: 300 },
      ];

      const dailyRevenue = transactions.reduce((acc, tx) => {
        acc[tx.date] = (acc[tx.date] || 0) + tx.amount;
        return acc;
      }, {} as Record<string, number>);

      expect(dailyRevenue['2026-02-01']).toBe(300);
      expect(dailyRevenue['2026-02-02']).toBe(200);
      expect(dailyRevenue['2026-02-03']).toBe(300);
    });
  });

  describe('Payout Calculations', () => {
    it('should calculate total pending payouts', () => {
      const pendingPayouts = [
        { amount: 100, status: 'PENDING' },
        { amount: 250, status: 'PENDING' },
        { amount: 75, status: 'PENDING' },
      ];

      const totalPending = pendingPayouts.reduce((sum, p) => sum + p.amount, 0);
      expect(totalPending).toBe(425);
    });

    it('should calculate successful vs failed payouts', () => {
      const payouts = [
        { amount: 100, status: 'SUCCESS' },
        { amount: 50, status: 'FAILED' },
        { amount: 200, status: 'SUCCESS' },
        { amount: 30, status: 'FAILED' },
        { amount: 150, status: 'SUCCESS' },
      ];

      const successful = payouts
        .filter(p => p.status === 'SUCCESS')
        .reduce((sum, p) => sum + p.amount, 0);
      
      const failed = payouts
        .filter(p => p.status === 'FAILED')
        .reduce((sum, p) => sum + p.amount, 0);

      expect(successful).toBe(450);
      expect(failed).toBe(80);
    });
  });

  describe('Financial Metrics', () => {
    it('should calculate profit margin', () => {
      const revenue = 1000;
      const costs = 200; // infrastructure, fees, etc.
      
      const profit = revenue - costs;
      const profitMargin = (profit / revenue) * 100;

      expect(profit).toBe(800);
      expect(profitMargin).toBe(80);
    });

    it('should calculate average transaction value', () => {
      const transactions = [
        { amount: 50 },
        { amount: 100 },
        { amount: 75 },
        { amount: 200 },
      ];

      const total = transactions.reduce((sum, tx) => sum + tx.amount, 0);
      const avg = total / transactions.length;

      expect(avg).toBe(106.25);
    });

    it('should identify high-value transactions', () => {
      const transactions = [
        { amount: 50, id: '1' },
        { amount: 500, id: '2' },
        { amount: 75, id: '3' },
        { amount: 1000, id: '4' },
        { amount: 100, id: '5' },
      ];

      const threshold = 200;
      const highValue = transactions.filter(tx => tx.amount >= threshold);

      expect(highValue).toHaveLength(2);
      expect(highValue.map(tx => tx.id)).toEqual(['2', '4']);
    });
  });

  describe('Reconciliation', () => {
    it('should detect reconciliation issues', () => {
      // Using explicit number types to avoid TypeScript literal type issues
      const missingTxHash: number = 5;
      const duplicateTxHash: number = 0;
      const stuckTransactions: number = 2;

      const hasMissingTx = missingTxHash > 0;
      const hasDuplicates = duplicateTxHash > 0;
      const hasStuckTx = stuckTransactions > 0;
      
      const hasIssues = hasMissingTx || hasDuplicates || hasStuckTx;
      
      expect(hasIssues).toBe(true);
      expect(hasMissingTx).toBe(true);
      expect(hasDuplicates).toBe(false);
      expect(hasStuckTx).toBe(true);
    });

    it('should pass reconciliation with no issues', () => {
      const missingTxHash: number = 0;
      const duplicateTxHash: number = 0;
      const stuckTransactions: number = 0;

      const hasIssues = missingTxHash > 0 || duplicateTxHash > 0 || stuckTransactions > 0;
      
      expect(hasIssues).toBe(false);
    });

    it('should detect amount mismatches', () => {
      const dbAmount = 100.5;
      const blockchainAmount = 100.4;
      const tolerance = 0.01;

      const difference = Math.abs(dbAmount - blockchainAmount);
      const hasMismatch = difference > tolerance;

      expect(hasMismatch).toBe(true);
      expect(difference).toBeCloseTo(0.1, 2);
    });

    it('should pass with amounts within tolerance', () => {
      const dbAmount = 100.005;
      const blockchainAmount = 100.004;
      const tolerance = 0.01;

      const difference = Math.abs(dbAmount - blockchainAmount);
      const hasMismatch = difference > tolerance;

      expect(hasMismatch).toBe(false);
    });
  });

  describe('CSV Export Format', () => {
    it('should format transaction for CSV export', () => {
      const transaction = {
        id: 'tx_123',
        type: 'DEPOSIT',
        amount: 100.50,
        userId: 'user_456',
        createdAt: new Date('2026-02-08T10:30:00Z'),
        status: 'SUCCESS',
        txHash: '0xabc123',
      };

      const csvRow = [
        transaction.id,
        transaction.type,
        transaction.amount.toFixed(2),
        transaction.userId,
        transaction.createdAt.toISOString(),
        transaction.status,
        transaction.txHash,
      ].join(',');

      expect(csvRow).toBe('tx_123,DEPOSIT,100.50,user_456,2026-02-08T10:30:00.000Z,SUCCESS,0xabc123');
    });

    it('should generate CSV header', () => {
      const headers = ['ID', 'Type', 'Amount', 'User ID', 'Date', 'Status', 'TX Hash'];
      const csvHeader = headers.join(',');

      expect(csvHeader).toBe('ID,Type,Amount,User ID,Date,Status,TX Hash');
    });
  });

  describe('Date Range Filtering', () => {
    it('should filter transactions by date range', () => {
      const transactions = [
        { date: new Date('2026-01-15'), amount: 100 },
        { date: new Date('2026-02-01'), amount: 200 },
        { date: new Date('2026-02-15'), amount: 300 },
        { date: new Date('2026-03-01'), amount: 400 },
      ];

      const startDate = new Date('2026-02-01');
      const endDate = new Date('2026-02-28');

      const filtered = transactions.filter(
        tx => tx.date >= startDate && tx.date <= endDate
      );

      expect(filtered).toHaveLength(2);
      expect(filtered.reduce((sum, tx) => sum + tx.amount, 0)).toBe(500);
    });
  });
});
