package com.vegas.scoring.dto;

public class ScoreResponse {
    private String username;
    private String role;
    private String game;
    private Double score;
    private Long rank;
    private Double initialBet;  // Initial bet amount for this game
    private Double winnings;     // Total winnings (payout) for this game

    public ScoreResponse() {}

    public ScoreResponse(String username, String role, String game, Double score, Long rank) {
        this.username = username;
        this.role = role;
        this.game = game;
        this.score = score;
        this.rank = rank;
    }

    public ScoreResponse(String username, String role, String game, Double score, Long rank, Double initialBet, Double winnings) {
        this.username = username;
        this.role = role;
        this.game = game;
        this.score = score;
        this.rank = rank;
        this.initialBet = initialBet;
        this.winnings = winnings;
    }

    // Getters and Setters
    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public String getGame() {
        return game;
    }

    public void setGame(String game) {
        this.game = game;
    }

    public Double getScore() {
        return score;
    }

    public void setScore(Double score) {
        this.score = score;
    }

    public Long getRank() {
        return rank;
    }

    public void setRank(Long rank) {
        this.rank = rank;
    }

    public Double getInitialBet() {
        return initialBet;
    }

    public void setInitialBet(Double initialBet) {
        this.initialBet = initialBet;
    }

    public Double getWinnings() {
        return winnings;
    }

    public void setWinnings(Double winnings) {
        this.winnings = winnings;
    }
}


