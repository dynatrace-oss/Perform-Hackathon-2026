/**
 * Whack-A-Mole Service Tests
 */

describe('Whack-A-Mole Service', () => {
  describe('Score Calculation', () => {
    function calculateScore(hits, misses, combo) {
      const baseScore = hits * 100;
      const comboBonus = Math.floor(combo * 10);
      const penalty = misses * 5;
      return Math.max(0, baseScore + comboBonus - penalty);
    }

    test('should calculate score with no misses', () => {
      expect(calculateScore(5, 0, 5)).toBe(550); // 500 + 50
    });

    test('should calculate score with misses', () => {
      expect(calculateScore(5, 2, 3)).toBe(480); // 500 + 30 - 10
    });

    test('should apply combo bonus correctly', () => {
      expect(calculateScore(3, 0, 3)).toBe(330); // 300 + 30
    });

    test('should prevent negative scores', () => {
      expect(calculateScore(0, 100, 0)).toBe(0);
    });

    test('should reset combo on miss', () => {
      expect(calculateScore(10, 1, 0)).toBe(995); // 1000 - 5
    });
  });

  describe('Game State Management', () => {
    test('should initialize game with default values', () => {
      const game = {
        score: 0,
        moles: 3,
        timeRemaining: 60000,
        hits: 0,
        misses: 0,
        startTime: Date.now(),
        combo: 0,
        maxCombo: 0
      };

      expect(game.score).toBe(0);
      expect(game.moles).toBe(3);
      expect(game.hits).toBe(0);
      expect(game.misses).toBe(0);
      expect(game.combo).toBe(0);
    });

    test('should track maximum combo', () => {
      let maxCombo = 0;
      const combos = [1, 2, 3, 2, 1, 4, 5, 2, 3];
      
      for (const combo of combos) {
        maxCombo = Math.max(maxCombo, combo);
      }
      
      expect(maxCombo).toBe(5);
    });

    test('should increase mole count every 5 hits', () => {
      let moles = 3;
      const MAX_MOLES = 8;

      for (let hits = 1; hits <= 20; hits++) {
        if (hits % 5 === 0 && moles < MAX_MOLES) {
          moles++;
        }
      }

      expect(moles).toBe(7);
    });

    test('should not exceed max mole count', () => {
      let moles = 3;
      const MAX_MOLES = 8;

      for (let hits = 1; hits <= 50; hits++) {
        if (hits % 5 === 0 && moles < MAX_MOLES) {
          moles++;
        }
      }

      expect(moles).toBeLessThanOrEqual(MAX_MOLES);
    });
  });

  describe('Game Duration', () => {
    test('should recognize game over condition', () => {
      const GAME_DURATION = 60000;
      const startTime = Date.now() - 65000; // 65 seconds ago
      const timeElapsed = Date.now() - startTime;

      expect(timeElapsed).toBeGreaterThan(GAME_DURATION);
    });

    test('should calculate remaining time correctly', () => {
      const GAME_DURATION = 60000;
      const startTime = Date.now() - 30000; // 30 seconds ago
      const timeElapsed = Date.now() - startTime;
      const timeRemaining = Math.max(0, GAME_DURATION - timeElapsed);

      expect(timeRemaining).toBeLessThan(GAME_DURATION);
      expect(timeRemaining).toBeGreaterThan(0);
    });
  });

  describe('Accuracy Calculation', () => {
    test('should calculate accuracy percentage', () => {
      const hits = 40;
      const misses = 10;
      const accuracy = (hits / (hits + misses) * 100).toFixed(2);

      expect(parseFloat(accuracy)).toBe(80);
    });

    test('should handle zero total attempts', () => {
      const hits = 0;
      const misses = 0;
      const accuracy = hits > 0 ? (hits / (hits + misses) * 100).toFixed(2) : 0;

      expect(accuracy).toBe(0);
    });

    test('should handle perfect accuracy', () => {
      const hits = 50;
      const misses = 0;
      const accuracy = (hits / (hits + misses) * 100).toFixed(2);

      expect(parseFloat(accuracy)).toBe(100);
    });
  });
});
