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
from ...models import CharacterSchema, ContentEntry, GameSystem, Ruleset, RulesetEntry
from ...services import access_control, compendium_links
from ...services.characters import rulesets as rs
from ...services.characters.user_schemas import compendium_schema_document
from . import _helpers as helpers
from .core import _catalog_rows

DEFAULT_PAGE_SIZE = 60

#: The suffix that ties a bestiary schema to the rules schema of its edition:
#: ``dnd-5e-2024-bestiary`` follows the library systems linked to ``dnd-5e-2024``.
BESTIARY_SUFFIX = "-bestiary"


def is_bestiary(document: dict) -> bool:
    """Whether a schema is a bestiary: it declares monsters and nothing else.

    A bestiary is the GM's reference, kept apart from the rules everyone reads:
    it has its own page and its entries live in a personal ruleset, so only the
    GM who imported them can read them.
    """
    return set(document.get("content_types") or {}) == {"monster"}


def _linked_systems(db: Session, user) -> dict[str, list[dict]]:
    """The library systems each schema is linked to, those the user can see.

    A system names its compendium schema (see ``services.compendium_links``), so
    the edition chosen in the library or in the search can narrow the compendium.
    """
    schema_of = compendium_links.schema_by_system(db)
    if not schema_of:
        return {}
    query = db.query(GameSystem.id, GameSystem.name).filter(GameSystem.id.in_(list(schema_of)))
    linked: dict[str, list[dict]] = {}
    for system_id, name in access_control.visible_systems(db, query, user).order_by(GameSystem.name):
        linked.setdefault(schema_of[system_id], []).append({"id": system_id, "name": name})
    return linked


def _readable_schemas(db: Session, user) -> list[dict]:
    """Schemas with content this user can read, the largest first.

    Each carries the library systems linked to it, see ``_linked_systems``,
    and whether it is a bestiary, see ``is_bestiary``.
    """
    user_id = user.id
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
    linked = _linked_systems(db, user)
    schemas = []
    for schema_id, count in counts.items():
        bestiary = is_bestiary(compendium_schema_document(db, user_id, schema_id) or {})
        # A bestiary follows the edition of its rules schema, see BESTIARY_SUFFIX.
        edition = schema_id.removesuffix(BESTIARY_SUFFIX) if bestiary else schema_id
        schemas.append(
            {
                "schema_id": schema_id,
                "name": names.get(schema_id, schema_id),
                "entry_count": count,
                "systems": linked.get(edition, []),
                "bestiary": bestiary,
            }
        )
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
    bestiary: bool = False,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Browse the compendium: one schema, all or one content type, searchable.

    The compendium page lists the rules schemas, the bestiary page (``bestiary``)
    the bestiaries. A rules ``schema_id`` asked of the bestiary opens the
    bestiary of that edition, so both pages follow one edition choice.
    Without ``schema_id`` the schema with the most readable entries is used.
    Filters arrive as ``filter[field]=value`` and apply only with a content type.
    A search ranks entries whose name matches above those matching elsewhere.
    """
    schemas = [
        s
        for s in _readable_schemas(db, access_control.load_user(db, current_user))
        if s["bestiary"] == bestiary
    ]
    known = {s["schema_id"] for s in schemas}
    if bestiary and schema_id not in known and f"{schema_id}{BESTIARY_SUFFIX}" in known:
        schema_id = f"{schema_id}{BESTIARY_SUFFIX}"
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


def list_compendium_schemas(
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The rules schemas with compendium content, for choosing a system's edition.

    Bestiaries are left out: one follows its rules schema, see BESTIARY_SUFFIX.
    """
    return [
        s
        for s in _readable_schemas(db, access_control.load_user(db, current_user))
        if not s["bestiary"]
    ]


def search_compendium(
    db: Session, user, query: str, limit: int, system_id: Optional[str] = None
) -> list[dict]:
    """Compendium entries matching a global search, every readable schema.

    For the global search page's Compendium section: the same matching as the
    compendium itself, a name match ranked above a match in the text, then by
    name. Each hit carries what a result row shows and links to, and the
    library systems of its schema, so the page's system filter applies to it.
    Bestiary entries come too, flagged, for the reader who can see them.
    With ``system_id`` only the schemas linked to that system are searched.
    """
    if not re.findall(r"[\w']+", query):
        return []
    user_id = user.id
    hits = []
    for schema in _readable_schemas(db, user):
        if system_id and not any(s["id"] == system_id for s in schema["systems"]):
            continue
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
            "game_systems": schema["systems"],
            "bestiary": schema["bestiary"],
            "display": helpers.render_summary(definition.get("compact_display", ""), row.data or {}),
        }
        for _, _, row, definition, schema in hits[:limit]
    ]
