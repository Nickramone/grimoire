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
from dataclasses import dataclass
from typing import Any, Iterable, Optional

from sqlalchemy import or_, true
from sqlalchemy.orm import Session

from ...models import AppSetting, Ruleset

__all__ = [
    "SETTING_KEY",
    "SOURCES",
    "campaigns_with_house_rules",
    "house_rules_on",
    "set_house_rules",
    "derived_fields",
    "with_derived",
    "without_derived",
    "CharacterScope",
    "scope_for",
    "ruleset_scope",
    "replaces",
    "merge_resolved",
    "pick_catalog_rows",
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


# --- entries as one character sees them ---------------------------------
#
# A campaign ruleset rewrites a feat by keeping its entry id: the variant takes
# the original's place for the characters at that table while the house rules
# are on, so a feat picked before the switch reads the table's version at once,
# and the original again when the rules go off or the character moves. A
# character at a table only reads that campaign's rulesets, not those of every
# other table its player sits at.


@dataclass(frozen=True)
class CharacterScope:
    campaign_id: Optional[str]
    house_rules: bool


def scope_for(db: Session, character: Any) -> CharacterScope:
    campaign_id = getattr(character, "campaign_id", None) or None
    return CharacterScope(campaign_id=campaign_id, house_rules=house_rules_on(db, campaign_id))


def ruleset_scope(scope: Optional[CharacterScope]) -> Any:
    """A filter on ``Ruleset`` for one character at a table: server, personal,
    and that campaign's rulesets. A character in no campaign, and no character
    at all (the Compendium), keep every readable ruleset, as upstream."""
    if scope is None or not scope.campaign_id:
        return true()
    return or_(Ruleset.campaign_id.is_(None), Ruleset.campaign_id == scope.campaign_id)


def replaces(scope: Optional[CharacterScope], ruleset: Any) -> bool:
    """Whether a ruleset's entries take the place of same-id entries."""
    return bool(
        scope is not None
        and scope.house_rules
        and scope.campaign_id
        and getattr(ruleset, "campaign_id", None) == scope.campaign_id
    )


def merge_resolved(
    resolved: dict, rows: Iterable[tuple[Any, Any]], value: Any, scope: Optional[CharacterScope]
) -> dict:
    """Add ruleset entries to pack entries already resolved by id.

    ``rows`` are ``(RulesetEntry, Ruleset)`` pairs and ``value(entry)`` what to
    store. Pack entries win over ruleset ones, as upstream, except a campaign's
    rewrite while its house rules are on.
    """
    for entry, ruleset in rows:
        if replaces(scope, ruleset):
            resolved[entry.entry_id] = value(entry)
        else:
            resolved.setdefault(entry.entry_id, value(entry))
    return resolved


def pick_catalog_rows(rows: list, scope: Optional[CharacterScope]) -> list:
    """One character's catalog: a rewrite replaces its original, and with the
    house rules off a campaign's rewrites of pack entries are not offered.

    ``rows`` carry ``entry_id``, ``ruleset`` (bool) and ``ruleset_campaign_id``.
    """
    if scope is None or not scope.campaign_id:
        return rows
    def ours(row: Any) -> bool:
        return bool(row.ruleset) and getattr(row, "ruleset_campaign_id", None) == scope.campaign_id

    ours_ids = {row.entry_id for row in rows if ours(row)}
    if not ours_ids:
        return rows
    if scope.house_rules:
        return [row for row in rows if ours(row) or row.entry_id not in ours_ids]
    pack_ids = {row.entry_id for row in rows if not row.ruleset}
    return [row for row in rows if not (ours(row) and row.entry_id in pack_ids)]
