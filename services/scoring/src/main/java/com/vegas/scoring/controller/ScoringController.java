package com.vegas.scoring.controller;

import com.vegas.scoring.dto.ScoreRequest;
import com.vegas.scoring.dto.ScoreResponse;
import com.vegas.scoring.dto.GameResultRequest;
import com.vegas.scoring.dto.DashboardStats;
import com.vegas.scoring.model.PlayerScore;
import com.vegas.scoring.model.GameResult;
import com.vegas.scoring.service.ScoringService;
import io.opentelemetry.api.GlobalOpenTelemetry;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.context.Context;
import io.opentelemetry.context.Scope;
import io.opentelemetry.context.propagation.TextMapGetter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

@RestController
@RequestMapping("/api/scoring")
@CrossOrigin(origins = "*")
public class ScoringController {

    private static final Logger logger = LoggerFactory.getLogger(ScoringController.class);

    @Autowired
    private ScoringService scoringService;

    @Autowired
    @Qualifier("tracer")
    private Tracer tracer;

    @PostMapping("/record")
    public ResponseEntity<ScoreResponse> recordScore(
            @Valid @RequestBody ScoreRequest request,
            HttpServletRequest httpRequest) {
        logger.info("Received score record request: username={}, game={}, score={}, role={}", 
                request.getUsername(), request.getGame(), request.getScore(), request.getRole());
        
        // Extract trace context from HTTP headers
        Context parentContext = GlobalOpenTelemetry.getPropagators()
                .getTextMapPropagator()
                .extract(Context.current(), httpRequest, new TextMapGetter<HttpServletRequest>() {
                    @Override
                    public Iterable<String> keys(HttpServletRequest carrier) {
                        return java.util.Collections.list(carrier.getHeaderNames());
                    }

                    @Override
                    public String get(HttpServletRequest carrier, String key) {
                        return carrier.getHeader(key);
                    }
                });
        
        Span span = tracer.spanBuilder("scoring.record")
                .setParent(parentContext)
                .setSpanKind(SpanKind.SERVER)
                .setAttribute("scoring.username", request.getUsername())
                .setAttribute("scoring.game", request.getGame())
                .setAttribute("scoring.score", request.getScore())
                .startSpan();

        try (Scope scope = span.makeCurrent()) {
            PlayerScore score = scoringService.recordScore(
                    request.getUsername(),
                    request.getRole(),
                    request.getGame(),
                    request.getScore(),
                    request.getMetadata()
            );

            ScoreResponse response = new ScoreResponse(
                    score.getUsername(),
                    score.getRole(),
                    score.getGame(),
                    score.getScore(),
                    null // Rank not calculated for individual records
            );

            logger.info("Successfully processed score record request: id={}, username={}, game={}, score={}", 
                    score.getId(), score.getUsername(), score.getGame(), score.getScore());
            
            span.setAttribute("scoring.recorded", true);
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (Exception e) {
            span.recordException(e);
            span.setAttribute("scoring.error", true);
            throw e;
        } finally {
            span.end();
        }
    }

    @GetMapping("/leaderboard/{game}")
    public ResponseEntity<List<ScoreResponse>> getLeaderboard(
            @PathVariable String game,
            @RequestParam(defaultValue = "10") int limit) {
        
        Span span = tracer.spanBuilder("scoring.leaderboard")
                .setAttribute("scoring.game", game)
                .setAttribute("scoring.limit", limit)
                .startSpan();

        try (Scope scope = span.makeCurrent()) {
            List<PlayerScore> scores = scoringService.getTopPlayers(game, limit);
            
            List<ScoreResponse> leaderboard = IntStream.range(0, scores.size())
                    .mapToObj(i -> {
                        PlayerScore score = scores.get(i);
                        return new ScoreResponse(
                                score.getUsername(),
                                score.getRole(),
                                score.getGame(),
                                score.getScore(),
                                (long) (i + 1) // Rank is position in list
                        );
                    })
                    .collect(Collectors.toList());

            span.setAttribute("scoring.results_count", leaderboard.size());
            return ResponseEntity.ok(leaderboard);
        } catch (Exception e) {
            span.recordException(e);
            span.setAttribute("scoring.error", true);
            throw e;
        } finally {
            span.end();
        }
    }


    @PostMapping("/game-result")
    public ResponseEntity<GameResult> recordGameResult(
            @Valid @RequestBody GameResultRequest request,
            HttpServletRequest httpRequest) {
        logger.info("Received game result record request: username={}, game={}, action={}, betAmount={}, payout={}, win={}", 
                request.getUsername(), request.getGame(), request.getAction(), 
                request.getBetAmount(), request.getPayout(), request.getWin());
        
        // Validate betAmount - must be greater than 0
        if (request.getBetAmount() == null || request.getBetAmount() <= 0) {
            logger.warn("Rejecting game result with invalid betAmount: username={}, game={}, action={}, betAmount={}", 
                    request.getUsername(), request.getGame(), request.getAction(), request.getBetAmount());
            return ResponseEntity.badRequest().build();
        }
        
        // Extract trace context from HTTP headers
        Context parentContext = GlobalOpenTelemetry.getPropagators()
                .getTextMapPropagator()
                .extract(Context.current(), httpRequest, new TextMapGetter<HttpServletRequest>() {
                    @Override
                    public Iterable<String> keys(HttpServletRequest carrier) {
                        return java.util.Collections.list(carrier.getHeaderNames());
                    }

                    @Override
                    public String get(HttpServletRequest carrier, String key) {
                        return carrier.getHeader(key);
                    }
                });
        
        Span span = tracer.spanBuilder("scoring.record_game_result")
                .setParent(parentContext)
                .setSpanKind(SpanKind.SERVER)
                .setAttribute("scoring.username", request.getUsername())
                .setAttribute("scoring.game", request.getGame())
                .setAttribute("scoring.action", request.getAction())
                .setAttribute("scoring.win", request.getWin())
                .startSpan();

        try (Scope scope = span.makeCurrent()) {
            GameResult result = scoringService.recordGameResult(
                    request.getUsername(),
                    request.getGame(),
                    request.getAction(),
                    request.getBetAmount(),
                    request.getPayout(),
                    request.getWin(),
                    request.getResult(),
                    request.getGameData(),
                    request.getMetadata()
            );

            logger.info("Successfully processed game result record request: id={}, username={}, game={}, action={}, win={}", 
                    result.getId(), result.getUsername(), result.getGame(), result.getAction(), result.getWin());
            
            span.setAttribute("scoring.recorded", true);
            return ResponseEntity.status(HttpStatus.CREATED).body(result);
        } catch (Exception e) {
            span.recordException(e);
            span.setAttribute("scoring.error", true);
            throw e;
        } finally {
            span.end();
        }
    }

    @GetMapping("/dashboard/{game}")
    public ResponseEntity<DashboardStats> getDashboardStats(
            @PathVariable String game,
            HttpServletRequest httpRequest) {
        // Extract trace context from HTTP headers
        Context parentContext = GlobalOpenTelemetry.getPropagators()
                .getTextMapPropagator()
                .extract(Context.current(), httpRequest, new TextMapGetter<HttpServletRequest>() {
                    @Override
                    public Iterable<String> keys(HttpServletRequest carrier) {
                        return java.util.Collections.list(carrier.getHeaderNames());
                    }

                    @Override
                    public String get(HttpServletRequest carrier, String key) {
                        return carrier.getHeader(key);
                    }
                });
        
        Span span = tracer.spanBuilder("scoring.dashboard")
                .setParent(parentContext)
                .setSpanKind(SpanKind.SERVER)
                .setAttribute("scoring.game", game)
                .startSpan();

        try (Scope scope = span.makeCurrent()) {
            DashboardStats stats = scoringService.getDashboardStats(game);
            span.setAttribute("scoring.stats.total_games", stats.getTotalGames());
            span.setAttribute("scoring.stats.top_players_count", 
                    stats.getTopPlayers() != null ? stats.getTopPlayers().size() : 0);
            return ResponseEntity.ok(stats);
        } catch (Exception e) {
            span.recordException(e);
            span.setAttribute("scoring.error", true);
            throw e;
        } finally {
            span.end();
        }
    }

    @GetMapping("/dashboard")
    public ResponseEntity<List<DashboardStats>> getAllDashboardStats(HttpServletRequest httpRequest) {
        // Extract trace context from HTTP headers
        Context parentContext = GlobalOpenTelemetry.getPropagators()
                .getTextMapPropagator()
                .extract(Context.current(), httpRequest, new TextMapGetter<HttpServletRequest>() {
                    @Override
                    public Iterable<String> keys(HttpServletRequest carrier) {
                        return java.util.Collections.list(carrier.getHeaderNames());
                    }

                    @Override
                    public String get(HttpServletRequest carrier, String key) {
                        return carrier.getHeader(key);
                    }
                });
        
        Span span = tracer.spanBuilder("scoring.dashboard.all")
                .setParent(parentContext)
                .setSpanKind(SpanKind.SERVER)
                .startSpan();

        try (Scope scope = span.makeCurrent()) {
            List<DashboardStats> stats = scoringService.getAllGamesDashboardStats();
            span.setAttribute("scoring.stats.count", stats.size());
            return ResponseEntity.ok(stats);
        } catch (Exception e) {
            logger.error("Error getting all dashboard stats", e);
            span.recordException(e);
            span.setAttribute("scoring.error", true);
            span.setStatus(io.opentelemetry.api.trace.StatusCode.ERROR, e.getMessage());
            // Return empty list instead of throwing to prevent 500 error
            return ResponseEntity.ok(new java.util.ArrayList<>());
        } finally {
            span.end();
        }
    }

    @GetMapping("/game-results/{game}")
    public ResponseEntity<List<GameResult>> getGameResults(
            @PathVariable String game,
            @RequestParam(defaultValue = "50") int limit) {
        
        Span span = tracer.spanBuilder("scoring.game_results")
                .setAttribute("scoring.game", game)
                .setAttribute("scoring.limit", limit)
                .startSpan();

        try (Scope scope = span.makeCurrent()) {
            List<GameResult> results = scoringService.getRecentGameResults(game, limit);
            span.setAttribute("scoring.results_count", results.size());
            return ResponseEntity.ok(results);
        } catch (Exception e) {
            span.recordException(e);
            span.setAttribute("scoring.error", true);
            throw e;
        } finally {
            span.end();
        }
    }

    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("OK");
    }
}

