"""The compendium: every readable catalog entry of a schema, across content types.

The per-type browser (``/content/{schema_id}/{content_type}``) serves pickers on
a character sheet, which always know the type they want. Reading the rules is
different: a search for "fire" should find spells, items and feats at once. This
endpoint lists one schema's packs and readable rulesets together, optionally
narrowed to one type, with the per-type counts the category chips show.
"""
import re
from typing import Optional

from fastapi import Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from ...auth import CurrentUser, get_current_user
from ...config import get_db
from ...models import CharacterSchema, ContentEntry, Ruleset, RulesetEntry
from ...services.characters import rulesets as rs
from ...services.characters.user_schemas import compendium_schema_document
from . import _helpers as helpers
from .core import _catalog_rows

DEFAULT_PAGE_SIZE = 60


def _readable_schemas(db: Session, user_id: str) -> list[dict]:
    """Schemas with content this user can read, the largest first."""
    counts: dict[str, int] = {}
    for schema_id, count in (
        db.query(ContentEntry.schema_id, func.count(ContentEntry.id))
        .group_by(ContentEntry.schema_id)
        .all()
    ):
        counts[schema_id] = counts.get(schema_id, 0) + count
    for schema_id, count in (
        db.query(RulesetEntry.schema_id, func.count(RulesetEntry.id))
        .join(Ruleset, Ruleset.id == RulesetEntry.ruleset_id)
        .filter(rs.readable_filter(db, user_id))
        .group_by(RulesetEntry.schema_id)
        .all()
    ):
        counts[schema_id] = counts.get(schema_id, 0) + count

    names = {
        schema_id: name
        for schema_id, name in db.query(CharacterSchema.schema_id, CharacterSchema.name)
        .filter(CharacterSchema.schema_id.in_(list(counts)))
        .all()
    }
    schemas = [
        {"schema_id": schema_id, "name": names.get(schema_id, schema_id), "entry_count": count}
        for schema_id, count in counts.items()
    ]
    return sorted(schemas, key=lambda s: (-s["entry_count"], s["schema_id"]))


def _type_summary(name: str, definition: dict, count: int) -> dict:
    return {
        "name": name,
        "label": definition.get("label", name),
        "label_plural": definition.get("label_plural", ""),
        "icon": definition.get("icon", ""),
        "identity_field": definition.get("identity_field", "name"),
        "sort_default": definition.get("sort_default", []),
        "search_fields": definition.get("search_fields", []),
        "filter_fields": definition.get("filter_fields", []),
        "compact_display": definition.get("compact_display", ""),
        "fields": definition.get("fields", {}),
        "entry_count": count,
    }


def _name_match(entry, search: str) -> bool:
    """Whether every search term starts a word of the entry's name."""
    words = re.findall(r"[\w']+", (entry.name or "").lower())
    terms = re.findall(r"[\w']+", search.lower())
    return all(any(word.startswith(term) for word in words) for term in terms)


