# Use an official Python runtime as a base image
FROM python:3.11-slim

# System deps + Node.js (for tsserver)
RUN apt-get update && apt-get install -y \
    git \
    curl \
    procps \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g typescript typescript-language-server \
    && apt-get clean
    
# Set the working directory inside the container
WORKDIR /app

# Copy the requirements file first to leverage Docker caching
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend application code into the container
COPY . .

# Expose the port FastAPI runs on
EXPOSE 1842
