#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

echo "Installing system packages..."
sudo apt update
sudo apt install -y jq curl vim gpg ca-certificates apt-transport-https

echo "Installing kubectl..."
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl
sudo mv kubectl /usr/local/bin/

echo "Installing step-cli..."
curl -fsSL https://packages.smallstep.com/keys/apt/repo-signing-key.gpg -o /tmp/smallstep.asc
sudo cp /tmp/smallstep.asc /etc/apt/trusted.gpg.d/smallstep.asc
echo 'deb [signed-by=/etc/apt/trusted.gpg.d/smallstep.asc] https://packages.smallstep.com/stable/debian debs main' | sudo tee /etc/apt/sources.list.d/smallstep.list
sudo apt-get update && sudo apt-get -y install step-cli

echo "Installing Helm from official repo..."
curl -fsSL https://packages.buildkite.com/helm-linux/helm-debian/gpgkey | gpg --dearmor | sudo tee /usr/share/keyrings/helm.gpg > /dev/null
echo "deb [signed-by=/usr/share/keyrings/helm.gpg] https://packages.buildkite.com/helm-linux/helm-debian/any/ any main" | sudo tee /etc/apt/sources.list.d/helm-stable-debian.list
sudo apt-get update
sudo apt-get install -y helm

echo "Installing kind..."
curl -Lo /tmp/kind https://kind.sigs.k8s.io/dl/v0.23.0/kind-linux-amd64
chmod +x /tmp/kind
sudo mv /tmp/kind /usr/local/bin/kind

echo "Verifying tools are available..."
helm version
kubectl version --client
kind version

echo "Setting up Docker access..."
# Install docker CLI if not available
if ! command -v docker &> /dev/null; then
    echo "Installing Docker CLI..."
    curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
    sudo sh /tmp/get-docker.sh
    sudo usermod -aG docker vscode 2>/dev/null || true
fi

# In Codespaces, Docker is available via host socket
if [ -S /var/run/docker-host.sock ]; then
    echo "Docker host socket found, creating symlink..."
    sudo ln -sf /var/run/docker-host.sock /var/run/docker.sock
    sudo chmod 666 /var/run/docker.sock 2>/dev/null || true
    sleep 2
fi

echo "Waiting for Docker to be ready..."
timeout 60 bash -c 'until docker info > /dev/null 2>&1; do echo "Waiting for Docker..."; sleep 2; done' || {
    echo "⚠️ Docker may not be fully ready, but continuing..."
}

echo "Current directory: $(pwd)"
echo "Looking for kind config..."
ls -la .devcontainer/kind-cluster.yaml || echo "Config not found!"

echo "Creating kind cluster with custom config..."
if [ -f "$(pwd)/.devcontainer/kind-cluster.yaml" ]; then
    kind create cluster --config "$(pwd)/.devcontainer/kind-cluster.yaml" --wait 5m
else
    echo "Using default kind config (file not found at $(pwd)/.devcontainer/kind-cluster.yaml)"
    kind create cluster --wait 5m
fi
echo "Verifying cluster..."
kubectl cluster-info
kubectl get nodes

echo "✅ Kind cluster ready!"