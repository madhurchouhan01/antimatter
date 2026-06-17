import pytest
from date_helper import parse_iso_date

def test_parse_simple_date():
    assert parse_iso_date("2026-06-16").year == 2026

def test_parse_datetime_with_t():
    # This will fail and throw a ValueError traceback in the terminal
    dt = parse_iso_date("2026-06-16T21:45:00")
    assert dt.hour == 21