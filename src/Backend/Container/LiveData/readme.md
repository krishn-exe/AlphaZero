# How to use

## 1. Authenticate

- Set project project_id in `config.yaml`
- Run
```bash
.venv\Scripts\earthengine.exe authenticate
```
- Approve the project in the browser window

## 2. Run the fresh pull

```bash
.venv\Scripts\python.exe pipeline.py --fresh
```

## 3. Daemon mode

```bash
.venv\Scripts\python.exe pipeline.py --daemon
```