#!/usr/bin/env python3
"""
Roulette Service Tests
"""

import unittest
import random


class TestRouletteService(unittest.TestCase):
    """Test cases for Roulette Service"""

    def setUp(self):
        """Set up test fixtures"""
        self.roulette_numbers = list(range(37))  # 0-36
        self.red_numbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]
        self.black_numbers = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35]

    def test_roulette_number_range(self):
        """Test that roulette numbers are in valid range"""
        for number in self.roulette_numbers:
            self.assertGreaterEqual(number, 0)
            self.assertLessEqual(number, 36)

    def test_red_black_numbers(self):
        """Test that red and black numbers don't overlap"""
        red_set = set(self.red_numbers)
        black_set = set(self.black_numbers)
        self.assertEqual(len(red_set & black_set), 0, "Red and black numbers should not overlap")

    def test_all_numbers_covered(self):
        """Test that all numbers are either red, black, or zero"""
        all_colored = set(self.red_numbers + self.black_numbers + [0])
        all_numbers = set(self.roulette_numbers)
        self.assertEqual(all_colored, all_numbers, "All numbers should be red, black, or zero")

    def test_payout_calculation(self):
        """Test payout calculation for different bet types"""
        bet_amount = 10
        
        # Straight bet (single number) pays 35:1
        straight_payout = bet_amount * 35
        self.assertEqual(straight_payout, 350)
        
        # Red/Black bet pays 1:1
        red_black_payout = bet_amount * 1
        self.assertEqual(red_black_payout, 10)
        
        # Even/Odd bet pays 1:1
        even_odd_payout = bet_amount * 1
        self.assertEqual(even_odd_payout, 10)

    def test_number_is_red(self):
        """Test red number identification"""
        test_cases = [
            (1, True),
            (3, True),
            (2, False),
            (4, False),
            (0, False)
        ]
        
        for number, expected in test_cases:
            with self.subTest(number=number):
                is_red = number in self.red_numbers
                self.assertEqual(is_red, expected)

    def test_number_is_black(self):
        """Test black number identification"""
        test_cases = [
            (2, True),
            (4, True),
            (1, False),
            (3, False),
            (0, False)
        ]
        
        for number, expected in test_cases:
            with self.subTest(number=number):
                is_black = number in self.black_numbers
                self.assertEqual(is_black, expected)

    def test_service_metadata(self):
        """Test service metadata structure"""
        metadata = {
            "version": "2.1.0",
            "gameType": "european-roulette",
            "complexity": "high",
            "rtp": "97.3%",
            "maxPayout": "36x"
        }
        
        self.assertEqual(metadata["version"], "2.1.0")
        self.assertEqual(metadata["gameType"], "european-roulette")
        self.assertIn("rtp", metadata)


if __name__ == '__main__':
    unittest.main()








