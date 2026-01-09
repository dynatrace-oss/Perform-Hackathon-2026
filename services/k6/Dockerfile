FROM grafana/k6:latest

WORKDIR /app

# Copy k6 test script
COPY services/k6/load-test.js /app/load-test.js

# Set default environment variables (can be overridden at runtime)
# CASINO_URL should be set at runtime via Kubernetes environment variable
# It can also be set via FRONTEND_URL for compatibility
ENV CASINO_URL=""
ENV FRONTEND_URL=""
ENV VUS=10
ENV DURATION=5m
ENV RAMP_UP=30s

# Run k6 test
# Note: grafana/k6 image has k6 as entrypoint, so CMD should only contain arguments
CMD ["run", "/app/load-test.js"]

