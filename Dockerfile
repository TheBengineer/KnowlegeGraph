# Stage 1: Build the React frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Python runtime with static frontend
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml setup.py ./
COPY src/ src/
RUN pip install --no-cache-dir .
COPY --from=frontend-builder /app/dist /app/static/
EXPOSE 8080
ENTRYPOINT ["python", "-m", "kg_mcp"]
