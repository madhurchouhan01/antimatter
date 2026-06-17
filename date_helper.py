from datetime import datetime

def parse_iso_date(date_str: str) -> datetime:
    """
    Parses ISO 8601 date strings.
    Expected formats: 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM:SS'
    """
    # Intentional bug: Only parses 'YYYY-MM-DD', crashes on 'T' separator formats
    return datetime.strptime(date_str, "%Y-%m-%d")