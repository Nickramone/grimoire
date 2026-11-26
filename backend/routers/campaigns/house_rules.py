"""A campaign's house-rules switch (Nickramone fork).

Read by anyone at the table, so a player sees why their sheet's numbers moved;
flipped by the GM who owns the campaign, or an admin. The value lives in the
``house_rules_by_campaign`` app setting, see
``services.characters.house_rules``.
"""

from fastapi import Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...auth import CurrentUser, get_current_user
from ...config import get_db
from ...services.characters import house_rules as hr
from ._helpers import can_view, get_campaign_or_404


class HouseRulesOut(BaseModel):
    on: bool
    editable: bool


class HouseRulesUpdate(BaseModel):
    on: bool


def _may_edit(campaign, user: CurrentUser) -> bool:
    return campaign.owner_id == user.id or user.role == "admin"


def get_house_rules(
    campaign_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> HouseRulesOut:
    c = get_campaign_or_404(db, campaign_id)
    if not can_view(c, current_user, db):
        raise HTTPException(403, "Not a member of this campaign")
    return HouseRulesOut(on=hr.house_rules_on(db, c.id), editable=_may_edit(c, current_user))


def set_house_rules(
    campaign_id: str,
    data: HouseRulesUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> HouseRulesOut:
    c = get_campaign_or_404(db, campaign_id)
    if not _may_edit(c, current_user):
        raise HTTPException(403, "Only the campaign's GM can switch its house rules")
    hr.set_house_rules(db, c.id, data.on)
    db.commit()
    return HouseRulesOut(on=hr.house_rules_on(db, c.id), editable=True)
