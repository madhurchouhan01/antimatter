from datetime import datetime

def parse_iso_date(date_str: str) -> datetime:
    """
    Parses ISO 8601 date strings.
    Expected formats: 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM:SS'
    """
    if "T" in date_str:
        return datetime.strptime(date_str, "%Y-%m-%dT%H:%M:%S")
    return datetime.strptime(date_str, "%Y-%m-%d")