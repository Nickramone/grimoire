"""Which compendium schema each library system's rules entries come from.

A library system (e.g. "D&D 5.5e") names the character schema whose rules
entries belong to it (e.g. "dnd-5e-2024"), so the edition chosen in the search
or the library also narrows the compendium. Kept as one app setting, a JSON map
``{system_id: schema_id}``, rather than a column: it is display-only, and an
unknown or deleted system id in it is simply never matched.
"""
import json

from sqlalchemy.orm import Session

from ..models import AppSetting
from .app_settings import set_raw

KEY = "compendium_schema_by_system"


def schema_by_system(db: Session) -> dict[str, str]:
    """The ``{system_id: schema_id}`` map; anything malformed is dropped."""
    row = db.query(AppSetting).filter_by(key=KEY).first()
    try:
        raw = json.loads(row.value) if row and row.value else {}
    except (ValueError, TypeError):
        return {}
    if not isinstance(raw, dict):
        return {}
    return {k: v for k, v in raw.items() if isinstance(k, str) and isinstance(v, str) and v}


def schema_for(db: Session, system_id: str) -> str:
    """The schema linked to one system, "" when none."""
    return schema_by_system(db).get(system_id, "")


def link(db: Session, system_id: str, schema_id: str) -> None:
    """Link a system to a schema, or unlink it with "". Does not commit."""
    links = schema_by_system(db)
    if schema_id:
        links[system_id] = schema_id
    else:
        links.pop(system_id, None)
    set_raw(db, KEY, json.dumps(links, sort_keys=True))
