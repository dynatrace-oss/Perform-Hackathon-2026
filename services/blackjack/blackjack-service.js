const { createService } = require('./common/service-runner');
const { trace } = require('@opentelemetry/api');

// Comprehensive Dynatrace Metadata for Blackjack Service
const blackjackMetadata = {
  version: '2.1.0',
  environment: 'vegas-casino-production',
  gameType: 'blackjack-21',
  complexity: 'high',
  rtp: '99.5%',
  owner: 'Card-Games-Team',
  technology: 'Node.js-Express-Blackjack',
  features: ['card-counting-resistant', 'dealer-ai', 'multi-action', 'session-state'],
  maxPayout: '2.5x',
  volatility: 'low-medium',
  deckCount: 'infinite-shuffle',
  dealerRules: ['hit-soft-17', 'dealer-stands-17'],
  specialFeatures: ['natural-blackjack', 'bust-detection', 'session-persistence']
};

// In-memory game state by Username
const games = new Map(); // key: Username, value: { playerHand, dealerHand, betAmount }

function drawCard() {
  const rank = Math.floor(Math.random()*13)+1; // 1..13 (Ace..King)
  const suits = ['♥','♦','♣','♠'];
  const suit = suits[Math.floor(Math.random()*suits.length)];
  return { rank, suit };
}

function scoreHand(hand) {
  let score = 0;
  let aces = 0;
  for (const c of hand) {
    if (c.rank === 1) { aces++; score += 11; }
    else score += Math.min(c.rank, 10);
  }
  while (score > 21 && aces > 0) { score -= 10; aces--; }
  return score;
}

createService(process.env.SERVICE_NAME || 'vegas-blackjack-service', (app) => {
  app.post('/deal', (req, res) => {
    const tracer = trace.getTracer('vegas-blackjack-service');
    const span = tracer.startSpan('blackjack_deal');
    
    span.setAttributes({
      'game.action': 'deal',
      'game.bet_amount': req.body.BetAmount || 10,
    });
    const p = req.body || {};
    const betAmount = Number(p.BetAmount || 10);
    const Username = p.Username || 'Anonymous';
    const playerHand = [drawCard(), drawCard()];
    const dealerHand = [drawCard(), drawCard()];
    games.set(Username, { playerHand, dealerHand, betAmount });
    span.setAttributes({
      'game.player_score': scoreHand(playerHand),
      'game.dealer_score': scoreHand(playerHand) >= 21 ? scoreHand(dealerHand) : scoreHand([dealerHand[0]]),
    });
    span.end();
    
    res.json({
      playerHand,
      dealerHand,
      playerScore: scoreHand(playerHand),
      dealerScore: scoreHand(playerHand) >= 21 ? scoreHand(dealerHand) : scoreHand([dealerHand[0]]),
      betAmount,
      timestamp: new Date().toISOString()
    });
  });

  app.post('/hit', (req, res) => {
    const tracer = trace.getTracer('vegas-blackjack-service');
    const span = tracer.startSpan('blackjack_hit');
    
    const p = req.body || {};
    const Username = p.Username || 'Anonymous';
    const g = games.get(Username);
    if (!g) {
      span.setAttribute('http.status_code', 400);
      span.end();
      return res.status(400).json({ error: 'No active hand' });
    }
    
    const newCard = drawCard();
    g.playerHand.push(newCard);
    const playerScore = scoreHand(g.playerHand);
    const dealerScore = scoreHand([g.dealerHand[0]]);
    
    span.setAttributes({
      'game.action': 'hit',
      'game.player_score': playerScore,
      'game.dealer_score': dealerScore,
    });
    span.end();
    
    res.json({ newCard, playerScore, dealerScore, timestamp: new Date().toISOString() });
  });

  app.post('/stand', (req, res) => {
    const tracer = trace.getTracer('vegas-blackjack-service');
    const span = tracer.startSpan('blackjack_stand');
    
    const p = req.body || {};
    const Username = p.Username || 'Anonymous';
    const g = games.get(Username);
    if (!g) {
      span.setAttribute('http.status_code', 400);
      span.end();
      return res.status(400).json({ error: 'No active hand' });
    }
    
    // Reveal dealer and draw to 17+
    while (scoreHand(g.dealerHand) < 17) {
      g.dealerHand.push(drawCard());
    }
    const playerScore = scoreHand(g.playerHand);
    const dealerScore = scoreHand(g.dealerHand);
    let result = 'lose';
    if (playerScore > 21) result = 'lose';
    else if (dealerScore > 21 || playerScore > dealerScore) result = 'win';
    else if (playerScore === dealerScore) result = 'push';
    let payout = 0;
    if (result === 'win') payout = g.betAmount * 2; // return stake + win
    else if (result === 'push') payout = g.betAmount; // return stake
    
    span.setAttributes({
      'game.action': 'stand',
      'game.player_score': playerScore,
      'game.dealer_score': dealerScore,
      'game.result': result,
      'game.payout': payout,
    });
    span.end();
    
    const dealerFinalHand = g.dealerHand;
    // Clear game
    games.delete(Username);
    res.json({ dealerFinalHand, dealerScore, result, payout, timestamp: new Date().toISOString() });
  });

  app.post('/double', (req, res) => {
    const tracer = trace.getTracer('vegas-blackjack-service');
    const span = tracer.startSpan('blackjack_double');
    
    const p = req.body || {};
    const Username = p.Username || 'Anonymous';
    const g = games.get(Username);
    if (!g) {
      span.setAttribute('http.status_code', 400);
      span.end();
      return res.status(400).json({ error: 'No active hand' });
    }
    
    const newCard = drawCard();
    g.playerHand.push(newCard);
    // Indicate additional bet required equals original betAmount
    const additionalBet = g.betAmount;
    // Optionally adjust betAmount for final payout logic
    g.betAmount *= 2;
    const playerScore = scoreHand(g.playerHand);
    const dealerScore = scoreHand([g.dealerHand[0]]);
    
    span.setAttributes({
      'game.action': 'double',
      'game.additional_bet': additionalBet,
      'game.player_score': playerScore,
      'game.dealer_score': dealerScore,
    });
    span.end();
    
    res.json({ newCard, playerScore, dealerScore, additionalBet, timestamp: new Date().toISOString() });
  });
}, blackjackMetadata);
