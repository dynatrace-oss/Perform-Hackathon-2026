FROM node:18-alpine

WORKDIR /app

# Copy service package.json
COPY services/whack-a-mole/package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy service files
COPY services/whack-a-mole/ ./
# Copy common files into the app directory structure
RUN mkdir -p common && chmod 755 common
COPY services/common/service-runner.js ./common/service-runner.js
COPY services/common/opentelemetry.js ./common/opentelemetry.js
COPY services/common/openfeature.js ./common/openfeature.js
COPY services/common/redis.js ./common/redis.js
COPY services/common/scoring.js ./common/scoring.js
COPY services/common/logger.js ./common/logger.js

# Copy proto file
COPY proto/whack-a-mole.proto ./

# Expose ports
EXPOSE 3010 50051

# Start the service
CMD ["node", "index.js"]
