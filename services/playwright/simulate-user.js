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

// Game configurations - ensure all bet amounts are > 0 (minimum 10)
const GAMES = [
  { name: 'slots', path: '/slots.html', betAmount: Math.max(10, 50), spins: 3 },
  { name: 'roulette', path: '/roulette.html', betAmount: Math.max(10, 100), spins: 2 },
  { name: 'dice', path: '/dice.html', betAmount: Math.max(10, 75), rolls: 3 },
  { name: 'blackjack', path: '/blackjack.html', betAmount: Math.max(10, 80), rounds: 2 }
];

/**
 * Wait for a specified duration
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Simulate user entering the casino
 * Sets username via localStorage and initializes user via API
 */
async function enterCasino(page) {
  console.log(`🎰 [${USER_NAME}] Entering casino...`);
  
  try {
    await page.goto(CASINO_URL);
    await page.waitForLoadState('networkidle');
    await delay(DELAY_BETWEEN_ACTIONS);

    // Set username in localStorage (the app uses localStorage for user identity)
    await page.evaluate((username) => {
      localStorage.setItem('vegas.username', username);
      localStorage.removeItem('vegasUser'); // Remove old key if it exists
    }, USER_NAME);

    // Initialize user via API (this sets up balance and user data on the backend)
    const initResponse = await page.request.post(`${CASINO_URL}/api/user/init`, {
      data: {
        Username: USER_NAME,
        CustomerName: USER_NAME,
        Email: USER_EMAIL,
        CompanyName: USER_COMPANY,
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!initResponse.ok()) {
      console.warn(`⚠️ [${USER_NAME}] User init API returned ${initResponse.status()}, continuing anyway...`);
    } else {
      const initData = await initResponse.json();
      if (initData && typeof initData.balance === 'number') {
        // Update localStorage with balance from server
        await page.evaluate((balance) => {
          localStorage.setItem('vegasBalance', String(balance));
        }, initData.balance);
      }
    }

    // Wait a bit for the page to update with the new user info
    await delay(500);

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
    
    // Ensure bet amount is valid (> 0, minimum 10)
    const validBetAmount = Math.max(10, game.betAmount || 10);
    
    // Set bet amount - slots uses a select dropdown
    const betSelect = page.locator('select#betAmount').first();
    if (await betSelect.count() > 0) {
      await betSelect.scrollIntoViewIfNeeded();
      await betSelect.selectOption(validBetAmount.toString());
      await delay(1000);
      console.log(`💰 [${USER_NAME}] Set bet amount to $${validBetAmount}`);
    } else {
      // Fallback to any bet input
      const betInput = page.locator('input[id*="bet"], input[name*="bet"], input[type="number"]').first();
      if (await betInput.count() > 0) {
        await betInput.fill(validBetAmount.toString());
        await delay(1000);
        console.log(`💰 [${USER_NAME}] Set bet amount to $${validBetAmount} (via input)`);
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
    
    // Ensure bet amount is valid (> 0, minimum 10)
    const validBetAmount = Math.max(10, game.betAmount || 10);
    
    // Set bet amount - roulette uses input#betAmount
    const betInput = page.locator('input#betAmount').first();
    if (await betInput.count() > 0) {
      await betInput.scrollIntoViewIfNeeded();
      await betInput.fill(validBetAmount.toString());
      await delay(1000);
      console.log(`💰 [${USER_NAME}] Set bet amount to $${validBetAmount}`);
    } else {
      // Fallback
      const fallbackInput = page.locator('input[id*="bet"], input[name*="bet"], input[type="number"]').first();
      if (await fallbackInput.count() > 0) {
        await fallbackInput.fill(validBetAmount.toString());
        await delay(1000);
        console.log(`💰 [${USER_NAME}] Set bet amount to $${validBetAmount} (via fallback)`);
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
    
    // Ensure bet amount is valid (> 0, minimum 10 for dice)
    const desiredBet = Math.max(10, game.betAmount || 10);
    
    // Set bet amount - dice uses select#betAmount with limited options (5, 10, 25, 50)
    const betSelect = page.locator('select#betAmount').first();
    if (await betSelect.count() > 0) {
      await betSelect.scrollIntoViewIfNeeded();
      await delay(500);
      
      // Dice only supports: 5, 10, 25, 50 - find closest valid option (minimum 10)
      const validOptions = [10, 25, 50]; // Removed 5 to ensure minimum $10
      let selectedBet = validOptions[0]; // Default to $10 (minimum)
      
      // Find the closest valid option that's <= the desired bet amount
      for (let i = validOptions.length - 1; i >= 0; i--) {
        if (validOptions[i] <= desiredBet) {
          selectedBet = validOptions[i];
          break;
        }
      }
      
      // Ensure we select at least $10
      if (selectedBet < 10) {
        selectedBet = 10;
      }
      
      try {
        await betSelect.selectOption(selectedBet.toString(), { timeout: 5000 });
        await delay(1000);
        console.log(`💰 [${USER_NAME}] Set bet amount to $${selectedBet} (requested: $${desiredBet})`);
      } catch (error) {
        console.log(`⚠️ [${USER_NAME}] Could not select bet amount ${selectedBet}, trying by label...`);
        // Try selecting by visible text
        try {
          await betSelect.selectOption({ label: `$${selectedBet}` });
          await delay(1000);
          console.log(`💰 [${USER_NAME}] Set bet amount to $${selectedBet} (via label)`);
        } catch (e) {
          console.log(`⚠️ [${USER_NAME}] Could not set bet amount, trying fallback...`);
          // Last resort: try to set minimum $10 via JavaScript
          try {
            await page.evaluate((bet) => {
              const select = document.getElementById('betAmount');
              if (select) {
                select.value = bet.toString();
                select.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }, selectedBet);
            await delay(1000);
            console.log(`💰 [${USER_NAME}] Set bet amount to $${selectedBet} (via JavaScript)`);
          } catch (jsError) {
            console.log(`❌ [${USER_NAME}] Could not set bet amount, skipping game`);
            return false;
          }
        }
      }
    } else {
      // Fallback to input
      const betInput = page.locator('input[id*="bet"], input[name*="bet"], input[type="number"]').first();
      if (await betInput.count() > 0) {
        await betInput.fill(desiredBet.toString());
        await delay(1000);
        console.log(`💰 [${USER_NAME}] Set bet amount to $${desiredBet} (via input fallback)`);
      } else {
        console.log(`❌ [${USER_NAME}] No bet input found, skipping game`);
        return false;
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
    
    // Ensure bet amount is valid (> 0, minimum 10)
    const targetBet = Math.max(10, game.betAmount || 10);
    
    // Blackjack uses div chips with onclick handlers - look for chip divs
    // Chips are divs with class "chip" and onclick="setBet(amount)"
    const chip5 = page.locator('div.chip.chip-5, div.chip:has-text("$5"), div[onclick*="setBet(5)"]').first();
    const chip10 = page.locator('div.chip.chip-10, div.chip:has-text("$10"), div[onclick*="setBet(10)"]').first();
    const chip25 = page.locator('div.chip.chip-25, div.chip:has-text("$25"), div[onclick*="setBet(25)"]').first();
    const chip50 = page.locator('div.chip.chip-50, div.chip:has-text("$50"), div[onclick*="setBet(50)"]').first();
    const chip100 = page.locator('div.chip.chip-100, div.chip:has-text("$100"), div[onclick*="setBet(100)"]').first();
    
    // Click chips to reach target bet amount (ensure we place at least $10)
    let betPlaced = false;
    let currentBet = 0;
    
    // Strategy: Place chips until we reach or exceed target bet (minimum $10)
    while (currentBet < targetBet && !betPlaced) {
      let chipClicked = false;
      
      // Try to place bet using appropriate chip (prioritize larger chips)
      if (targetBet >= 100 && await chip100.count() > 0 && currentBet + 100 <= targetBet * 1.5) {
        await chip100.scrollIntoViewIfNeeded();
        await delay(300);
        await chip100.click({ timeout: 10000 });
        currentBet += 100;
        chipClicked = true;
        console.log(`💰 [${USER_NAME}] Added $100 chip (total: $${currentBet})`);
      } else if (targetBet >= 50 && await chip50.count() > 0 && currentBet + 50 <= targetBet * 1.5) {
        await chip50.scrollIntoViewIfNeeded();
        await delay(300);
        await chip50.click({ timeout: 10000 });
        currentBet += 50;
        chipClicked = true;
        console.log(`💰 [${USER_NAME}] Added $50 chip (total: $${currentBet})`);
      } else if (targetBet >= 25 && await chip25.count() > 0 && currentBet + 25 <= targetBet * 1.5) {
        await chip25.scrollIntoViewIfNeeded();
        await delay(300);
        await chip25.click({ timeout: 10000 });
        currentBet += 25;
        chipClicked = true;
        console.log(`💰 [${USER_NAME}] Added $25 chip (total: $${currentBet})`);
      } else if (targetBet >= 10 && await chip10.count() > 0 && currentBet + 10 <= targetBet * 1.5) {
        await chip10.scrollIntoViewIfNeeded();
        await delay(300);
        await chip10.click({ timeout: 10000 });
        currentBet += 10;
        chipClicked = true;
        console.log(`💰 [${USER_NAME}] Added $10 chip (total: $${currentBet})`);
      } else if (targetBet >= 5 && await chip5.count() > 0 && currentBet + 5 <= targetBet * 1.5) {
        await chip5.scrollIntoViewIfNeeded();
        await delay(300);
        await chip5.click({ timeout: 10000 });
        currentBet += 5;
        chipClicked = true;
        console.log(`💰 [${USER_NAME}] Added $5 chip (total: $${currentBet})`);
      }
      
      // If we've placed at least the minimum bet ($10), we're good
      if (currentBet >= 10) {
        betPlaced = true;
        await delay(2000); // Wait longer for bet to register and UI to update
        // Verify bet is actually displayed on page
        const currentBetDisplay = page.locator('#currentBet').first();
        if (await currentBetDisplay.count() > 0) {
          const betText = await currentBetDisplay.textContent().catch(() => '');
          const displayedBet = parseInt(betText.replace(/[^0-9]/g, '')) || 0;
          if (displayedBet >= 10) {
            console.log(`✅ [${USER_NAME}] Bet placed and verified: $${displayedBet}`);
          } else {
            console.log(`⚠️ [${USER_NAME}] Bet placed but not yet displayed (waiting...)`);
            await delay(2000); // Wait more for UI update
          }
        }
        break;
      }
      
      // If no chip was clicked and we haven't reached minimum, try one more time with $10
      if (!chipClicked && currentBet < 10) {
        if (await chip10.count() > 0) {
          await chip10.scrollIntoViewIfNeeded();
          await delay(300);
          await chip10.click({ timeout: 10000 });
          currentBet = 10;
          betPlaced = true;
          await delay(1000);
          console.log(`✅ [${USER_NAME}] Minimum bet placed: $${currentBet}`);
          break;
        } else {
          console.log(`⚠️ [${USER_NAME}] Could not place minimum bet of $10`);
          break;
        }
      }
      
      // Safety: don't loop forever
      if (currentBet >= targetBet || currentBet >= 1000) {
        betPlaced = true;
        break;
      }
    }
    
    if (!betPlaced || currentBet < 10) {
      console.log(`❌ [${USER_NAME}] Failed to place valid bet (minimum $10), skipping game`);
      return false;
    }

    // Play multiple rounds
    for (let i = 0; i < game.rounds; i++) {
      console.log(`🎲 [${USER_NAME}] Starting round ${i + 1} of ${game.rounds}`);
      
      // For rounds after the first, we may need to place a new bet
      if (i > 0) {
        await delay(2000); // Wait for previous round to complete
        // Check if we need to place a new bet
        const currentBetDisplay = page.locator('#currentBet').first();
        if (await currentBetDisplay.count() > 0) {
          const betText = await currentBetDisplay.textContent().catch(() => '');
          const betValue = parseInt(betText.replace(/[^0-9]/g, '')) || 0;
          if (betValue < 10) {
            console.log(`💰 [${USER_NAME}] Round ${i + 1}: Placing new bet (current: $${betValue})...`);
            // Place minimum bet for next round
            if (await chip10.count() > 0) {
              await chip10.scrollIntoViewIfNeeded();
              await delay(300);
              await chip10.click({ timeout: 10000 });
              await delay(1500); // Wait for bet to register
            }
          }
        }
      }
      
      // Wait a bit before dealing
      await delay(1000);
      
      // Verify bet is placed before dealing (check current bet display)
      const currentBetDisplay = page.locator('#currentBet').first();
      let verifiedBet = false;
      let actualBetValue = 0;
      if (await currentBetDisplay.count() > 0) {
        const betText = await currentBetDisplay.textContent().catch(() => '');
        actualBetValue = parseInt(betText.replace(/[^0-9]/g, '')) || 0;
        if (actualBetValue >= 10) {
          verifiedBet = true;
          console.log(`✅ [${USER_NAME}] Round ${i + 1}: Verified bet placed: $${actualBetValue}`);
        } else {
          console.log(`⚠️ [${USER_NAME}] Round ${i + 1}: Bet not properly placed (current: $${actualBetValue}), placing minimum bet...`);
          // Place minimum bet
          if (await chip10.count() > 0) {
            await chip10.scrollIntoViewIfNeeded();
            await delay(300);
            await chip10.click({ timeout: 10000 });
            await delay(2000); // Wait longer for bet to register and button to update
            // Re-check bet value
            const betTextAfter = await currentBetDisplay.textContent().catch(() => '');
            actualBetValue = parseInt(betTextAfter.replace(/[^0-9]/g, '')) || 0;
            if (actualBetValue >= 10) {
              verifiedBet = true;
              console.log(`✅ [${USER_NAME}] Round ${i + 1}: Bet placed after retry: $${actualBetValue}`);
            }
          }
        }
      }
      
      if (!verifiedBet) {
        console.log(`❌ [${USER_NAME}] Round ${i + 1}: Could not place valid bet, skipping round`);
        continue;
      }
      
      // Deal - use the specific dealButton ID
      const dealButton = page.locator('button#dealButton').first();
      if (await dealButton.count() > 0) {
        // Wait for button to be enabled (it might be updating after bet placement)
        // Also check the button text to ensure it's ready
        let buttonEnabled = false;
        for (let retry = 0; retry < 10; retry++) {
          const isDisabled = await dealButton.isDisabled().catch(() => true);
          const buttonText = await dealButton.textContent().catch(() => '');
          if (!isDisabled && (buttonText.includes('Deal') || buttonText.includes('deal'))) {
            buttonEnabled = true;
            console.log(`✅ [${USER_NAME}] Round ${i + 1}: Deal button enabled (text: "${buttonText}")`);
            break;
          }
          if (retry < 9) {
            console.log(`⏳ [${USER_NAME}] Round ${i + 1}: Waiting for deal button (attempt ${retry + 1}/10, disabled: ${isDisabled}, text: "${buttonText}")`);
          }
          await delay(500);
        }
        
        if (buttonEnabled) {
          await dealButton.scrollIntoViewIfNeeded();
          await delay(500);
          try {
            await dealButton.click({ timeout: 15000 });
            await delay(3000); // Wait for cards to be dealt (gRPC call)
            console.log(`🃏 [${USER_NAME}] Round ${i + 1}: Dealt cards via gRPC`);
          } catch (error) {
            console.log(`⚠️ [${USER_NAME}] Round ${i + 1}: Error clicking deal button: ${error.message}`);
            // Try one more time
            await delay(1000);
            try {
              await dealButton.click({ timeout: 15000 });
              await delay(3000);
              console.log(`🃏 [${USER_NAME}] Round ${i + 1}: Dealt cards after error retry`);
            } catch (retryError) {
              console.log(`❌ [${USER_NAME}] Round ${i + 1}: Could not deal cards after retry: ${retryError.message}`);
              continue;
            }
          }
        } else {
          console.log(`❌ [${USER_NAME}] Round ${i + 1}: Deal button remains disabled after waiting`);
          console.log(`   Bet value: $${actualBetValue}, Verified: ${verifiedBet}`);
          
          // Try clicking a chip one more time and wait longer
          if (await chip10.count() > 0) {
            console.log(`   Attempting to place bet again...`);
            await chip10.scrollIntoViewIfNeeded();
            await delay(300);
            await chip10.click({ timeout: 10000 });
            await delay(3000); // Wait longer for bet to register and button to update
            
            // Re-check bet and button
            const betTextAfter = await currentBetDisplay.textContent().catch(() => '');
            const betValueAfter = parseInt(betTextAfter.replace(/[^0-9]/g, '')) || 0;
            console.log(`   Bet after retry: $${betValueAfter}`);
            
            const dealBtn2 = page.locator('button#dealButton').first();
            // Wait for button to update
            for (let retry = 0; retry < 5; retry++) {
              const isDisabled2 = await dealBtn2.isDisabled().catch(() => true);
              const buttonText2 = await dealBtn2.textContent().catch(() => '');
              if (!isDisabled2 && betValueAfter >= 10) {
                await dealBtn2.scrollIntoViewIfNeeded();
                await delay(500);
                await dealBtn2.click({ timeout: 15000 });
                await delay(3000);
                console.log(`🃏 [${USER_NAME}] Round ${i + 1}: Dealt cards after final retry`);
                break;
              }
              if (retry < 4) {
                await delay(500);
              } else {
                console.log(`❌ [${USER_NAME}] Round ${i + 1}: Could not deal cards, button still disabled (bet: $${betValueAfter})`);
                continue;
              }
            }
          } else {
            console.log(`❌ [${USER_NAME}] Round ${i + 1}: No chips available for retry`);
            continue;
          }
        }
      } else {
        console.log(`⚠️ [${USER_NAME}] Round ${i + 1}: Deal button not found`);
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

