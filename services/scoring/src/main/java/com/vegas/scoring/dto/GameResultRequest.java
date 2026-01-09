package com.vegas.scoring.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public class GameResultRequest {
    @NotBlank(message = "Username is required")
    private String username;

    @NotBlank(message = "Game is required")
    private String game;

    @NotBlank(message = "Action is required")
    private String action;

    @NotNull(message = "Bet amount is required")
    private Double betAmount;

    @NotNull(message = "Payout is required")
    private Double payout;

    @NotNull(message = "Win status is required")
    private Boolean win;

    private String result; // win, lose, push, etc.
    private String gameData; // JSON string for game-specific data
    private String metadata; // JSON string for additional metadata

    // Constructors
    public GameResultRequest() {}

    // Getters and Setters
    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getGame() {
        return game;
    }

    public void setGame(String game) {
        this.game = game;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }

    public Double getBetAmount() {
        return betAmount;
    }

    public void setBetAmount(Double betAmount) {
        this.betAmount = betAmount;
    }

    public Double getPayout() {
        return payout;
    }

    public void setPayout(Double payout) {
        this.payout = payout;
    }

    public Boolean getWin() {
        return win;
    }

    public void setWin(Boolean win) {
        this.win = win;
    }

    public String getResult() {
        return result;
    }

    public void setResult(String result) {
        this.result = result;
    }

    public String getGameData() {
        return gameData;
    }

    public void setGameData(String gameData) {
        this.gameData = gameData;
    }

    public String getMetadata() {
        return metadata;
    }

    public void setMetadata(String metadata) {
        this.metadata = metadata;
    }
}








