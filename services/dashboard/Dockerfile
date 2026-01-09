FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY services/dashboard/package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy dashboard service
COPY services/dashboard/ ./

# Copy shared common utilities
RUN mkdir -p common && chmod 755 common
COPY services/common/opentelemetry.js ./common/opentelemetry.js
COPY services/common/logger.js ./common/logger.js
RUN chmod 644 ./common/*.js

# Copy proto files
COPY proto/ ./proto/

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the dashboard service
CMD ["node", "dashboard-service.js"]


