"""
core/logger.py — Pretty, colorized logger for AntiMatter backend.

Usage:
    from core.logger import get_logger
    log = get_logger(__name__)

    log.info("User logged in", user_id=user.id, email=user.email)
    log.warning("Rate limit hit", model="llama-3.3-70b", retry_after=60)
    log.error("Tool failed", tool="write_file", exc_info=True)
    log.debug("RAG context built", chunks=12, tokens=3400)

Output (in docker logs / terminal):
    2026-05-31 16:45:01.234  INFO     [auth.py:47]            User logged in  user_id=abc123  email=you@x.com
    2026-05-31 16:45:02.891  WARNING  [runner.py:151]         Rate limit hit  model=llama-3.3-70b  retry_after=60
    2026-05-31 16:45:03.012  ERROR    [agent.py:88]           Tool failed  tool=write_file
                                                              Traceback ...

Set NO_COLOR=1 in env to disable ANSI codes (e.g. when piping logs to a file).
"""

import logging
import sys
import os
import traceback
from datetime import datetime


# ── ANSI palette ──────────────────────────────────────────────────────────────
_USE_COLOR = os.environ.get("NO_COLOR", "").strip() == "" and sys.stderr.isatty() or True

class _C:
    RESET   = "\x1b[0m"      if _USE_COLOR else ""
    BOLD    = "\x1b[1m"      if _USE_COLOR else ""
    DIM     = "\x1b[2m"      if _USE_COLOR else ""

    # levels
    DEBUG   = "\x1b[36m"     if _USE_COLOR else ""   # cyan
    INFO    = "\x1b[32m"     if _USE_COLOR else ""   # green
    WARNING = "\x1b[33m"     if _USE_COLOR else ""   # yellow
    ERROR   = "\x1b[31m"     if _USE_COLOR else ""   # red
    CRITICAL= "\x1b[35m"     if _USE_COLOR else ""   # magenta

    # accents
    TIME    = "\x1b[38;5;244m" if _USE_COLOR else ""  # gray-400
    BRACKET = "\x1b[38;5;240m" if _USE_COLOR else ""  # gray-600
    KEY     = "\x1b[38;5;75m"  if _USE_COLOR else ""  # light blue
    VAL     = "\x1b[38;5;222m" if _USE_COLOR else ""  # gold


_LEVEL_COLORS = {
    "DEBUG":    _C.DEBUG,
    "INFO":     _C.INFO,
    "WARNING":  _C.WARNING,
    "ERROR":    _C.ERROR,
    "CRITICAL": _C.CRITICAL,
}

_LEVEL_LABELS = {
    "DEBUG":    "DEBUG   ",
    "INFO":     "INFO    ",
    "WARNING":  "WARNING ",
    "ERROR":    "ERROR   ",
    "CRITICAL": "CRITICAL",
}


# ── Formatter ─────────────────────────────────────────────────────────────────
class _PrettyFormatter(logging.Formatter):
    """
    Format:
      2026-05-31 16:45:01.234  INFO     [auth.py:47]       User logged in  key=val  key2=val2
    """
    _LOC_WIDTH   = 26   # fixed width for [file:line] column
    _MSG_INDENT  = 2    # spaces before the message text

    def format(self, record: logging.LogRecord) -> str:
        # ── timestamp
        ts = datetime.fromtimestamp(record.created).strftime("%Y-%m-%d %H:%M:%S.") \
             + f"{record.msecs:03.0f}"
        ts_str = f"{_C.TIME}{ts}{_C.RESET}"

        # ── level
        lvl_name  = record.levelname
        lvl_color = _LEVEL_COLORS.get(lvl_name, "")
        lvl_label = _LEVEL_LABELS.get(lvl_name, lvl_name.ljust(8))
        lvl_str   = f"{lvl_color}{_C.BOLD}{lvl_label}{_C.RESET}"

        # ── source location [file:line]
        filename = record.filename          # e.g. "auth.py"
        lineno   = record.lineno
        loc_raw  = f"[{filename}:{lineno}]"
        loc_padded = loc_raw.ljust(self._LOC_WIDTH)
        loc_str  = f"{_C.BRACKET}{loc_padded}{_C.RESET}"

        # ── message
        msg = record.getMessage()
        msg_str = f"{_C.BOLD}{msg}{_C.RESET}"

        # ── extra kwargs (structured fields)
        # Any key=value pairs passed via `extra={"_kv": {...}}` or parsed from record
        kv_pairs = getattr(record, "_kv", {})
        kv_str = "  ".join(
            f"{_C.KEY}{k}{_C.RESET}={_C.VAL}{v}{_C.RESET}"
            for k, v in kv_pairs.items()
        )

        # ── assemble main line
        parts = [ts_str, " ", lvl_str, "  ", loc_str, " ", msg_str]
        if kv_str:
            parts += ["  ", kv_str]
        line = "".join(parts)

        # ── exception / traceback
        if record.exc_info:
            tb_lines = traceback.format_exception(*record.exc_info)
            tb_text  = "".join(tb_lines).rstrip()
            indent   = " " * (len(ts) + 2 + len(lvl_label) + 2 + self._LOC_WIDTH + 1)
            colored_tb = (
                f"\n{indent}{_C.ERROR}"
                + f"\n{indent}".join(tb_text.splitlines())
                + _C.RESET
            )
            line += colored_tb

        return line


# ── Adapter that supports keyword kwargs as structured fields ─────────────────
class _StructuredLogger(logging.LoggerAdapter):
    """
    Allows:   log.info("msg", user_id=123, email="x@y.com")
    Standard: log.info("msg")  — still works
    """
    def process(self, msg, kwargs):
        # Pull any extra keyword arguments out as structured KV pairs
        kv = {}
        log_kwargs = {}
        for k, v in list(kwargs.items()):
            if k in ("exc_info", "stack_info", "stacklevel", "extra"):
                log_kwargs[k] = v
            else:
                kv[k] = v

        extra = log_kwargs.pop("extra", {}) or {}
        extra["_kv"] = kv
        log_kwargs["extra"] = extra
        return msg, log_kwargs

    # convenience shortcuts
    def debug   (self, msg, **kw): super().debug   (msg, **kw)
    def info    (self, msg, **kw): super().info    (msg, **kw)
    def warning (self, msg, **kw): super().warning (msg, **kw)
    def error   (self, msg, **kw): super().error   (msg, **kw)
    def critical(self, msg, **kw): super().critical(msg, **kw)


# ── Root setup (call once at startup) ─────────────────────────────────────────
_configured = False

def configure_logging(level: str = "INFO") -> None:
    """
    Call this once in main.py lifespan.
    Replaces uvicorn's default log config with our pretty formatter.
    """
    global _configured
    if _configured:
        return
    _configured = True

    fmt = _PrettyFormatter()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(fmt)

    # Root logger
    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    root.handlers.clear()
    root.addHandler(handler)

    # Quiet down noisy third-party loggers
    for noisy in ("httpx", "httpcore", "urllib3", "asyncio", "watchfiles"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    # Keep uvicorn access logs but reformat them through our handler
    for uv in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        lg = logging.getLogger(uv)
        lg.handlers.clear()
        lg.addHandler(handler)
        lg.propagate = False


def get_logger(name: str) -> _StructuredLogger:
    """
    Return a structured pretty-logger for the given module.

    Usage:
        log = get_logger(__name__)
        log.info("Server started", host="0.0.0.0", port=1842)
    """
    base = logging.getLogger(name)
    return _StructuredLogger(base, extra={})
