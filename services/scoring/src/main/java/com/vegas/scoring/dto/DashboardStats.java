package com.vegas.scoring.dto;

import java.util.List;

public class DashboardStats {
    private String game;
    private Long totalGames;
    private Long totalWins;
    private Long totalLosses;
    private Double winRate;
    private Double totalBetAmount;
    private Double totalPayout;
    private Double netRevenue; // totalBetAmount - totalPayout
    private Double averageBetAmount;
    private Double averagePayout;
    private Long recentGames; // Last 24 hours
    private List<ScoreResponse> topPlayers; // Top 10 players for this game

    public DashboardStats() {}

    // Getters and Setters
    public String getGame() {
        return game;
    }

    public void setGame(String game) {
        this.game = game;
    }

    public Long getTotalGames() {
        return totalGames;
    }

    public void setTotalGames(Long totalGames) {
        this.totalGames = totalGames;
    }

    public Long getTotalWins() {
        return totalWins;
    }

    public void setTotalWins(Long totalWins) {
        this.totalWins = totalWins;
    }

    public Long getTotalLosses() {
        return totalLosses;
    }

    public void setTotalLosses(Long totalLosses) {
        this.totalLosses = totalLosses;
    }

    public Double getWinRate() {
        return winRate;
    }

    public void setWinRate(Double winRate) {
        this.winRate = winRate;
    }

    public Double getTotalBetAmount() {
        return totalBetAmount;
    }

    public void setTotalBetAmount(Double totalBetAmount) {
        this.totalBetAmount = totalBetAmount;
    }

    public Double getTotalPayout() {
        return totalPayout;
    }

    public void setTotalPayout(Double totalPayout) {
        this.totalPayout = totalPayout;
    }

    public Double getNetRevenue() {
        return netRevenue;
    }

    public void setNetRevenue(Double netRevenue) {
        this.netRevenue = netRevenue;
    }

    public Double getAverageBetAmount() {
        return averageBetAmount;
    }

    public void setAverageBetAmount(Double averageBetAmount) {
        this.averageBetAmount = averageBetAmount;
    }

    public Double getAveragePayout() {
        return averagePayout;
    }

    public void setAveragePayout(Double averagePayout) {
        this.averagePayout = averagePayout;
    }

    public Long getRecentGames() {
        return recentGames;
    }

    public void setRecentGames(Long recentGames) {
        this.recentGames = recentGames;
    }

    public List<ScoreResponse> getTopPlayers() {
        return topPlayers;
    }

    public void setTopPlayers(List<ScoreResponse> topPlayers) {
        this.topPlayers = topPlayers;
    }
}

