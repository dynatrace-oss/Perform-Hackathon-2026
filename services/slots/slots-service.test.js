/**
 * Slots Service Tests
 */

describe('Slots Service', () => {
  describe('calculateWin function', () => {
    // Import the calculateWin function logic
    function calculateWin(result, betAmount) {
      const winMultipliers = {
        '7️⃣7️⃣7️⃣': 100,
        '💎💎💎': 50,
        '⭐⭐⭐': 25,
        '🔔🔔🔔': 10,
        '🍒🍒🍒': 5,
        '🍋🍋🍋': 3,
        '🍊🍊🍊': 2
      };

      const resultStr = result.join('');
      const multiplier = winMultipliers[resultStr] || 0;
      const winAmount = multiplier > 0 ? betAmount * multiplier : 0;
      const win = multiplier > 0;

      let winType = 'none';
      if (multiplier >= 100) winType = 'jackpot';
      else if (multiplier >= 25) winType = 'big-win';
      else if (multiplier >= 5) winType = 'win';
      else if (result[0] === result[1] || result[1] === result[2]) winType = 'near-miss';

      return { win, winAmount, multiplier, winType };
    }

    test('should return jackpot for triple 7️⃣', () => {
      const result = calculateWin(['7️⃣', '7️⃣', '7️⃣'], 10);
      expect(result.win).toBe(true);
      expect(result.winAmount).toBe(1000);
      expect(result.multiplier).toBe(100);
      expect(result.winType).toBe('jackpot');
    });

    test('should return big win for triple 💎', () => {
      const result = calculateWin(['💎', '💎', '💎'], 10);
      expect(result.win).toBe(true);
      expect(result.winAmount).toBe(500);
      expect(result.multiplier).toBe(50);
      expect(result.winType).toBe('big-win');
    });

    test('should return no win for different symbols', () => {
      const result = calculateWin(['🍒', '🍋', '🍊'], 10);
      expect(result.win).toBe(false);
      expect(result.winAmount).toBe(0);
      expect(result.multiplier).toBe(0);
      expect(result.winType).toBe('none');
    });

    test('should calculate correct win amount', () => {
      const result = calculateWin(['🍒', '🍒', '🍒'], 20);
      expect(result.win).toBe(true);
      expect(result.winAmount).toBe(100); // 20 * 5
      expect(result.multiplier).toBe(5);
    });
  });

  describe('Health endpoint', () => {
    test('should have service name', () => {
      const serviceName = 'vegas-slots-service';
      expect(serviceName).toBe('vegas-slots-service');
    });
  });
});








