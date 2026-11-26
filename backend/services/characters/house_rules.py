"""House rules per campaign: a switch the campaign holds, not the player.

A table plays its own rules - a rewritten feat, an exhaustion that bites
differently - and a sheet built on those rules has to know whether its
character is at that table. The switch lives with the campaign, so a player
never flips it themselves: they choose the campaign, and the campaign decides.

A sheet field declares that its value comes from here with
``"from_campaign": "house_rules"``. Its stored value is never read: the
campaign's switch takes its place on every read, and a write to it is dropped,
so moving the character to another table - or the GM switching the rules off -
recomputes the sheet at once without rewriting anything the player chose.

The switches are kept in one app setting, ``house_rules_by_campaign``, a JSON
object of campaign id to ``true``. A campaign that is not in it, or a character
in no campaign, plays without house rules.
"""

from __future__ import annotations

import json
from typing import Any, Optional

from sqlalchemy.orm import Session

from ...models import AppSetting

__all__ = [
    "SETTING_KEY",
    "SOURCES",
    "campaigns_with_house_rules",
    "house_rules_on",
    "set_house_rules",
    "derived_fields",
    "with_derived",
    "without_derived",
]

SETTING_KEY = "house_rules_by_campaign"

#: What a field's ``from_campaign`` may name.
SOURCES = frozenset({"house_rules"})


def campaigns_with_house_rules(db: Session) -> set[str]:
    """Every campaign id whose house rules are on."""
    row = db.query(AppSetting).filter_by(key=SETTING_KEY).first()
    if not row or not row.value:
        return set()
    try:
        value = json.loads(row.value)
    except (TypeError, ValueError):
        return set()
    if not isinstance(value, dict):
        return set()
    return {str(key) for key, on in value.items() if on is True}


def house_rules_on(db: Session, campaign_id: Optional[str]) -> bool:
    return bool(campaign_id) and campaign_id in campaigns_with_house_rules(db)


def set_house_rules(db: Session, campaign_id: str, on: bool) -> None:
    """Switch one campaign's house rules; the caller commits."""
    current = campaigns_with_house_rules(db)
    if on:
        current.add(campaign_id)
    else:
        current.discard(campaign_id)
    value = json.dumps({key: True for key in sorted(current)})
    row = db.query(AppSetting).filter_by(key=SETTING_KEY).first()
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=SETTING_KEY, value=value))


def derived_fields(document: Optional[dict]) -> dict[str, str]:
    """Field name to what it is taken from, for every ``from_campaign`` field."""
    out: dict[str, str] = {}
    for name, definition in ((document or {}).get("fields") or {}).items():
        if isinstance(definition, dict) and definition.get("from_campaign") in SOURCES:
            out[name] = definition["from_campaign"]
    return out


def with_derived(
    db: Optional[Session], document: Optional[dict], data: Any, campaign_id: Optional[str]
) -> dict:
    """``data`` with every ``from_campaign`` field set from the campaign.

    A copy: the stored values are left as they are.
    """
    values = dict(data) if isinstance(data, dict) else {}
    fields = derived_fields(document)
    if not fields:
        return values
    on = house_rules_on(db, campaign_id) if db is not None else False
    for name in fields:
        values[name] = on
    return values


def without_derived(document: Optional[dict], submitted: Any) -> dict:
    """A client's patch with the campaign's fields taken out."""
    values = dict(submitted) if isinstance(submitted, dict) else {}
    for name in derived_fields(document):
        values.pop(name, None)
    return values
