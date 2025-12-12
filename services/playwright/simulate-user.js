#!/usr/bin/env node

/**
 * Vegas Casino User Journey Simulator
 * Simulates a complete user journey through the casino:
 * - Enter casino with name and information
 * - Play each game (slots, roulette, dice, blackjack)
 * - Interact with buttons and place bets
 * - Enable feature flags
 * - Return to lobby between games
 * - Deposit funds between games
 * - Open dashboard and view stats per game
 */

const { chromium } = require('playwright');

// Configuration
const CASINO_URL = process.env.CASINO_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
const USER_NAME = process.env.USER_NAME || `PlaywrightUser_${Date.now()}`;
const USER_EMAIL = process.env.USER_EMAIL || `${USER_NAME.replace(/\s+/g, '')}@example.com`;
const USER_COMPANY = process.env.USER_COMPANY || 'Dynatrace';
const DELAY_BETWEEN_ACTIONS = parseInt(process.env.DELAY_BETWEEN_ACTIONS || '2000'); // 2 seconds
const DELAY_BETWEEN_GAMES = parseInt(process.env.DELAY_BETWEEN_GAMES || '5000'); // 5 seconds
const RUN_CONTINUOUSLY = process.env.RUN_CONTINUOUSLY === 'true' || process.env.RUN_CONTINUOUSLY === 'True';
const ITERATIONS = parseInt(process.env.ITERATIONS || '1');

// Validate CASINO_URL
if (!CASINO_URL || CASINO_URL.trim() === '') {
  console.error('❌ ERROR: CASINO_URL environment variable is required!');
  console.error('   Please set CASINO_URL to the frontend service URL (e.g., http://vegas-casino-frontend:3000)');
  process.exit(1);
}

// Game configurations
const GAMES = [
  { name: 'slots', path: '/slots.html', betAmount: 50, spins: 3 },
  { name: 'roulette', path: '/roulette.html', betAmount: 100, spins: 2 },
  { name: 'dice', path: '/dice.html', betAmount: 75, rolls: 3 },
  { name: 'blackjack', path: '/blackjack.html', betAmount: 80, rounds: 2 }
];

/**
 * Wait for a specified duration
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Simulate user entering the casino
 */
async function enterCasino(page) {
  console.log(`🎰 [${USER_NAME}] Entering casino...`);
  
  try {
    await page.goto(CASINO_URL);
    await page.waitForLoadState('networkidle');
    await delay(DELAY_BETWEEN_ACTIONS);

    // Fill in user information form using specific IDs from index.html
    const usernameInput = page.locator('input#usernameInput');
    if (await usernameInput.count() > 0) {
      await usernameInput.fill(USER_NAME);
      await delay(500);
    }

    const emailInput = page.locator('input#emailInput');
    if (await emailInput.count() > 0) {
      await emailInput.fill(USER_EMAIL);
      await delay(500);
    }

    const companyInput = page.locator('input#companyNameInput');
    if (await companyInput.count() > 0) {
      await companyInput.fill(USER_COMPANY);
      await delay(500);
    }

    // Click submit/enter button - look for the vault access button
    const submitButton = page.locator('button:has-text("INITIATE VAULT ACCESS"), button:has-text("Enter"), button[id*="access"], button[id*="submit"]').first();
    if (await submitButton.count() > 0) {
      await submitButton.click();
      await delay(DELAY_BETWEEN_ACTIONS * 2); // Wait for access sequence
    }

    console.log(`✅ [${USER_NAME}] Successfully entered casino`);
    return true;
  } catch (error) {
    console.error(`❌ [${USER_NAME}] Error entering casino:`, error.message);
    return false;
  }
}

/**
 * Deposit funds
 */
async function depositFunds(page) {
  console.log(`💰 [${USER_NAME}] Depositing funds...`);
  
  try {
    // Look for deposit button in various locations
    const depositButton = page.locator('button:has-text("Deposit"), button:has-text("Add Funds"), button:has-text("Top Up"), a:has-text("Deposit")').first();
    
    if (await depositButton.count() > 0) {
      await depositButton.click();
      await delay(DELAY_BETWEEN_ACTIONS);
      console.log(`✅ [${USER_NAME}] Deposited funds`);
      return true;
    } else {
      console.log(`⚠️  [${USER_NAME}] Deposit button not found, skipping...`);
      return false;
    }
  } catch (error) {
    console.error(`❌ [${USER_NAME}] Error depositing funds:`, error.message);
    return false;
  }
}

