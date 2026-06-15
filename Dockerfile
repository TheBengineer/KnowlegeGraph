FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml setup.py ./
COPY src/ src/
RUN pip install --no-cache-dir .
EXPOSE 8080
ENTRYPOINT ["python", "-m", "kg_mcp"]
