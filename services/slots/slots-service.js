const { createService } = require('./common/service-runner');
const express = require('express');
const { trace } = require('@opentelemetry/api');

// Comprehensive Dynatrace Metadata for Slots Service
const slotsMetadata = {
  version: '2.1.0',
  environment: 'vegas-casino-production',
  gameType: 'slots-machine',
  complexity: 'high',
  rtp: '96.5%',
  owner: 'Gaming-Backend-Team',
  technology: 'Node.js-Express-Slots',
  features: ['progressive-jackpot', 'bonus-rounds', 'cheat-detection', 'real-time-metrics'],
  maxPayout: '100x',
  volatility: 'medium-high',
  paylines: '243-ways',
  symbols: 14,
  specialFeatures: ['quantum-jackpot', 'smartscape-mastery', 'cheat-system']
};

createService(process.env.SERVICE_NAME || 'vegas-slots-service', (app) => {
  app.post('/spin', (req, res) => {
    const tracer = trace.getTracer('vegas-slots-service');
    const span = tracer.startSpan('slots_spin');
    
    // Add game attributes to span
    span.setAttributes({
      'game.action': 'spin',
      'game.bet_amount': req.body.BetAmount || 10,
      'game.cheat_active': req.body.CheatActive || false,
    });
    
    if (req.body.CheatType) {
      span.setAttribute('game.cheat_type', req.body.CheatType);
    }
    
    console.log('🎰 SPIN REQUEST RECEIVED:', {
      timestamp: new Date().toISOString(),
      body: req.body,
      headers: req.headers['content-type']
    });
    
    const p = req.body || {};
    const betAmount = p.BetAmount || 10;
    const icons = ['dynatrace','smartscape','application','database','server','cloud','shield'];
    
    // Simplified Payout Matrix - EXACTLY Matches Frontend (6 Symbols + Dynatrace Special)
    const payoutMatrix = {
      // Triple Matches - ALL 10x Bet Amount (6 Symbols)
      triple: {
        'smartscape': 10,    // All triples = 10x
        'application': 10,   // All triples = 10x
        'database': 10,      // All triples = 10x
        'server': 10,        // All triples = 10x
        'cloud': 10,         // All triples = 10x
        'shield': 10         // All triples = 10x (Security)
      },
      // Double Matches - ALL 5x Bet Amount (6 Symbols)
      double: {
        'smartscape': 5,     // All doubles = 5x
        'application': 5,    // All doubles = 5x
        'database': 5,       // All doubles = 5x
        'server': 5,         // All doubles = 5x
        'cloud': 5,          // All doubles = 5x
        'shield': 5          // All doubles = 5x (Security)
      },
      // Special Combinations - Only one special: Three Dynatrace logos
      special: {
        'dynatrace,dynatrace,dynatrace': 50   // DYNATRACE JACKPOT! (three logos = 50x)
      }
    };
    
    // Check if cheating is active
    const cheatActive = p.CheatActive === true;
    const cheatType = p.CheatType;
    
    let result = Array.from({ length: 3 }, () => icons[Math.floor(Math.random()*icons.length)]);
    
    // Apply cheat logic with more realistic special combo chances
    if (cheatActive && Math.random() < 0.5) {
      // Force a winning combination based on cheat type
      const megaSymbols = ['dynatrace', 'smartscape', 'application']; // Ultra rare
      const premiumSymbols = ['database', 'server', 'cloud'];         // Rare
      const standardSymbols = ['shield'];                              // Common (Security)
      
      if (cheatType === 'backdoor' && Math.random() < 0.05) {
        // Backdoor has 5% chance for mega special combo
        const megaCombos = [
          ['smartscape', 'application'],  // FULL-STACK OBSERVABILITY!
          ['database', 'shield']          // SECURE DATA PIPELINE!
        ];
        result = megaCombos[Math.floor(Math.random() * megaCombos.length)];
      } else if ((cheatType === 'timing' || cheatType === 'backdoor') && Math.random() < 0.15) {
        // Premium cheats have 15% chance for mega symbols triple
        const winIcon = megaSymbols[Math.floor(Math.random() * megaSymbols.length)];
        result = [winIcon, winIcon, winIcon];
      } else if (Math.random() < 0.3) {
        // 30% chance for premium triple when cheating
        const winIcon = Math.random() < 0.4 ? 
          megaSymbols[Math.floor(Math.random() * megaSymbols.length)] :
          premiumSymbols[Math.floor(Math.random() * premiumSymbols.length)];
        result = [winIcon, winIcon, winIcon];
      } else {
        // Double match with bias toward higher value symbols
        const winIcon = Math.random() < 0.6 ? 
          [...megaSymbols, ...premiumSymbols][Math.floor(Math.random() * 6)] :
          standardSymbols[0]; // Only 'shield' in standardSymbols now
        result[0] = winIcon;
        result[1] = winIcon;
        // Leave third as random for double
      }
    }
    
    // Calculate enhanced payouts
    let winAmount = 0;
    let multiplier = 0;
    let winType = '';
    let description = '';
    
    // Check for special combinations first
    const sortedResult = result.slice().sort().join(',');
    if (payoutMatrix.special[sortedResult]) {
      multiplier = payoutMatrix.special[sortedResult];
      winAmount = betAmount * multiplier;
      winType = 'special';
      description = getSpecialComboName(sortedResult);
    } else {
      // Check for matches
      const counts = result.reduce((m, s) => (m[s]=(m[s]||0)+1, m), {});
      
      // Triple match
      const tripleIcon = Object.keys(counts).find(icon => counts[icon] === 3);
      if (tripleIcon && payoutMatrix.triple[tripleIcon]) {
        multiplier = payoutMatrix.triple[tripleIcon];
        winAmount = betAmount * multiplier;
        winType = 'triple';
        description = getTripleName(tripleIcon);
      } else {
        // Double match
        const doubleIcon = Object.keys(counts).find(icon => counts[icon] === 2);
        if (doubleIcon && payoutMatrix.double[doubleIcon]) {
          multiplier = payoutMatrix.double[doubleIcon];
          winAmount = betAmount * multiplier;
          winType = 'double';
          description = getDoubleName(doubleIcon);
        }
      }
    }
    
    const win = winAmount > 0;
    
    // Add cheat metadata to response
    const response = { 
      result, 
      win, 
      winAmount, 
      betAmount, 
      multiplier: multiplier, 
      winType,
      description,
      timestamp: new Date().toISOString(),
      cheatActive: cheatActive,
      cheatType: cheatType,
      cheatBoosted: cheatActive && win
    };
    
    // Add result attributes to span
    span.setAttributes({
      'game.win': win,
      'game.win_amount': winAmount,
      'game.multiplier': multiplier,
      'game.win_type': winType,
    });
    
    console.log('🎰 SPIN RESPONSE SENT:', {
      win: win,
      winAmount: winAmount,
      result: result,
      cheatActive: cheatActive
    });
    
    span.end();
    res.json(response);
  });
  
  // Helper functions for win descriptions - aligned to UI payoutMatrix names
  function getSpecialComboName(combo) {
    const names = {
      'dynatrace,dynatrace,dynatrace': 'DYNATRACE JACKPOT!'
    };
    return names[combo] || 'SPECIAL COMBO!';
  }
  
  function getTripleName(icon) {
    const names = {
      'smartscape': 'TOPOLOGY MASTERY!',
      'application': 'APM BREAKTHROUGH!', 
      'database': 'DATA OBSERVABILITY CHAMPION!',
      'server': 'INFRASTRUCTURE MASTERY!',
      'cloud': 'CLOUD-NATIVE SUCCESS!',
      'shield': 'SECURITY OBSERVABILITY EXPERT!'
    };
    return names[icon] || 'TRIPLE WIN!';
  }
  
  function getDoubleName(icon) {
    const names = {
      'smartscape': 'Topology Discovery!',
      'application': 'APM Insight!',
      'database': 'Data Connection!',
      'server': 'Infrastructure Pair!',
      'cloud': 'Cloud Duo!',
      'shield': 'Security Alliance!'
    };
    return names[icon] || 'Double Match!';
  }
}, slotsMetadata);