/**
 * Navigate to a game
 */
async function navigateToGame(page, game) {
  console.log(`🎮 [${USER_NAME}] Navigating to ${game.name}...`);
  
  try {
    // Try direct navigation first
    await page.goto(`${CASINO_URL}${game.path}`);
    await page.waitForLoadState('networkidle');
    await delay(DELAY_BETWEEN_ACTIONS);
    
    console.log(`✅ [${USER_NAME}] Successfully navigated to ${game.name}`);
    return true;
  } catch (error) {
    console.error(`❌ [${USER_NAME}] Error navigating to ${game.name}:`, error.message);
    return false;
  }
}

/**
 * Play slots game
 */
async function playSlots(page, game) {
  console.log(`🎰 [${USER_NAME}] Playing slots...`);
  
  try {
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');
    await delay(1000);
    
    // Set bet amount - slots uses a select dropdown
    const betSelect = page.locator('select#betAmount').first();
    if (await betSelect.count() > 0) {
      await betSelect.scrollIntoViewIfNeeded();
      await betSelect.selectOption(game.betAmount.toString());
      await delay(1000);
      console.log(`💰 [${USER_NAME}] Set bet amount to $${game.betAmount}`);
    } else {
      // Fallback to any bet input
      const betInput = page.locator('input[id*="bet"], input[name*="bet"], input[type="number"]').first();
      if (await betInput.count() > 0) {
        await betInput.fill(game.betAmount.toString());
        await delay(1000);
      }
    }

    // Enable cheats if available
    const cheatToggle = page.locator('input[type="checkbox"][id*="cheat"], label:has-text("cheat")').first();
    if (await cheatToggle.count() > 0) {
      await cheatToggle.scrollIntoViewIfNeeded();
      await cheatToggle.click();
      await delay(500);
      console.log(`🔧 [${USER_NAME}] Enabled cheats for slots`);
    }

    // Spin multiple times - slots uses #pullLever div
    for (let i = 0; i < game.spins; i++) {
      const spinButton = page.locator('div#pullLever, button:has-text("Spin"), button[id*="spin"]').first();
      if (await spinButton.count() > 0) {
        const isDisabled = await spinButton.evaluate(el => {
          return el.disabled || el.classList.contains('disabled') || el.style.pointerEvents === 'none';
        }).catch(() => false);
        
        if (!isDisabled) {
          await spinButton.scrollIntoViewIfNeeded();
          await delay(500);
          await spinButton.click({ timeout: 15000 });
          await delay(DELAY_BETWEEN_ACTIONS);
          console.log(`🎰 [${USER_NAME}] Spin ${i + 1}/${game.spins}`);
        } else {
          console.log(`⏳ [${USER_NAME}] Spin button disabled, waiting...`);
          await delay(2000);
        }
      } else {
        console.log(`⚠️ [${USER_NAME}] Spin button not found`);
        break;
      }
    }

    console.log(`✅ [${USER_NAME}] Finished playing slots`);
    return true;
  } catch (error) {
    console.error(`❌ [${USER_NAME}] Error playing slots:`, error.message);
    return false;
  }
}

/**
 * Play roulette game
 */
