FROM node:18-alpine

WORKDIR /app

# Copy service package.json
COPY services/blackjack/package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy service files
COPY services/blackjack/ ./
# Copy common files into the app directory structure
RUN mkdir -p common && chmod 755 common
COPY services/common/service-runner.js ./common/service-runner.js
COPY services/common/opentelemetry.js ./common/opentelemetry.js
COPY services/common/openfeature.js ./common/openfeature.js
COPY services/common/redis.js ./common/redis.js
COPY services/common/scoring.js ./common/scoring.js
COPY services/common/logger.js ./common/logger.js
RUN chmod 644 ./common/*.js
# Copy proto files
RUN mkdir -p proto && chmod 755 proto
COPY proto/ ./proto/
RUN chmod -R 644 ./proto/*

# Expose ports
EXPOSE 8084 50054

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8084/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the service
CMD ["node", "index.js"]

