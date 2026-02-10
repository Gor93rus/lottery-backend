@Copilot please fix the ESLint errors that are causing CI to fail:

1. **src/api/gamification/level.ts:7** - Remove unused import `getNextLevelXp` (or use it in the code)

2. **src/services/gamification/achievements.ts:231** - The variable `updatedAchievement` is assigned but never used. Either remove it or prefix with underscore: `const [_updatedAchievement, updatedUser] = ...`

3. **src/services/gamification/dailyTasks.ts:177** - The variable `updatedUserTask` is assigned but never used. Either remove it or prefix with underscore: `const [_updatedUserTask, updatedUser] = ...`

4. **src/services/ton/wallet.ts:3** - Remove unused import `TON_CONFIG`

After fixing, run `npm run lint` to ensure there are no more errors.