async function playRoulette(page, game) {
  console.log(`🎡 [${USER_NAME}] Playing roulette...`);
  
  try {
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');
    await delay(1000);
    
    // Set bet amount - roulette uses input#betAmount
    const betInput = page.locator('input#betAmount').first();
    if (await betInput.count() > 0) {
      await betInput.scrollIntoViewIfNeeded();
      await betInput.fill(game.betAmount.toString());
      await delay(1000);
      console.log(`💰 [${USER_NAME}] Set bet amount to $${game.betAmount}`);
    } else {
      // Fallback
      const fallbackInput = page.locator('input[id*="bet"], input[name*="bet"], input[type="number"]').first();
      if (await fallbackInput.count() > 0) {
        await fallbackInput.fill(game.betAmount.toString());
        await delay(1000);
      }
    }

    // Enable cheats using side panel (same as other games)
    try {
      // Open side panel by clicking the toggle button
      const toggleBtn = page.locator('button#cheatToggleBtn, button:has-text("Enable Cheats")').first();
      if (await toggleBtn.count() > 0) {
        await toggleBtn.waitFor({ state: 'visible', timeout: 5000 });
        await toggleBtn.click({ timeout: 10000 });
        await delay(1000); // Wait for panel to open
        
        // Wait for side panel to be visible
        const sidePanel = page.locator('#cheatSidePanel');
        await sidePanel.waitFor({ state: 'visible', timeout: 5000 });
        
        // Select a random cheat code button (ballControl, wheelBias, magneticField, sectorPrediction)
        const cheatButtons = [
          'button#cheatBallControl',
          'button#cheatWheelBias',
          'button#cheatMagneticField',
          'button#cheatSectorPrediction'
        ];
        
        const randomCheat = cheatButtons[Math.floor(Math.random() * cheatButtons.length)];
        const cheatButton = page.locator(randomCheat).first();
        
        if (await cheatButton.count() > 0) {
          await cheatButton.waitFor({ state: 'visible', timeout: 5000 });
          await cheatButton.click({ timeout: 10000 });
          await delay(500);
          console.log(`🔧 [${USER_NAME}] Activated cheat code for roulette`);
        }
        
        // Close side panel
        const closeBtn = page.locator('button#closeSidePanel').first();
        if (await closeBtn.count() > 0) {
          await closeBtn.click({ timeout: 5000 });
          await delay(500);
        }
      } else {
        // Fallback: try to activate cheat via JavaScript
        await page.evaluate(() => {
          if (typeof activateCheat === 'function') {
            const cheats = ['ballControl', 'wheelBias', 'magneticField', 'sectorPrediction'];
            const randomCheat = cheats[Math.floor(Math.random() * cheats.length)];
            activateCheat(randomCheat);
          }
        });
        await delay(500);
        console.log(`🔧 [${USER_NAME}] Activated cheat code for roulette (via JavaScript)`);
      }
    } catch (error) {
      console.log(`⚠️ [${USER_NAME}] Could not enable cheats for roulette: ${error.message}`);
      // Continue anyway
    }

    // Place a bet on red (or any color) - use more specific selector
    // Roulette has buttons with onclick="selectBetType('red')"
    const redButton = page.locator('button:has-text("Red"):not([id*="cheat"])').first();
    if (await redButton.count() > 0) {
      try {
        // Wait for button to be visible before interacting
        await redButton.waitFor({ state: 'visible', timeout: 10000 });
        await redButton.scrollIntoViewIfNeeded({ timeout: 5000 });
        await redButton.click({ timeout: 10000 });
        await delay(1000);
        console.log(`🎯 [${USER_NAME}] Placed bet on Red`);
      } catch (error) {
        console.log(`⚠️ [${USER_NAME}] Could not click Red button, trying alternative...`);
        // Try using selectBetType function directly via JavaScript
        try {
          await page.evaluate(() => {
            if (typeof selectBetType === 'function') {
              selectBetType('red');
            }
          });
          await delay(1000);
          console.log(`🎯 [${USER_NAME}] Placed bet on Red (via JavaScript)`);
        } catch (e) {
          console.log(`⚠️ [${USER_NAME}] Could not place bet, continuing anyway...`);
        }
      }
    } else {
      console.log(`⚠️ [${USER_NAME}] Red button not found, trying to place bet via JavaScript...`);
      try {
        await page.evaluate(() => {
          if (typeof selectBetType === 'function') {
            selectBetType('red');
          }
        });
        await delay(1000);
      } catch (e) {
        console.log(`⚠️ [${USER_NAME}] Could not place bet`);
      }
    }

    // Spin multiple times - roulette uses button#spinBtn
    for (let i = 0; i < game.spins; i++) {
      const spinButton = page.locator('button#spinBtn').first();
      if (await spinButton.count() > 0) {
        try {
          // Wait for button to be visible and enabled
          await spinButton.waitFor({ state: 'visible', timeout: 10000 });
          const isDisabled = await spinButton.isDisabled().catch(() => false);
          
          if (!isDisabled) {
            await spinButton.scrollIntoViewIfNeeded({ timeout: 5000 });
            await delay(500);
            await spinButton.click({ timeout: 15000 });
            // Wait for spin animation to complete
            await delay(DELAY_BETWEEN_ACTIONS * 2); // Longer wait for roulette spin animation
            console.log(`🎡 [${USER_NAME}] Spin ${i + 1}/${game.spins}`);
          } else {
            console.log(`⏳ [${USER_NAME}] Spin button disabled, waiting...`);
            await delay(3000); // Wait longer if button is disabled
          }
        } catch (error) {
          console.log(`⚠️ [${USER_NAME}] Error interacting with spin button: ${error.message}`);
          // Try alternative: use JavaScript to click
          try {
            await page.evaluate(() => {
              const btn = document.getElementById('spinBtn');
              if (btn && !btn.disabled) {
                btn.click();
              }
            });
            await delay(DELAY_BETWEEN_ACTIONS * 2);
            console.log(`🎡 [${USER_NAME}] Spin ${i + 1}/${game.spins} (via JavaScript)`);
          } catch (e) {
            console.log(`⚠️ [${USER_NAME}] Could not spin, breaking loop`);
            break;
          }
        }
      } else {
        console.log(`⚠️ [${USER_NAME}] Spin button not found`);
        break;
      }
    }

    console.log(`✅ [${USER_NAME}] Finished playing roulette`);
    return true;
  } catch (error) {
    console.error(`❌ [${USER_NAME}] Error playing roulette:`, error.message);
    return false;
  }
}

