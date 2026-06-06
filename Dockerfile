# Combined production image: FastAPI + Vite static (for Railway/Fly/any container host)
FROM node:22-slim AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY scripts ./scripts
COPY --from=frontend /app/dist ./dist

ENV PORT=8000
EXPOSE 8000

# Serve API on :8000; static files mounted by upload_server when SERVE_STATIC=1
ENV SERVE_STATIC=1
CMD ["python", "scripts/upload_server.py"]
