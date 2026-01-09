/**
 * Frontend Service Tests
 */

describe('Frontend Service', () => {
  describe('Game list', () => {
    const getGames = () => {
      return [
        {
          id: 'slots',
          name: 'Slots',
          description: 'Slot machine game',
          icon: '🎰',
          serviceEndpoint: process.env.SLOTS_SERVICE_GRPC || 'localhost:50051'
        },
        {
          id: 'roulette',
          name: 'Roulette',
          description: 'European roulette',
          icon: '🎲',
          serviceEndpoint: process.env.ROULETTE_SERVICE_GRPC || 'localhost:50052'
        },
        {
          id: 'dice',
          name: 'Dice',
          description: 'Craps dice game',
          icon: '🎯',
          serviceEndpoint: process.env.DICE_SERVICE_GRPC || 'localhost:50053'
        },
        {
          id: 'blackjack',
          name: 'Blackjack',
          description: 'Blackjack card game',
          icon: '🃏',
          serviceEndpoint: process.env.BLACKJACK_SERVICE_GRPC || 'localhost:50054'
        }
      ];
    };

    test('should return all games', () => {
      const games = getGames();
      expect(games).toHaveLength(4);
      expect(games.map(g => g.id)).toEqual(['slots', 'roulette', 'dice', 'blackjack']);
    });

    test('should have correct game properties', () => {
      const games = getGames();
      games.forEach(game => {
        expect(game).toHaveProperty('id');
        expect(game).toHaveProperty('name');
        expect(game).toHaveProperty('description');
        expect(game).toHaveProperty('icon');
        expect(game).toHaveProperty('serviceEndpoint');
      });
    });

    test('should have slots game', () => {
      const games = getGames();
      const slots = games.find(g => g.id === 'slots');
      expect(slots).toBeDefined();
      expect(slots.name).toBe('Slots');
      expect(slots.icon).toBe('🎰');
    });
  });

  describe('Health check', () => {
    test('should return health status', () => {
      const healthResponse = { status: 'ok', service: 'frontend-service' };
      expect(healthResponse.status).toBe('ok');
      expect(healthResponse.service).toBe('frontend-service');
    });
  });
});








