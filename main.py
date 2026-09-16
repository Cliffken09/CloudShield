import os
from fastapi import FastAPI
from dotenv import load_dotenv
from prometheus_fastapi_instrumentator import Instrumentator, metrics

from middleware import RequestLoggingMiddleware, SecurityHeadersMiddleware
from routers import auth, vault

load_dotenv()

DOCS_URL = os.getenv("DOCS_URL") or None

app = FastAPI(docs_url=DOCS_URL, redoc_url=None)

# nginx serves the frontend and proxies the API from the same origin, so
# there's no cross-origin caller left to allow — no CORS middleware needed.
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestLoggingMiddleware)

# /metrics is intentionally not proxied by nginx — only reachable on the
# internal Docker network, not from the internet.
instrumentator = Instrumentator().add(metrics.default())
instrumentator.instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


@app.get("/")
def show_running():
    return {"message": "CloudShield is running"}


@app.get("/health")
def health_check():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(vault.router)
