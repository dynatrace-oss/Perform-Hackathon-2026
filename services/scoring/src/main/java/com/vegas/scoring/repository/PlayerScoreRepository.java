package com.vegas.scoring.repository;

import com.vegas.scoring.model.PlayerScore;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PlayerScoreRepository extends JpaRepository<PlayerScore, Long> {
    
    // Find top N scores for a specific game
    @Query("SELECT ps FROM PlayerScore ps WHERE ps.game = :game ORDER BY ps.score DESC")
    List<PlayerScore> findTopScoresByGame(@Param("game") String game);

    // Find top N scores for a specific game (limited)
    @Query(value = "SELECT * FROM player_scores WHERE game = :game ORDER BY score DESC LIMIT :limit", nativeQuery = true)
    List<PlayerScore> findTopNByGame(@Param("game") String game, @Param("limit") int limit);

    // Find best score for a user in a specific game
    Optional<PlayerScore> findFirstByUsernameAndGameOrderByScoreDesc(String username, String game);

    // Find all scores for a user
    List<PlayerScore> findByUsernameOrderByScoreDesc(String username);
    
    // Find scores for a user in a specific game, ordered by timestamp (most recent first)
    List<PlayerScore> findByUsernameAndGameOrderByTimestampDesc(String username, String game);
}


