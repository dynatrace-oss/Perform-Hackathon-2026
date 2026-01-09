package com.vegas.scoring.repository;

import com.vegas.scoring.model.GameResult;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface GameResultRepository extends JpaRepository<GameResult, Long> {
    
    // Find all results for a specific game (excluding records with betAmount <= 0)
    @Query("SELECT g FROM GameResult g WHERE g.game = :game AND g.betAmount > 0 ORDER BY g.timestamp DESC")
    List<GameResult> findByGameOrderByTimestampDesc(@Param("game") String game);

    // Find results for a specific game within time range (excluding records with betAmount <= 0)
    @Query("SELECT g FROM GameResult g WHERE g.game = :game AND g.timestamp BETWEEN :start AND :end AND g.betAmount > 0 ORDER BY g.timestamp DESC")
    List<GameResult> findByGameAndTimestampBetweenOrderByTimestampDesc(
            @Param("game") String game, @Param("start") LocalDateTime start, @Param("end") LocalDateTime end);

    // Find results for a specific user (excluding records with betAmount <= 0)
    @Query("SELECT g FROM GameResult g WHERE g.username = :username AND g.betAmount > 0 ORDER BY g.timestamp DESC")
    List<GameResult> findByUsernameOrderByTimestampDesc(@Param("username") String username);

    // Find results for a specific user and game (excluding records with betAmount <= 0)
    @Query("SELECT g FROM GameResult g WHERE g.username = :username AND g.game = :game AND g.betAmount > 0 ORDER BY g.timestamp DESC")
    List<GameResult> findByUsernameAndGameOrderByTimestampDesc(@Param("username") String username, @Param("game") String game);

    // Count wins for a game (excluding records with betAmount <= 0)
    @Query("SELECT COUNT(g) FROM GameResult g WHERE g.game = :game AND g.win = true AND g.betAmount > 0")
    Long countWinsByGame(@Param("game") String game);

    // Count total games (excluding records with betAmount <= 0)
    @Query("SELECT COUNT(g) FROM GameResult g WHERE g.game = :game AND g.betAmount > 0")
    Long countTotalByGame(@Param("game") String game);

    // Sum total bet amounts for a game (excluding records with betAmount <= 0)
    @Query("SELECT COALESCE(SUM(g.betAmount), 0) FROM GameResult g WHERE g.game = :game AND g.betAmount > 0")
    Double sumBetAmountsByGame(@Param("game") String game);

    // Sum total payouts for a game (only for records with betAmount > 0)
    @Query("SELECT COALESCE(SUM(g.payout), 0) FROM GameResult g WHERE g.game = :game AND g.betAmount > 0")
    Double sumPayoutsByGame(@Param("game") String game);

    // Get recent results (last N, excluding records with betAmount <= 0)
    @Query(value = "SELECT * FROM game_results WHERE game = :game AND bet_amount > 0 ORDER BY timestamp DESC LIMIT :limit", nativeQuery = true)
    List<GameResult> findRecentByGame(@Param("game") String game, @Param("limit") int limit);

    // Get results by time range (excluding records with betAmount <= 0)
    @Query("SELECT g FROM GameResult g WHERE g.timestamp BETWEEN :start AND :end AND g.betAmount > 0 ORDER BY g.timestamp DESC")
    List<GameResult> findByTimestampBetween(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);
}