/**
 * Play dice game
 */
async function playDice(page, game) {
  console.log(`🎲 [${USER_NAME}] Playing dice...`);
  
  try {
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');
    await delay(1000);
    
    // Set bet amount - dice uses select#betAmount with limited options (5, 10, 25, 50)
    const betSelect = page.locator('select#betAmount').first();
    if (await betSelect.count() > 0) {
      await betSelect.scrollIntoViewIfNeeded();
      await delay(500);
      
      // Dice only supports: 5, 10, 25, 50 - find closest valid option
      const validOptions = [5, 10, 25, 50];
      let selectedBet = validOptions[0]; // Default to $5
      
      // Find the closest valid option that's <= the desired bet amount
      for (let i = validOptions.length - 1; i >= 0; i--) {
        if (validOptions[i] <= game.betAmount) {
          selectedBet = validOptions[i];
          break;
        }
      }
      
      try {
        await betSelect.selectOption(selectedBet.toString(), { timeout: 5000 });
        await delay(1000);
        console.log(`💰 [${USER_NAME}] Set bet amount to $${selectedBet} (requested: $${game.betAmount})`);
      } catch (error) {
        console.log(`⚠️ [${USER_NAME}] Could not select bet amount ${selectedBet}, trying by label...`);
        // Try selecting by visible text
        try {
          await betSelect.selectOption({ label: `$${selectedBet}` });
          await delay(1000);
        } catch (e) {
          console.log(`⚠️ [${USER_NAME}] Could not set bet amount, continuing anyway`);
        }
      }
    } else {
      // Fallback to input
      const betInput = page.locator('input[id*="bet"], input[name*="bet"], input[type="number"]').first();
      if (await betInput.count() > 0) {
        await betInput.fill(game.betAmount.toString());
        await delay(1000);
      }
    }

    // Enable cheats if available
    const cheatToggle = page.locator('input[type="checkbox"][id*="cheat"], label:has-text("cheat")').first();
    if (await cheatToggle.count() > 0) {
      await cheatToggle.scrollIntoViewIfNeeded();
      const isChecked = await cheatToggle.isChecked().catch(() => false);
      if (!isChecked) {
        await cheatToggle.click();
        await delay(500);
        console.log(`🔧 [${USER_NAME}] Enabled cheats for dice`);
      }
    }

    // Roll multiple times - dice uses button#rollButton
    // First, place a bet if not already placed
    const passLineBet = page.locator('div[data-bet="pass"]').first();
    if (await passLineBet.count() > 0) {
      await passLineBet.scrollIntoViewIfNeeded();
      await delay(500);
      await passLineBet.click();
      await delay(1000);
      console.log(`🎯 [${USER_NAME}] Placed bet on Pass Line`);
    }
    
    for (let i = 0; i < game.rolls; i++) {
      // Use a more specific selector to avoid matching cheat buttons
      // Prioritize exact ID match, then text content, avoiding any button with "cheat" in ID
      const rollButton = page.locator('button#rollButton').first();
      if (await rollButton.count() === 0) {
        // Fallback: look for button with "ROLL DICE" text that's not a cheat button
        const rollButtonAlt = page.locator('button:has-text("ROLL DICE"), button:has-text("Roll Dice")').filter({ hasNot: page.locator('[id*="cheat"]') }).first();
        if (await rollButtonAlt.count() > 0) {
          const isDisabled = await rollButtonAlt.isDisabled().catch(() => false);
          
          if (!isDisabled) {
            await rollButtonAlt.scrollIntoViewIfNeeded();
            await delay(500);
            await rollButtonAlt.click({ timeout: 15000 });
            await delay(DELAY_BETWEEN_ACTIONS);
            console.log(`🎲 [${USER_NAME}] Roll ${i + 1}/${game.rolls}`);
            continue;
          } else {
            console.log(`⏳ [${USER_NAME}] Roll button disabled, waiting...`);
            await delay(2000);
            continue;
          }
        } else {
          console.log(`⚠️ [${USER_NAME}] Roll button not found`);
          break;
        }
      }
      
      const isDisabled = await rollButton.isDisabled().catch(() => false);
      
      if (!isDisabled) {
        await rollButton.scrollIntoViewIfNeeded();
        await delay(500);
        await rollButton.click({ timeout: 15000 });
        await delay(DELAY_BETWEEN_ACTIONS);
        console.log(`🎲 [${USER_NAME}] Roll ${i + 1}/${game.rolls}`);
      } else {
        console.log(`⏳ [${USER_NAME}] Roll button disabled, waiting...`);
        await delay(2000);
      }
    }

    console.log(`✅ [${USER_NAME}] Finished playing dice`);
    return true;
  } catch (error) {
    console.error(`❌ [${USER_NAME}] Error playing dice:`, error.message);
    return false;
  }
}

