"""Which characters a user may read: shared by the character and content routers."""
from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..models import Character
from ..services.characters import rulesets as rs


def readable_filter(db: Session, user_id: str):
    """Characters this user may read: their own, plus their parties' sheets.

    Reading a party member's sheet is the point of scoping a character to a
    campaign — a GM should be able to see what their players are playing.
    Writing stays with the owner, checked separately, because the sheet belongs
    to the person who wrote it.
    """
    campaigns = rs.campaign_ids_for(db, user_id)
    arms = [Character.user_id == user_id]
    if campaigns:
        arms.append(Character.campaign_id.in_(campaigns))
    return or_(*arms)


def readable_character_or_404(db: Session, character_id: str, user_id: str) -> Character:
    row = (
        db.query(Character)
        .filter(Character.id == character_id)
        .filter(readable_filter(db, user_id))
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Character not found")
    return row
