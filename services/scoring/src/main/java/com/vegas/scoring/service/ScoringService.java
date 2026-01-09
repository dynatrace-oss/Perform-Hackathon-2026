package com.vegas.scoring.service;

import com.vegas.scoring.model.GameResult;
import com.vegas.scoring.model.PlayerScore;
import com.vegas.scoring.repository.GameResultRepository;
import com.vegas.scoring.repository.PlayerScoreRepository;
import com.vegas.scoring.dto.DashboardStats;
import com.vegas.scoring.dto.ScoreResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.context.Scope;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class ScoringService {

    private static final Logger logger = LoggerFactory.getLogger(ScoringService.class);

    @Autowired
    private PlayerScoreRepository scoreRepository;

    @Autowired
    private GameResultRepository gameResultRepository;

    @Autowired
    @Qualifier("tracer")
    private Tracer tracer;

    @Transactional
    public PlayerScore recordScore(String username, String role, String game, Double score, String metadata) {
        logger.info("Saving score to database: username={}, game={}, score={}, role={}", 
                username, game, score, role);
        
        Span span = tracer.spanBuilder("db.save_player_score")
                .setSpanKind(SpanKind.CLIENT)
                .setAttribute(AttributeKey.stringKey("db.system"), "postgresql")
                .setAttribute(AttributeKey.stringKey("db.operation"), "INSERT")
                .setAttribute(AttributeKey.stringKey("db.sql.table"), "player_scores")
                .setAttribute("db.username", username)
                .setAttribute("db.game", game)
                .setAttribute("db.score", score)
                .startSpan();
        
        try (Scope scope = span.makeCurrent()) {
            PlayerScore playerScore = new PlayerScore(username, role, game, score);
            if (metadata != null) {
                playerScore.setMetadata(metadata);
            }
            
            PlayerScore savedScore = scoreRepository.save(playerScore);
            
            span.setAttribute("db.record_id", savedScore.getId());
            span.setStatus(io.opentelemetry.api.trace.StatusCode.OK);
            
            logger.info("Successfully saved score to database: id={}, username={}, game={}, score={}", 
                    savedScore.getId(), username, game, savedScore.getScore());
            
            return savedScore;
        } catch (Exception e) {
            span.recordException(e);
            span.setStatus(io.opentelemetry.api.trace.StatusCode.ERROR, e.getMessage());
            throw e;
        } finally {
            span.end();
        }
    }

    public List<PlayerScore> getTopPlayers(String game, int limit) {
        if ("all".equals(game)) {
            // Get top players across all games - aggregate by username (best score per user)
            return scoreRepository.findAll().stream()
                    .collect(Collectors.toMap(
                            PlayerScore::getUsername,
                            score -> score,
                            (a, b) -> a.getScore() > b.getScore() ? a : b
                    ))
                    .values()
                    .stream()
                    .sorted((a, b) -> Double.compare(b.getScore(), a.getScore()))
                    .limit(limit)
                    .collect(Collectors.toList());
        }
        return scoreRepository.findTopNByGame(game, limit);
    }

    public List<PlayerScore> getTopPlayersWithRank(String game, int limit) {
        List<PlayerScore> scores = getTopPlayers(game, limit);
        // Add rank to each score
        return IntStream.range(0, scores.size())
                .mapToObj(i -> {
                    PlayerScore score = scores.get(i);
                    // Note: Rank would need to be calculated based on actual position
                    return score;
                })
                .collect(Collectors.toList());
    }

    public PlayerScore getBestScoreForUser(String username, String game) {
        Span findBestSpan = tracer.spanBuilder("db.find_best_score_for_user")
                .setSpanKind(SpanKind.CLIENT)
                .setAttribute(AttributeKey.stringKey("db.system"), "postgresql")
                .setAttribute(AttributeKey.stringKey("db.operation"), "SELECT")
                .setAttribute(AttributeKey.stringKey("db.sql.table"), "player_scores")
                .setAttribute("db.username", username)
                .setAttribute("db.game", game)
                .startSpan();
        
        try (Scope bestScope = findBestSpan.makeCurrent()) {
            Optional<PlayerScore> result = scoreRepository.findFirstByUsernameAndGameOrderByScoreDesc(username, game);
            findBestSpan.setAttribute("db.record_found", result.isPresent());
            if (result.isPresent()) {
                findBestSpan.setAttribute("db.score", result.get().getScore());
            }
            findBestSpan.setStatus(io.opentelemetry.api.trace.StatusCode.OK);
            return result.orElse(null);
        } catch (Exception e) {
            findBestSpan.recordException(e);
            findBestSpan.setStatus(io.opentelemetry.api.trace.StatusCode.ERROR, e.getMessage());
            throw e;
        } finally {
            findBestSpan.end();
        }
    }

    // Game Result methods
    @Transactional
    public GameResult recordGameResult(String username, String game, String action, 
                                       Double betAmount, Double payout, Boolean win,
                                       String result, String gameData, String metadata) {
        logger.info("Saving game result to database: username={}, game={}, action={}, betAmount={}, payout={}, win={}", 
                username, game, action, betAmount, payout, win);
        
        GameResult gameResult = new GameResult(username, game, action, betAmount, payout, win);
        if (result != null) {
            gameResult.setResult(result);
        }
        if (gameData != null) {
            gameResult.setGameData(gameData);
        }
        if (metadata != null) {
            gameResult.setMetadata(metadata);
        }
        // Create span for saving game result
        Span saveGameResultSpan = tracer.spanBuilder("db.save_game_result")
                .setSpanKind(SpanKind.CLIENT)
                .setAttribute(AttributeKey.stringKey("db.system"), "postgresql")
                .setAttribute(AttributeKey.stringKey("db.operation"), "INSERT")
                .setAttribute(AttributeKey.stringKey("db.sql.table"), "game_results")
                .setAttribute("db.username", username)
                .setAttribute("db.game", game)
                .setAttribute("db.action", action)
                .setAttribute("db.win", win)
                .startSpan();
        
        GameResult savedResult;
        try (Scope saveScope = saveGameResultSpan.makeCurrent()) {
            savedResult = gameResultRepository.save(gameResult);
            saveGameResultSpan.setAttribute("db.record_id", savedResult.getId());
            saveGameResultSpan.setStatus(io.opentelemetry.api.trace.StatusCode.OK);
        } catch (Exception e) {
            saveGameResultSpan.recordException(e);
            saveGameResultSpan.setStatus(io.opentelemetry.api.trace.StatusCode.ERROR, e.getMessage());
            throw e;
        } finally {
            saveGameResultSpan.end();
        }
        
        logger.info("Successfully saved game result to database: id={}, username={}, game={}, action={}, win={}", 
                savedResult.getId(), username, game, action, win);
        
        // Automatically update PlayerScore based on game result
        // Store the best single game performance (highest payout) per player per game
        // Score = payout amount (how much they won), not cumulative balance
        // Store initial bet and winnings in metadata
        
        logger.info("Updating player score: username={}, game={}, betAmount={}, payout={}", 
                username, game, betAmount, payout);
        
        // Find existing score entry for this user/game combination
        Span findScoreSpan = tracer.spanBuilder("db.find_player_score")
                .setSpanKind(SpanKind.CLIENT)
                .setAttribute(AttributeKey.stringKey("db.system"), "postgresql")
                .setAttribute(AttributeKey.stringKey("db.operation"), "SELECT")
                .setAttribute(AttributeKey.stringKey("db.sql.table"), "player_scores")
                .setAttribute("db.username", username)
                .setAttribute("db.game", game)
                .startSpan();
        
        List<PlayerScore> existingScores;
        try (Scope findScope = findScoreSpan.makeCurrent()) {
            existingScores = scoreRepository.findByUsernameAndGameOrderByTimestampDesc(username, game);
            findScoreSpan.setAttribute("db.records_found", existingScores.size());
            findScoreSpan.setStatus(io.opentelemetry.api.trace.StatusCode.OK);
        } catch (Exception e) {
            findScoreSpan.recordException(e);
            findScoreSpan.setStatus(io.opentelemetry.api.trace.StatusCode.ERROR, e.getMessage());
            throw e;
        } finally {
            findScoreSpan.end();
        }
        
        Optional<PlayerScore> existingScoreOpt = existingScores.isEmpty() ? Optional.empty() : Optional.of(existingScores.get(0));
        
        // Create metadata with bet and winnings info
        String scoreMetadata = String.format(
            "{\"initial_bet\":%.2f,\"winnings\":%.2f,\"net_winnings\":%.2f,\"timestamp\":\"%s\"}",
            betAmount, payout, (payout - betAmount), LocalDateTime.now().toString()
        );
        
        if (existingScoreOpt.isPresent()) {
            // Update if this game has higher payout (better performance)
            PlayerScore existingScore = existingScoreOpt.get();
            Double currentBestPayout = existingScore.getScore(); // Current best payout
            
            if (payout > currentBestPayout) {
                // This is a better game, update the score
                Double oldScore = existingScore.getScore();
                existingScore.setScore(payout); // Store highest payout as score
                existingScore.setTimestamp(LocalDateTime.now());
                existingScore.setMetadata(scoreMetadata); // Store bet and winnings in metadata
                
                Span updateScoreSpan = tracer.spanBuilder("db.update_player_score")
                        .setSpanKind(SpanKind.CLIENT)
                        .setAttribute(AttributeKey.stringKey("db.system"), "postgresql")
                        .setAttribute(AttributeKey.stringKey("db.operation"), "UPDATE")
                        .setAttribute(AttributeKey.stringKey("db.sql.table"), "player_scores")
                        .setAttribute("db.username", username)
                        .setAttribute("db.game", game)
                        .setAttribute("db.old_score", oldScore)
                        .setAttribute("db.new_score", payout)
                        .startSpan();
                
                PlayerScore updatedScore;
                try (Scope updateScope = updateScoreSpan.makeCurrent()) {
                    updatedScore = scoreRepository.save(existingScore);
                    updateScoreSpan.setAttribute("db.record_id", updatedScore.getId());
                    updateScoreSpan.setStatus(io.opentelemetry.api.trace.StatusCode.OK);
                } catch (Exception e) {
                    updateScoreSpan.recordException(e);
                    updateScoreSpan.setStatus(io.opentelemetry.api.trace.StatusCode.ERROR, e.getMessage());
                    throw e;
                } finally {
                    updateScoreSpan.end();
                }
                
                logger.info("Updated player score with better game: id={}, username={}, game={}, oldBestPayout={}, newBestPayout={}, betAmount={}", 
                        updatedScore.getId(), username, game, oldScore, payout, betAmount);
            } else {
                // This game is not better, but update timestamp to show recent activity
                existingScore.setTimestamp(LocalDateTime.now());
                
                Span updateTimestampSpan = tracer.spanBuilder("db.update_player_score_timestamp")
                        .setSpanKind(SpanKind.CLIENT)
                        .setAttribute(AttributeKey.stringKey("db.system"), "postgresql")
                        .setAttribute(AttributeKey.stringKey("db.operation"), "UPDATE")
                        .setAttribute(AttributeKey.stringKey("db.sql.table"), "player_scores")
                        .setAttribute("db.username", username)
                        .setAttribute("db.game", game)
                        .startSpan();
                
                try (Scope updateScope = updateTimestampSpan.makeCurrent()) {
                    scoreRepository.save(existingScore);
                    updateTimestampSpan.setStatus(io.opentelemetry.api.trace.StatusCode.OK);
                } catch (Exception e) {
                    updateTimestampSpan.recordException(e);
                    updateTimestampSpan.setStatus(io.opentelemetry.api.trace.StatusCode.ERROR, e.getMessage());
                    throw e;
                } finally {
                    updateTimestampSpan.end();
                }
                
                logger.info("Game result recorded but not best performance: username={}, game={}, currentBest={}, thisGame={}", 
                        username, game, currentBestPayout, payout);
            }
        } else {
            // Create new score entry with this game's payout as the initial best
            PlayerScore newScore = new PlayerScore(username, "player", game, payout); // Score = payout (winnings)
            newScore.setMetadata(scoreMetadata); // Store bet and winnings in metadata
            
            Span createScoreSpan = tracer.spanBuilder("db.create_player_score")
                    .setSpanKind(SpanKind.CLIENT)
                    .setAttribute(AttributeKey.stringKey("db.system"), "postgresql")
                    .setAttribute(AttributeKey.stringKey("db.operation"), "INSERT")
                    .setAttribute(AttributeKey.stringKey("db.sql.table"), "player_scores")
                    .setAttribute("db.username", username)
                    .setAttribute("db.game", game)
                    .setAttribute("db.score", payout)
                    .startSpan();
            
            PlayerScore savedScore;
            try (Scope createScope = createScoreSpan.makeCurrent()) {
                savedScore = scoreRepository.save(newScore);
                createScoreSpan.setAttribute("db.record_id", savedScore.getId());
                createScoreSpan.setStatus(io.opentelemetry.api.trace.StatusCode.OK);
            } catch (Exception e) {
                createScoreSpan.recordException(e);
                createScoreSpan.setStatus(io.opentelemetry.api.trace.StatusCode.ERROR, e.getMessage());
                throw e;
            } finally {
                createScoreSpan.end();
            }
            
            logger.info("Created new player score: id={}, username={}, game={}, bestPayout={}, betAmount={}", 
                    savedScore.getId(), username, game, savedScore.getScore(), betAmount);
        }
        
        return savedResult;
    }

    public List<GameResult> getRecentGameResults(String game, int limit) {
        Span findRecentSpan = tracer.spanBuilder("db.find_recent_game_results")
                .setSpanKind(SpanKind.CLIENT)
                .setAttribute(AttributeKey.stringKey("db.system"), "postgresql")
                .setAttribute(AttributeKey.stringKey("db.operation"), "SELECT")
                .setAttribute(AttributeKey.stringKey("db.sql.table"), "game_results")
                .setAttribute("db.game", game)
                .setAttribute("db.limit", limit)
                .startSpan();
        
        try (Scope recentScope = findRecentSpan.makeCurrent()) {
            List<GameResult> results = gameResultRepository.findRecentByGame(game, limit);
            findRecentSpan.setAttribute("db.records_found", results.size());
            findRecentSpan.setStatus(io.opentelemetry.api.trace.StatusCode.OK);
            return results;
        } catch (Exception e) {
            findRecentSpan.recordException(e);
            findRecentSpan.setStatus(io.opentelemetry.api.trace.StatusCode.ERROR, e.getMessage());
            throw e;
        } finally {
            findRecentSpan.end();
        }
    }

    public List<GameResult> getGameResultsByTimeRange(LocalDateTime start, LocalDateTime end) {
        Span findTimeRangeSpan = tracer.spanBuilder("db.find_game_results_by_time_range")
                .setSpanKind(SpanKind.CLIENT)
                .setAttribute(AttributeKey.stringKey("db.system"), "postgresql")
                .setAttribute(AttributeKey.stringKey("db.operation"), "SELECT")
                .setAttribute(AttributeKey.stringKey("db.sql.table"), "game_results")
                .setAttribute("db.start_time", start.toString())
                .setAttribute("db.end_time", end.toString())
                .startSpan();
        
        try (Scope timeRangeScope = findTimeRangeSpan.makeCurrent()) {
            List<GameResult> results = gameResultRepository.findByTimestampBetween(start, end);
            findTimeRangeSpan.setAttribute("db.records_found", results.size());
            findTimeRangeSpan.setStatus(io.opentelemetry.api.trace.StatusCode.OK);
            return results;
        } catch (Exception e) {
            findTimeRangeSpan.recordException(e);
            findTimeRangeSpan.setStatus(io.opentelemetry.api.trace.StatusCode.ERROR, e.getMessage());
            throw e;
        } finally {
            findTimeRangeSpan.end();
        }
    }

    public DashboardStats getDashboardStats(String game) {
        DashboardStats stats = new DashboardStats();
        stats.setGame(game);

        // Count total games with span
        Span countGamesSpan = tracer.spanBuilder("db.count_games")
                .setSpanKind(SpanKind.CLIENT)
                .setAttribute(AttributeKey.stringKey("db.system"), "postgresql")
                .setAttribute(AttributeKey.stringKey("db.operation"), "SELECT")
                .setAttribute(AttributeKey.stringKey("db.sql.table"), "game_results")
                .setAttribute("db.game", game)
                .startSpan();
        
        Long totalGames;
        Long totalWins;
        try (Scope countScope = countGamesSpan.makeCurrent()) {
            totalGames = gameResultRepository.countTotalByGame(game);
            totalWins = gameResultRepository.countWinsByGame(game);
            countGamesSpan.setAttribute("db.total_games", totalGames);
            countGamesSpan.setAttribute("db.total_wins", totalWins);
            countGamesSpan.setStatus(io.opentelemetry.api.trace.StatusCode.OK);
        } catch (Exception e) {
            countGamesSpan.recordException(e);
            countGamesSpan.setStatus(io.opentelemetry.api.trace.StatusCode.ERROR, e.getMessage());
            throw e;
        } finally {
            countGamesSpan.end();
        }
        
        Long totalLosses = totalGames - totalWins;

        stats.setTotalGames(totalGames);
        stats.setTotalWins(totalWins);
        stats.setTotalLosses(totalLosses);

        if (totalGames > 0) {
            stats.setWinRate((double) totalWins / totalGames * 100.0);
        } else {
            stats.setWinRate(0.0);
        }

        // Sum bet amounts and payouts with spans
        Span sumBetSpan = tracer.spanBuilder("db.sum_bet_amounts")
                .setSpanKind(SpanKind.CLIENT)
                .setAttribute(AttributeKey.stringKey("db.system"), "postgresql")
                .setAttribute(AttributeKey.stringKey("db.operation"), "SELECT")
                .setAttribute(AttributeKey.stringKey("db.sql.table"), "game_results")
                .setAttribute("db.game", game)
                .startSpan();
        
        Double totalBetAmount;
        Double totalPayout;
        try (Scope sumScope = sumBetSpan.makeCurrent()) {
            totalBetAmount = gameResultRepository.sumBetAmountsByGame(game);
            totalPayout = gameResultRepository.sumPayoutsByGame(game);
            sumBetSpan.setAttribute("db.total_bet_amount", totalBetAmount != null ? totalBetAmount : 0.0);
            sumBetSpan.setAttribute("db.total_payout", totalPayout != null ? totalPayout : 0.0);
            sumBetSpan.setStatus(io.opentelemetry.api.trace.StatusCode.OK);
        } catch (Exception e) {
            sumBetSpan.recordException(e);
            sumBetSpan.setStatus(io.opentelemetry.api.trace.StatusCode.ERROR, e.getMessage());
            throw e;
        } finally {
            sumBetSpan.end();
        }

        stats.setTotalBetAmount(totalBetAmount != null ? totalBetAmount : 0.0);
        stats.setTotalPayout(totalPayout != null ? totalPayout : 0.0);
        stats.setNetRevenue((totalBetAmount != null ? totalBetAmount : 0.0) - (totalPayout != null ? totalPayout : 0.0));

        if (totalGames > 0) {
            stats.setAverageBetAmount((totalBetAmount != null ? totalBetAmount : 0.0) / totalGames);
            stats.setAveragePayout((totalPayout != null ? totalPayout : 0.0) / totalGames);
        } else {
            stats.setAverageBetAmount(0.0);
            stats.setAveragePayout(0.0);
        }

        // Count recent games (last 24 hours)
        LocalDateTime yesterday = LocalDateTime.now().minusHours(24);
        LocalDateTime now = LocalDateTime.now();
        
        Span findRecentSpan = tracer.spanBuilder("db.find_recent_games")
                .setSpanKind(SpanKind.CLIENT)
                .setAttribute(AttributeKey.stringKey("db.system"), "postgresql")
                .setAttribute(AttributeKey.stringKey("db.operation"), "SELECT")
                .setAttribute(AttributeKey.stringKey("db.sql.table"), "game_results")
                .setAttribute("db.game", game)
                .setAttribute("db.time_range_hours", 24)
                .startSpan();
        
        List<GameResult> recentResults;
        try (Scope recentScope = findRecentSpan.makeCurrent()) {
            recentResults = gameResultRepository.findByGameAndTimestampBetweenOrderByTimestampDesc(
                    game, yesterday, now);
            findRecentSpan.setAttribute("db.records_found", recentResults.size());
            findRecentSpan.setStatus(io.opentelemetry.api.trace.StatusCode.OK);
        } catch (Exception e) {
            findRecentSpan.recordException(e);
            findRecentSpan.setStatus(io.opentelemetry.api.trace.StatusCode.ERROR, e.getMessage());
            throw e;
        } finally {
            findRecentSpan.end();
        }
        
        stats.setRecentGames((long) recentResults.size());

        // Get top 10 players for this game
        Span getTopPlayersSpan = tracer.spanBuilder("db.get_top_players")
                .setSpanKind(SpanKind.CLIENT)
                .setAttribute(AttributeKey.stringKey("db.system"), "postgresql")
                .setAttribute(AttributeKey.stringKey("db.operation"), "SELECT")
                .setAttribute(AttributeKey.stringKey("db.sql.table"), "player_scores")
                .setAttribute("db.game", game)
                .setAttribute("db.limit", 10)
                .startSpan();
        
        List<PlayerScore> topPlayerScores;
        try (Scope topScope = getTopPlayersSpan.makeCurrent()) {
            topPlayerScores = getTopPlayers(game, 10);
            getTopPlayersSpan.setAttribute("db.records_found", topPlayerScores.size());
            getTopPlayersSpan.setStatus(io.opentelemetry.api.trace.StatusCode.OK);
        } catch (Exception e) {
            getTopPlayersSpan.recordException(e);
            getTopPlayersSpan.setStatus(io.opentelemetry.api.trace.StatusCode.ERROR, e.getMessage());
            throw e;
        } finally {
            getTopPlayersSpan.end();
        }
        ObjectMapper objectMapper = new ObjectMapper();
        List<ScoreResponse> topPlayers = IntStream.range(0, topPlayerScores.size())
                .mapToObj(i -> {
                    PlayerScore score = topPlayerScores.get(i);
                    Double initialBet = null;
                    Double winnings = score.getScore(); // Score now stores the best payout (winnings)
                    
                    // Extract initial bet from metadata if available
                    if (score.getMetadata() != null && !score.getMetadata().isEmpty()) {
                        try {
                            @SuppressWarnings("unchecked")
                            Map<String, Object> metadata = objectMapper.readValue(score.getMetadata(), Map.class);
                            if (metadata.containsKey("initial_bet")) {
                                initialBet = ((Number) metadata.get("initial_bet")).doubleValue();
                            }
                            // winnings is already stored as score, but we can also get it from metadata
                            if (metadata.containsKey("winnings")) {
                                winnings = ((Number) metadata.get("winnings")).doubleValue();
                            }
                        } catch (Exception e) {
                            // If metadata parsing fails, use score as winnings
                            logger.warn("Failed to parse metadata for score {}: {}", score.getId(), e.getMessage());
                        }
                    }
                    
                    return new ScoreResponse(
                            score.getUsername(),
                            score.getRole(),
                            score.getGame(),
                            score.getScore(), // This is now the best payout (winnings)
                            (long) (i + 1), // Rank
                            initialBet,
                            winnings
                    );
                })
                .collect(Collectors.toList());
        stats.setTopPlayers(topPlayers);

        return stats;
    }

    public List<DashboardStats> getAllGamesDashboardStats() {
        List<String> games = List.of("slots", "roulette", "dice", "blackjack");
        return games.stream()
                .map(game -> {
                    try {
                        return getDashboardStats(game);
                    } catch (Exception e) {
                        logger.error("Error getting dashboard stats for game: {}", game, e);
                        // Return empty stats for this game instead of failing completely
                        DashboardStats emptyStats = new DashboardStats();
                        emptyStats.setGame(game);
                        emptyStats.setTotalGames(0L);
                        emptyStats.setTotalWins(0L);
                        emptyStats.setTotalLosses(0L);
                        emptyStats.setWinRate(0.0);
                        emptyStats.setTotalBetAmount(0.0);
                        emptyStats.setTotalPayout(0.0);
                        emptyStats.setNetRevenue(0.0);
                        emptyStats.setAverageBetAmount(0.0);
                        emptyStats.setAveragePayout(0.0);
                        emptyStats.setRecentGames(0L);
                        emptyStats.setTopPlayers(new ArrayList<>());
                        return emptyStats;
                    }
                })
                .collect(Collectors.toList());
    }
}

