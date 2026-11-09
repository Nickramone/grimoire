"""The character sheet schemas each user has installed."""
from typing import Optional

from sqlalchemy.orm import Session

from ...models import CharacterSchema
from . import schema as svc


def user_schema_document(db: Session, user_id: str, schema_id: str) -> Optional[dict]:
    """The calling user's copy of a schema, validated.

    Schemas are per user, so the catalog is described by *this* user's copy —
    two people may have different versions of the same sheet installed, and each
    should browse the content types their own copy declares.
    """
    row = (
        db.query(CharacterSchema)
        .filter_by(user_id=user_id, schema_id=schema_id)
        .first()
    )
    if not row:
        return None
    try:
        return svc.validate_schema(row.document or {})
    except svc.SchemaError:
        return None


def compendium_schema_document(db: Session, user_id: str, schema_id: str) -> Optional[dict]:
    """The schema that describes the compendium for this user.

    The caller's own copy when they have one, as everywhere else in the catalog.
    Reading the compendium should not require installing a character sheet,
    though — a player browsing the rules may never make a character — so
    without one the most recently updated copy on the server stands in.
    """
    document = user_schema_document(db, user_id, schema_id)
    if document is not None:
        return document
    rows = (
        db.query(CharacterSchema)
        .filter_by(schema_id=schema_id)
        .order_by(CharacterSchema.updated_at.desc())
        .all()
    )
    for row in rows:
        try:
            return svc.validate_schema(row.document or {})
        except svc.SchemaError:
            continue
    return None