/**
 * Play blackjack game
 */
async function playBlackjack(page, game) {
  console.log(`🃏 [${USER_NAME}] Playing blackjack...`);
  
  try {
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');
    await delay(2000); // Longer wait for blackjack to initialize
    
    // Blackjack uses div chips with onclick handlers - look for chip divs
    // Chips are divs with class "chip" and onclick="setBet(amount)"
    const chip50 = page.locator('div.chip.chip-50, div.chip:has-text("$50"), div[onclick*="setBet(50)"]').first();
    const chip25 = page.locator('div.chip.chip-25, div.chip:has-text("$25"), div[onclick*="setBet(25)"]').first();
    const chip10 = page.locator('div.chip.chip-10, div.chip:has-text("$10"), div[onclick*="setBet(10)"]').first();
    const chip100 = page.locator('div.chip.chip-100, div.chip:has-text("$100"), div[onclick*="setBet(100)"]').first();
    
    // Click chips to reach target bet amount
    let targetBet = game.betAmount;
    let betPlaced = false;
    
    // Try to place bet using appropriate chip
    if (targetBet >= 100 && await chip100.count() > 0) {
      await chip100.scrollIntoViewIfNeeded();
      await delay(500);
      await chip100.click({ timeout: 10000 });
      await delay(1500);
      console.log(`💰 [${USER_NAME}] Placed $100 bet`);
      betPlaced = true;
    } else if (targetBet >= 50 && await chip50.count() > 0) {
      await chip50.scrollIntoViewIfNeeded();
      await delay(500);
      await chip50.click({ timeout: 10000 });
      await delay(1500);
      console.log(`💰 [${USER_NAME}] Placed $50 bet`);
      betPlaced = true;
    } else if (targetBet >= 25 && await chip25.count() > 0) {
      await chip25.scrollIntoViewIfNeeded();
      await delay(500);
      await chip25.click({ timeout: 10000 });
      await delay(1500);
      console.log(`💰 [${USER_NAME}] Placed $25 bet`);
      betPlaced = true;
    } else if (await chip10.count() > 0) {
      await chip10.scrollIntoViewIfNeeded();
      await delay(500);
      await chip10.click({ timeout: 10000 });
      await delay(1500);
      console.log(`💰 [${USER_NAME}] Placed $10 bet`);
      betPlaced = true;
    }
    
    if (!betPlaced) {
      console.log(`⚠️ [${USER_NAME}] Could not place bet, trying to continue anyway`);
    }

    // Play multiple rounds
    for (let i = 0; i < game.rounds; i++) {
      // Wait a bit before dealing
      await delay(1000);
      
      // Deal - use the specific dealButton ID
      const dealButton = page.locator('button#dealButton').first();
      if (await dealButton.count() > 0) {
        const isDisabled = await dealButton.isDisabled().catch(() => false);
        
        if (!isDisabled) {
          await dealButton.scrollIntoViewIfNeeded();
          await delay(500);
          await dealButton.click({ timeout: 15000 });
          await delay(3000); // Wait for cards to be dealt
          console.log(`🃏 [${USER_NAME}] Round ${i + 1}: Dealt cards`);
        } else {
          console.log(`⏳ [${USER_NAME}] Deal button disabled (bet may not be placed), waiting...`);
          await delay(2000);
          // Try clicking a chip again
          if (await chip50.count() > 0) {
            await chip50.click();
            await delay(1500);
            // Try deal again
            const dealBtn2 = page.locator('button#dealButton').first();
            if (await dealBtn2.count() > 0 && !(await dealBtn2.isDisabled().catch(() => false))) {
              await dealBtn2.click({ timeout: 15000 });
              await delay(3000);
            }
          }
        }
      } else {
        console.log(`⚠️ [${USER_NAME}] Deal button not found`);
        break;
      }

      // Hit or Stand (random decision) - wait for game to be ready
      await delay(2000); // Wait for game state to be ready after dealing
      const hitButton = page.locator('button#hitButton').first();
      const standButton = page.locator('button#standButton').first();
      
      // Check if buttons are available and enabled
      const hitAvailable = await hitButton.count() > 0 && !(await hitButton.isDisabled().catch(() => false));
      const standAvailable = await standButton.count() > 0 && !(await standButton.isDisabled().catch(() => false));
      
      if (Math.random() > 0.5 && hitAvailable) {
        await hitButton.scrollIntoViewIfNeeded();
        await delay(500);
        await hitButton.click({ timeout: 15000 });
        await delay(DELAY_BETWEEN_ACTIONS);
        console.log(`🃏 [${USER_NAME}] Round ${i + 1}: Hit`);
      } else if (standAvailable) {
        await standButton.scrollIntoViewIfNeeded();
        await delay(500);
        await standButton.click({ timeout: 15000 });
        await delay(DELAY_BETWEEN_ACTIONS * 2); // Wait longer for dealer turn
        console.log(`🃏 [${USER_NAME}] Round ${i + 1}: Stand`);
      } else {
        console.log(`⚠️ [${USER_NAME}] Round ${i + 1}: No action buttons available (game may have ended)`);
      }
      
      // Wait for round to complete
      await delay(2000);
    }

    console.log(`✅ [${USER_NAME}] Finished playing blackjack`);
    return true;
  } catch (error) {
    console.error(`❌ [${USER_NAME}] Error playing blackjack:`, error.message);
    return false;
  }
}

