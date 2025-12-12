"""
Common Structured Logging Utility for Python Services
Provides consistent JSON logging across all services
"""

import json
import sys
from datetime import datetime


class Logger:
    def __init__(self, service_name):
        self.service_name = service_name

    def format_log(self, level, category, event, data=None):
        """Format log entry with timestamp and service name"""
        if data is None:
            data = {}
        
        log_entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "service": self.service_name,
            "level": level.upper(),
            "category": category,
            "event": event,
            **data
        }
        return json.dumps(log_entry)

    def log_feature_flag(self, key, value, variant=None, reason=None, context=None):
        """Log feature flag evaluation"""
        if context is None:
            context = {}
        log = self.format_log('info', 'feature_flag', 'evaluation', {
            'flag_key': key,
            'flag_value': value,
            'flag_variant': variant or 'default',
            'flag_reason': reason or 'STATIC',
            **context
        })
        print(log)

    def log_feature_flag_state_change(self, key, old_value, new_value, reason=''):
        """Log feature flag state change"""
        log = self.format_log('info', 'feature_flag', 'state_change', {
            'flag_key': key,
            'old_value': old_value,
            'new_value': new_value,
            'reason': reason
        })
        print(log)

    def log_game_action(self, action, game, data=None):
        """Log game action"""
        if data is None:
            data = {}
        log = self.format_log('info', 'game', action, {
            'game': game,
            **data
        })
        print(log)

    def log_game_start(self, game, username, bet_amount, game_data=None):
        """Log game start"""
        if game_data is None:
            game_data = {}
        self.log_game_action('start', game, {
            'username': username,
            'bet_amount': bet_amount,
            **game_data
        })

    def log_game_end(self, game, username, result, payout, win, game_data=None):
        """Log game end"""
        if game_data is None:
            game_data = {}
        self.log_game_action('end', game, {
            'username': username,
            'result': result,
            'payout': payout,
            'win': win,
            **game_data
        })

    def log_bet_change(self, game, username, old_bet, new_bet, reason=''):
        """Log bet change"""
        log = self.format_log('info', 'game', 'bet_change', {
            'game': game,
            'username': username,
            'old_bet': old_bet,
            'new_bet': new_bet,
            'reason': reason
        })
        print(log)

    def log_deposit(self, username, amount, balance_before, balance_after, metadata=None):
        """Log deposit"""
        if metadata is None:
            metadata = {}
        log = self.format_log('info', 'user', 'deposit', {
            'username': username,
            'amount': amount,
            'balance_before': balance_before,
            'balance_after': balance_after,
            **metadata
        })
        print(log)

    def log_user_action(self, action, username, data=None):
        """Log user action"""
        if data is None:
            data = {}
        log = self.format_log('info', 'user', action, {
            'username': username,
            **data
        })
        print(log)

    def log_grpc_call(self, method, service, request=None, response=None, error=None):
        """Log gRPC call"""
        if request is None:
            request = {}
        log_data = {
            'method': method,
            'service': service,
            'request': request,
        }
        if response is not None:
            log_data['response'] = response
        if error is not None:
            log_data['error'] = str(error)
            if hasattr(error, 'code'):
                log_data['error_code'] = error.code
        
        log = self.format_log(
            'error' if error else 'info',
            'grpc',
            'call_failed' if error else 'call_success',
            log_data
        )
        print(log)

    def log_http_request(self, method, path, status_code, duration, data=None):
        """Log HTTP request"""
        if data is None:
            data = {}
        log = self.format_log('info', 'http', 'request', {
            'method': method,
            'path': path,
            'status_code': status_code,
            'duration_ms': duration,
            **data
        })
        print(log)

    def log_error(self, error, context=None):
        """Log error"""
        if context is None:
            context = {}
        log_data = {
            'error_message': str(error),
            **context
        }
        if hasattr(error, '__traceback__'):
            import traceback
            log_data['error_stack'] = traceback.format_exc()
        
        log = self.format_log('error', 'error', 'exception', log_data)
        print(log, file=sys.stderr)

    def log_info(self, message, data=None):
        """Log info"""
        if data is None:
            data = {}
        log = self.format_log('info', 'info', 'message', {
            'message': message,
            **data
        })
        print(log)

    def log_warning(self, message, data=None):
        """Log warning"""
        if data is None:
            data = {}
        log = self.format_log('warn', 'warning', 'message', {
            'message': message,
            **data
        })
        print(log)

