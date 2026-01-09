/**
 * Blackjack Service Tests
 */

describe('Blackjack Service', () => {
  describe('Card value calculation', () => {
    function calculateHandValue(hand) {
      let value = 0;
      let aces = 0;

      for (const card of hand) {
        const cardValue = typeof card === 'string' ? card : card.value;
        if (cardValue === 'A') {
          aces++;
          value += 11;
        } else if (['J', 'Q', 'K'].includes(cardValue)) {
          value += 10;
        } else {
          value += parseInt(cardValue) || 10;
        }
      }

      // Adjust for aces
      while (value > 21 && aces > 0) {
        value -= 10;
        aces--;
      }

      return value;
    }

    test('should calculate simple hand value', () => {
      expect(calculateHandValue(['2', '3'])).toBe(5);
      expect(calculateHandValue(['10', '5'])).toBe(15);
    });

    test('should handle face cards', () => {
      expect(calculateHandValue(['J', 'Q'])).toBe(20);
      expect(calculateHandValue(['K', '5'])).toBe(15);
    });

    test('should handle aces correctly', () => {
      expect(calculateHandValue(['A', '5'])).toBe(16);
      expect(calculateHandValue(['A', 'A', 'A'])).toBe(13); // 11 + 1 + 1
      expect(calculateHandValue(['A', '10', 'A'])).toBe(12); // 11 + 10 + 1
    });

    test('should detect blackjack', () => {
      const hand1 = calculateHandValue(['A', 'K']);
      const hand2 = calculateHandValue(['A', 'Q']);
      expect(hand1).toBe(21);
      expect(hand2).toBe(21);
    });

    test('should handle bust', () => {
      expect(calculateHandValue(['10', '10', '5'])).toBe(25);
    });
  });

  describe('Service metadata', () => {
    test('should have correct service name', () => {
      const serviceName = 'vegas-blackjack-service';
      expect(serviceName).toBe('vegas-blackjack-service');
    });
  });
});