/**
 * Return to lobby
 */
async function returnToLobby(page) {
  console.log(`🏠 [${USER_NAME}] Returning to lobby...`);
  
  try {
    // Look for lobby/home button
    const lobbyButton = page.locator('a:has-text("Lobby"), a:has-text("Home"), button:has-text("Lobby"), a[href*="lobby"], a[href="/"]').first();
    
    if (await lobbyButton.count() > 0) {
      await lobbyButton.click();
      await page.waitForLoadState('networkidle');
      await delay(DELAY_BETWEEN_ACTIONS);
      console.log(`✅ [${USER_NAME}] Returned to lobby`);
      return true;
    } else {
      // Try direct navigation
      await page.goto(CASINO_URL);
      await page.waitForLoadState('networkidle');
      await delay(DELAY_BETWEEN_ACTIONS);
      console.log(`✅ [${USER_NAME}] Navigated to lobby`);
      return true;
    }
  } catch (error) {
    console.error(`❌ [${USER_NAME}] Error returning to lobby:`, error.message);
    return false;
  }
}

/**
 * Open dashboard and view stats
 */
async function viewDashboard(page) {
  console.log(`📊 [${USER_NAME}] Opening dashboard...`);
  
  try {
    // Navigate to dashboard
    await page.goto(`${CASINO_URL}/dashboard`);
    await page.waitForLoadState('networkidle');
    await delay(DELAY_BETWEEN_ACTIONS * 2);

    // View stats for each game
    const games = ['slots', 'roulette', 'dice', 'blackjack', 'all'];
    
    for (const game of games) {
      console.log(`📊 [${USER_NAME}] Viewing stats for ${game}...`);
      
      // Look for game selector or filter
      const gameSelector = page.locator(`select, button:has-text("${game}"), a:has-text("${game}")`).first();
      if (await gameSelector.count() > 0) {
        try {
          if (await gameSelector.evaluate(el => el.tagName.toLowerCase() === 'select')) {
            await gameSelector.selectOption(game);
          } else {
            await gameSelector.click();
          }
          await delay(DELAY_BETWEEN_ACTIONS);
        } catch (e) {
          // Ignore if selector doesn't work
        }
      }
      
      await delay(DELAY_BETWEEN_ACTIONS);
    }

    console.log(`✅ [${USER_NAME}] Finished viewing dashboard`);
    return true;
  } catch (error) {
    console.error(`❌ [${USER_NAME}] Error viewing dashboard:`, error.message);
    return false;
  }
}

