# Build context: projects/landscope (so the OpenStreetMap data in src/data is included)
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 LANDSCOPE_DATA_DIR=/srv/data
WORKDIR /srv/api
COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY api/ .
COPY src/data/ /srv/data/
RUN useradd --create-home app && chown -R app /srv
USER app
EXPOSE 8000
# Render and most hosts provide $PORT
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
