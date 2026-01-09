FROM mcr.microsoft.com/playwright:v1.57.0-noble

WORKDIR /app

# Copy package files
COPY services/playwright/package.json ./
COPY services/playwright/simulate-user.js ./

# Install dependencies
RUN npm install

# Make script executable
RUN chmod +x simulate-user.js

# Set default environment variables (can be overridden at runtime)
ENV CASINO_URL=""
ENV DELAY_BETWEEN_ACTIONS=2000
ENV DELAY_BETWEEN_GAMES=5000
ENV RUN_CONTINUOUSLY=false
ENV ITERATIONS=1

# Run the simulation
CMD ["node", "simulate-user.js"]