/**
 * Main user journey simulation
 */
async function simulateUserJourney(iteration = 1) {
  console.log(`\n🚀 [${USER_NAME}] Starting user journey simulation (Iteration ${iteration})...\n`);
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  
  const page = await context.newPage();
  
  try {
    // Step 1: Enter casino
    await enterCasino(page);
    await delay(DELAY_BETWEEN_ACTIONS);

    // Step 2: Play each game
    for (const game of GAMES) {
      // Deposit before each game
      await depositFunds(page);
      await delay(DELAY_BETWEEN_ACTIONS);

      // Navigate to game
      await navigateToGame(page, game);
      await delay(DELAY_BETWEEN_ACTIONS);

      // Play the game
      switch (game.name) {
        case 'slots':
          await playSlots(page, game);
          break;
        case 'roulette':
          await playRoulette(page, game);
          break;
        case 'dice':
          await playDice(page, game);
          break;
        case 'blackjack':
          await playBlackjack(page, game);
          break;
      }

      // Return to lobby between games
      await returnToLobby(page);
      await delay(DELAY_BETWEEN_GAMES);
    }

    // Step 3: View dashboard
    await viewDashboard(page);
    await delay(DELAY_BETWEEN_ACTIONS);

    console.log(`\n✅ [${USER_NAME}] User journey simulation completed successfully!\n`);
    
  } catch (error) {
    console.error(`\n❌ [${USER_NAME}] Error during user journey:`, error);
  } finally {
    await browser.close();
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('='.repeat(60));
  console.log('🎰 Vegas Casino User Journey Simulator');
  console.log('='.repeat(60));
  console.log(`Casino URL: ${CASINO_URL}`);
  console.log(`User Name: ${USER_NAME}`);
  console.log(`User Email: ${USER_EMAIL}`);
  console.log(`User Company: ${USER_COMPANY}`);
  console.log(`Iterations: ${ITERATIONS}`);
  console.log(`Run Continuously: ${RUN_CONTINUOUSLY}`);
  console.log('='.repeat(60));

  if (RUN_CONTINUOUSLY) {
    console.log('🔄 Running continuously...');
    let iteration = 1;
    while (true) {
      await simulateUserJourney(iteration);
      await delay(DELAY_BETWEEN_GAMES * 2);
      iteration++;
    }
  } else {
    for (let i = 1; i <= ITERATIONS; i++) {
      await simulateUserJourney(i);
      if (i < ITERATIONS) {
        await delay(DELAY_BETWEEN_GAMES * 2);
      }
    }
  }
}

// Run the simulation
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

