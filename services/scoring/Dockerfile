# Multi-stage build for Java Spring Boot application
FROM maven:3.9-eclipse-temurin-17 AS builder

WORKDIR /app

# Copy pom.xml and download dependencies
COPY pom.xml .
RUN mvn dependency:go-offline -B

# Copy source code and build
COPY src ./src
RUN mvn clean package -DskipTests -B

# Runtime stage
FROM eclipse-temurin:17-jre-alpine

WORKDIR /app

# Create non-root user
RUN addgroup -g 1000 appuser && \
    adduser -D -u 1000 -G appuser appuser && \
    mkdir -p /app && \
    chown -R appuser:appuser /app

# Copy JAR from builder
COPY --from=builder /app/target/scoring-service-*.jar /app/scoring-service.jar

# Set permissions
RUN chown appuser:appuser /app/scoring-service.jar && \
    chmod +x /app/scoring-service.jar

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8085

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8085/api/scoring/health || exit 1

# Start the application
ENTRYPOINT ["java", "-jar", "/app/scoring-service.jar"]








