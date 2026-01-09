FROM node:18-alpine

WORKDIR /app

# Copy frontend service package.json
COPY services/frontend/package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy frontend service files (includes public folder)
COPY services/frontend/ ./
# Copy common files into the app directory structure
RUN mkdir -p common && chmod 755 common
COPY services/common/openfeature.js ./common/openfeature.js
COPY services/common/opentelemetry.js ./common/opentelemetry.js
COPY services/common/logger.js ./common/logger.js
RUN chmod 644 ./common/*.js
COPY proto/ ./proto/

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the frontend service
CMD ["node", "frontend-service.js"]

