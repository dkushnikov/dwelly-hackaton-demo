FROM python:3.12-slim AS replay
WORKDIR /app
RUN pip install --no-cache-dir uvicorn==0.43.0
RUN useradd --create-home --uid 10001 village
COPY demo /app/demo
RUN mkdir -p /app/runs/demo && chown -R village:village /app/runs
USER village
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8787/api/health', timeout=2)" || exit 1
CMD ["python", "-m", "demo.server", "--host", "0.0.0.0", "--replay"]

FROM replay AS live
USER root
COPY pyproject.toml /tmp/village-pyproject.toml
RUN python -c "import tomllib, subprocess; p=tomllib.load(open('/tmp/village-pyproject.toml','rb')); subprocess.check_call(['pip','install','--no-cache-dir',*p['project']['optional-dependencies']['live']])"
USER village
CMD ["python", "-m", "demo.server", "--host", "0.0.0.0", "--agent-root", "/agent"]
