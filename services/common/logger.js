/**
 * Common Structured Logging Utility
 * Provides consistent JSON logging across all services
 */

class Logger {
  constructor(serviceName) {
    this.serviceName = serviceName;
  }

  /**
   * Format log entry with timestamp and service name
   */
  formatLog(level, category, event, data = {}) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      service: this.serviceName,
      level: level.toUpperCase(),
      category: category,
      event: event,
      ...data
    });
  }

  /**
   * Log feature flag evaluation
   */
  logFeatureFlag(key, value, variant, reason, context = {}) {
    const log = this.formatLog('info', 'feature_flag', 'evaluation', {
      flag_key: key,
      flag_value: value,
      flag_variant: variant || 'default',
      flag_reason: reason || 'STATIC',
      ...context
    });
    console.log(log);
  }

  /**
   * Log feature flag state change
   */
  logFeatureFlagStateChange(key, oldValue, newValue, reason = '') {
    const log = this.formatLog('info', 'feature_flag', 'state_change', {
      flag_key: key,
      old_value: oldValue,
      new_value: newValue,
      reason: reason
    });
    console.log(log);
  }

  /**
   * Log game action
   */
  logGameAction(action, game, data = {}) {
    const log = this.formatLog('info', 'game', action, {
      game: game,
      ...data
    });
    console.log(log);
  }

  /**
   * Log game start
   */
  logGameStart(game, username, betAmount, gameData = {}) {
    this.logGameAction('start', game, {
      username: username,
      bet_amount: betAmount,
      ...gameData
    });
  }

  /**
   * Log game end
   */
  logGameEnd(game, username, result, payout, win, gameData = {}) {
    this.logGameAction('end', game, {
      username: username,
      result: result,
      payout: payout,
      win: win,
      ...gameData
    });
  }

  /**
   * Log bet change
   */
  logBetChange(game, username, oldBet, newBet, reason = '') {
    const log = this.formatLog('info', 'game', 'bet_change', {
      game: game,
      username: username,
      old_bet: oldBet,
      new_bet: newBet,
      reason: reason
    });
    console.log(log);
  }

  /**
   * Log deposit
   */
  logDeposit(username, amount, balanceBefore, balanceAfter, metadata = {}) {
    const log = this.formatLog('info', 'user', 'deposit', {
      username: username,
      amount: amount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      ...metadata
    });
    console.log(log);
  }

  /**
   * Log user action
   */
  logUserAction(action, username, data = {}) {
    const log = this.formatLog('info', 'user', action, {
      username: username,
      ...data
    });
    console.log(log);
  }

  /**
   * Log gRPC call
   */
  logGrpcCall(method, service, request = {}, response = null, error = null) {
    const log = this.formatLog(
      error ? 'error' : 'info',
      'grpc',
      error ? 'call_failed' : 'call_success',
      {
        method: method,
        service: service,
        request: request,
        ...(response && { response: response }),
        ...(error && { error: error.message, error_code: error.code })
      }
    );
    console.log(log);
  }

  /**
   * Log HTTP request
   */
  logHttpRequest(method, path, statusCode, duration, data = {}) {
    const log = this.formatLog('info', 'http', 'request', {
      method: method,
      path: path,
      status_code: statusCode,
      duration_ms: duration,
      ...data
    });
    console.log(log);
  }

  /**
   * Log error
   */
  logError(error, context = {}) {
    const log = this.formatLog('error', 'error', 'exception', {
      error_message: error.message,
      error_stack: error.stack,
      ...context
    });
    console.error(log);
  }

  /**
   * Log info
   */
  logInfo(message, data = {}) {
    const log = this.formatLog('info', 'info', 'message', {
      message: message,
      ...data
    });
    console.log(log);
  }

  /**
   * Log warning
   */
  logWarning(message, data = {}) {
    const log = this.formatLog('warn', 'warning', 'message', {
      message: message,
      ...data
    });
    console.warn(log);
  }
}

module.exports = Logger;







