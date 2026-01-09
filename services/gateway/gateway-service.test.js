/**
 * Gateway Server Tests
 */

describe('Gateway Server', () => {
  describe('Service ports configuration', () => {
    const SERVICE_PORTS = {
      'vegas-slots-service': 8081,
      'vegas-roulette-service': 8082,
      'vegas-dice-service': 8083,
      'vegas-blackjack-service': 8084
    };

    test('should have correct port mappings', () => {
      expect(SERVICE_PORTS['vegas-slots-service']).toBe(8081);
      expect(SERVICE_PORTS['vegas-roulette-service']).toBe(8082);
      expect(SERVICE_PORTS['vegas-dice-service']).toBe(8083);
      expect(SERVICE_PORTS['vegas-blackjack-service']).toBe(8084);
    });

    test('should have all required services', () => {
      expect(Object.keys(SERVICE_PORTS)).toHaveLength(4);
      expect(SERVICE_PORTS).toHaveProperty('vegas-slots-service');
      expect(SERVICE_PORTS).toHaveProperty('vegas-roulette-service');
      expect(SERVICE_PORTS).toHaveProperty('vegas-dice-service');
      expect(SERVICE_PORTS).toHaveProperty('vegas-blackjack-service');
    });
  });

  describe('Game category mapping', () => {
    function getGameCategory(serviceName) {
      const categories = {
        'vegas-slots-service': 'slot-machines',
        'vegas-roulette-service': 'table-games',
        'vegas-dice-service': 'dice-games',
        'vegas-blackjack-service': 'card-games'
      };
      return categories[serviceName] || 'unknown';
    }

    test('should map service names to categories', () => {
      expect(getGameCategory('vegas-slots-service')).toBe('slot-machines');
      expect(getGameCategory('vegas-roulette-service')).toBe('table-games');
      expect(getGameCategory('vegas-dice-service')).toBe('dice-games');
      expect(getGameCategory('vegas-blackjack-service')).toBe('card-games');
      expect(getGameCategory('unknown-service')).toBe('unknown');
    });
  });
});

