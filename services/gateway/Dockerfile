FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY services/gateway/package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy gateway service
COPY services/gateway/gateway-service.js ./

# Copy shared common utilities (create directory structure first)
RUN mkdir -p services/common && chmod -R 755 services
COPY services/common/service-manager.js services/common/service-manager.js
COPY services/common/opentelemetry.js services/common/opentelemetry.js
RUN chmod 644 services/common/*.js

# Copy proto files (if needed for service discovery)
RUN mkdir -p proto && chmod 755 proto
COPY proto/ proto/
RUN chmod -R 644 proto/*

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the gateway service
CMD ["node", "gateway-service.js"]