def browse_compendium(
    request: Request,
    schema_id: Optional[str] = None,
    content_type: Optional[str] = None,
    search: str = "",
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Browse the compendium: one schema, all or one content type, searchable.

    Without ``schema_id`` the schema with the most readable entries is used.
    Filters arrive as ``filter[field]=value`` and apply only with a content type.
    A search ranks entries whose name matches above those matching elsewhere.
    """
    schemas = _readable_schemas(db, current_user.id)
    known = {s["schema_id"] for s in schemas}
    if schema_id not in known:
        schema_id = schemas[0]["schema_id"] if schemas else None
    empty = {"schemas": schemas, "schema_id": schema_id, "page": 1, "page_size": page_size}
    if schema_id is None:
        return empty

    document = compendium_schema_document(db, current_user.id, schema_id) or {}
    definitions = document.get("content_types") or {}

    rows_by_type = {
        name: _catalog_rows(db, current_user.id, schema_id, name, include_rulesets=True)
        for name in sorted(definitions)
    }
    types = [
        _type_summary(name, definitions[name], len(rows))
        for name, rows in rows_by_type.items()
        if rows
    ]

    facets: dict = {}
    if content_type in rows_by_type:
        definition = definitions[content_type]
        entries = rows_by_type[content_type]
        facets = helpers.build_facets(entries, definition.get("filter_fields", []))
        filters = {
            key[7:-1]: value
            for key, value in request.query_params.items()
            if key.startswith("filter[") and key.endswith("]") and value
        }
        if filters:
            entries = [e for e in entries if helpers.matches_filters(e.data or {}, filters)]
    else:
        entries = [entry for rows in rows_by_type.values() for entry in rows]

    if search.strip():
        entries = [
            entry
            for entry in entries
            if helpers.matches_text(
                entry, search, definitions[entry.content_type].get("search_fields") or []
            )
        ]
        entries.sort(key=lambda e: (not _name_match(e, search), (e.name or "").lower()))
    elif content_type in rows_by_type:
        entries = helpers.sort_entries(
            entries, definitions[content_type].get("sort_default", [])
        )
    else:
        entries.sort(key=lambda e: ((e.name or "").lower(), e.content_type))

    total = len(entries)
    size = max(1, min(page_size, helpers.MAX_PAGE_SIZE))
    current = max(1, page)
    window = entries[(current - 1) * size : current * size]
    return {
        "schemas": schemas,
        "schema_id": schema_id,
        "content_types": types,
        "entries": [
            helpers.serialize_entry(entry, definitions[entry.content_type], omit_name=True) for entry in window
        ],
        "total": total,
        "page": current,
        "page_size": size,
        "filters_available": facets,
    }


def get_compendium_entry(
    content_type: str,
    entry_id: str,
    schema_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """One compendium entry with its type, for a link that opens it directly.

    Unlike ``/content/{schema_id}/{content_type}/{entry_id}`` this needs no
    character sheet installed, the same as the compendium list. When a pack and
    a ruleset both carry the id, the ruleset's copy wins: it is the one the
    server or the table chose to publish.
    """
    document = compendium_schema_document(db, current_user.id, schema_id) or {}
    definition = (document.get("content_types") or {}).get(content_type)
    if definition is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    rows = [
        row
        for row in _catalog_rows(db, current_user.id, schema_id, content_type, include_rulesets=True)
        if row.entry_id == entry_id
    ]
    if not rows:
        raise HTTPException(status_code=404, detail="Entry not found")
    rows.sort(key=lambda row: not row.ruleset)
    return {
        "entry": helpers.serialize_entry(rows[0], definition, omit_name=True),
        "content_type": _type_summary(content_type, definition, 1),
    }


def search_compendium(db: Session, user_id: str, query: str, limit: int) -> list[dict]:
    """Compendium entries matching a global search, every readable schema.

    For the global search page's Compendium section: the same matching as the
    compendium itself, a name match ranked above a match in the text, then by
    name. Each hit carries what a result row shows and links to.
    """
    if not re.findall(r"[\w']+", query):
        return []
    hits = []
    for schema in _readable_schemas(db, user_id):
        schema_id = schema["schema_id"]
        document = compendium_schema_document(db, user_id, schema_id) or {}
        for name, definition in sorted((document.get("content_types") or {}).items()):
            fields = definition.get("search_fields") or []
            for row in _catalog_rows(db, user_id, schema_id, name, include_rulesets=True):
                if helpers.matches_text(row, query, fields):
                    hits.append((not _name_match(row, query), (row.name or "").lower(),
                                 row, definition, schema))
    hits.sort(key=lambda hit: (hit[0], hit[1]))
    return [
        {
            "entry_id": row.entry_id,
            "name": row.name,
            "content_type": row.content_type,
            "type_label": definition.get("label", row.content_type),
            "schema_id": schema["schema_id"],
            "schema_name": schema["name"],
            "display": helpers.render_summary(definition.get("compact_display", ""), row.data or {}),
        }
        for _, _, row, definition, schema in hits[:limit]
    ]
