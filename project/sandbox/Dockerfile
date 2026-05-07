FROM python:3.11-slim

# Install common dev tools the user might need
RUN apt-get update && apt-get install -y \
    git curl wget vim nano \
    nodejs npm \
    bash && \
    apt-get clean

# Create non-root user — never run as root in sandbox
RUN useradd -ms /bin/bash sandboxuser
USER sandboxuser
WORKDIR /home/sandboxuser/workspace

# Pre-install common Python packages
# RUN pip install --user requests numpy pandas flask fastapi

CMD ["/bin/bash"]
