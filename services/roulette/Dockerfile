FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY services/roulette/python/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy proto files and generate Python gRPC code
COPY proto/ ./proto/
RUN python3 -m grpc_tools.protoc -I proto --python_out=. --grpc_python_out=. proto/roulette.proto

# Copy common logger
COPY services/common/logger.py ./common/

# Copy service files
COPY services/roulette/python/ ./

# Expose ports
EXPOSE 8082 50052

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8082/health')" || exit 1

# Run the service
CMD ["python3", "roulette_service_grpc.py"]

