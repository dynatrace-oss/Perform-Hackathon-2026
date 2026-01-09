package com.vegas.scoring.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "game_results", indexes = {
    @Index(name = "idx_game_timestamp", columnList = "game, timestamp DESC"),
    @Index(name = "idx_username_timestamp", columnList = "username, timestamp DESC"),
    @Index(name = "idx_game_result", columnList = "game, result")
})
public class GameResult {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String username;

    @Column(nullable = false)
    private String game; // slots, roulette, dice, blackjack

    @Column(nullable = false)
    private String action; // spin, roll, deal, stand, double, hit

    @Column(nullable = false)
    private Double betAmount;

    @Column(nullable = false)
    private Double payout; // 0 if lost, > 0 if won

    @Column(nullable = false)
    private Boolean win; // true if won, false if lost

    @Column
    private String result; // win, lose, push, etc.

    @Column(nullable = false)
    private LocalDateTime timestamp;

    @Column(columnDefinition = "TEXT")
    private String gameData; // JSON string for game-specific data (symbols, dice values, cards, etc.)

    @Column(columnDefinition = "TEXT")
    private String metadata; // JSON string for additional metadata

    // Constructors
    public GameResult() {
        this.timestamp = LocalDateTime.now();
    }

    public GameResult(String username, String game, String action, Double betAmount, Double payout, Boolean win) {
        this();
        this.username = username;
        this.game = game;
        this.action = action;
        this.betAmount = betAmount;
        this.payout = payout;
        this.win = win;
    }

    // Getters and Setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

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

    public LocalDateTime getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(LocalDateTime timestamp) {
        this.timestamp = timestamp;
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








