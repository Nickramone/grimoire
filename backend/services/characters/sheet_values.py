"""Reading a stored sheet back out: its re-validated schema and its references.

The character endpoints and the GM screen's party overview both draw characters
from stored rows, so the two steps they share live here rather than in either
router: re-validating a schema document on the way out, and resolving the
catalog entries a character's references point at.
"""
import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from ...models import CharacterSchema, ContentEntry, Ruleset, RulesetEntry
from . import house_rules as hr
from . import rulesets as rs
from .schema import SchemaError, validate_schema

logger = logging.getLogger("grimoire.characters")

__all__ = ["validated_document", "resolved_entries", "reference_ids"]


def validated_document(row: CharacterSchema) -> dict:
    """Re-validate a stored document on the way out.

    A row edited directly in the database must be no more dangerous than an
    uploaded one — the rule `UserTheme` follows for colour tokens, and it counts
    for more here because a schema carries layout markup. A document that no
    longer validates yields an empty layout rather than raising, so the sheet
    degrades to its raw fields instead of 500ing.
    """
    try:
        return validate_schema(row.document or {})
    except SchemaError:
        logger.warning("Stored schema %s failed re-validation", row.schema_id)
        return {"id": row.schema_id, "name": row.name, "fields": {}, "layout": []}


_REF_TYPES = ("content_ref", "content_list")


def reference_ids(document: dict, data: dict) -> set[str]:
    """Every catalog entry id a character's references point at.

    That includes a reference held in a picked entry's per-entry fields - the
    base weapon chosen on a generic "+1 Weapon" - so a formula can read the
    base's own properties through `ref(row.base_weapon, 'damage_dice')`.
    """
    wanted: set[str] = set()
    for name, definition in ((document or {}).get("fields") or {}).items():
        if isinstance(definition, dict) and definition.get("type") in _REF_TYPES:
            _collect_ids(definition, (data or {}).get(name), wanted)
    return wanted


def _collect_ids(definition: dict, value: Any, wanted: set[str]) -> None:
    items = value if isinstance(value, list) else [value]
    per_refs = {
        key: per_definition
        for key, per_definition in (definition.get("per_entry_fields") or {}).items()
        if isinstance(per_definition, dict) and per_definition.get("type") in _REF_TYPES
    }
    for item in items:
        if not isinstance(item, dict):
            continue
        if not item.get("_inline"):
            entry_id = item.get("_ref")
            if isinstance(entry_id, str) and entry_id:
                wanted.add(entry_id)
        per = item.get("_per")
        if per_refs and isinstance(per, dict):
            for key, per_definition in per_refs.items():
                _collect_ids(per_definition, per.get(key), wanted)


def resolved_entries(
    db: Session,
    document: dict,
    data: dict,
    user_id: str,
    scope: Optional[hr.CharacterScope] = None,
) -> dict[str, Any]:
    """Catalog entries every reference in a character points at.

    Formulas like `sum_refs(spells, 'level')` need the entries themselves, not
    just their ids. Collected in one query rather than per reference: a sheet
    with twenty spells should cost one lookup.
    """
    wanted = reference_ids(document, data)

    if not wanted:
        return {}

    schema_id = document.get("id") or ""
    resolved = {
        row.entry_id: (row.data if isinstance(row.data, dict) else {})
        for row in db.query(ContentEntry)
        .filter(ContentEntry.schema_id == schema_id)
        .filter(ContentEntry.entry_id.in_(wanted))
        .all()
    }
    # Ruleset entries resolve the same way, so a formula reading a spell's
    # level does not care whether the spell came from a pack or a table's own
    # ruleset. For a character (``scope``), only its own campaign's rulesets,
    # and their rewrites win while the house rules are on.
    rows = (
        db.query(RulesetEntry, Ruleset)
        .join(Ruleset, Ruleset.id == RulesetEntry.ruleset_id)
        .filter(RulesetEntry.schema_id == schema_id)
        .filter(RulesetEntry.entry_id.in_(wanted))
        .filter(rs.readable_filter(db, user_id))
        .filter(hr.ruleset_scope(scope))
        .all()
    )
    return hr.merge_resolved(
        resolved, rows, lambda row: row.data if isinstance(row.data, dict) else {}, scope
    )
