"""Annotation endpoint handlers: members' notes on a wiki page.

Anyone who can read a page may annotate it - no edit right is needed, since the
note is stored beside the page and never touches its body. That is the point: a
player can mark up the GM's read-only lore without being able to change it, and
a later rewrite of the page leaves the notes alone.

Who sees a note (``annotation_visible``):

* its author, always;
* a server admin, always;
* the GM, for ``gm`` and ``party`` notes;
* everyone who can read the page, for ``party`` notes the GM has not hidden.

Only the author edits or deletes a note. The GM (or an admin) may hide a
``party`` note from the rest of the party; it stays visible to its author and
the GM, marked hidden. A note nobody may see answers 404, never 403, so its
existence does not leak. Every read and write first requires the page itself
to be readable, so a page put back to GM-only takes its notes out of sight too.
"""

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from ...auth import CurrentUser, get_current_user
from ...config import get_db
from ...models import User, WikiAnnotation, WikiPage
from ...models.wiki_annotations import ANNOTATION_VISIBILITIES
from ._helpers import get_campaign_or_404
from ._schemas import WikiAnnotationCreate, WikiAnnotationUpdate
from ._wiki_helpers import can_view_page


def _is_gm(c, user: CurrentUser) -> bool:
    return c.owner_id == user.id


def _is_admin(user: CurrentUser) -> bool:
    return user.role == "admin"


def annotation_visible(a: WikiAnnotation, c, user: CurrentUser) -> bool:
    """Whether ``user`` may see ``a``, given they can already read its page."""
    if a.user_id == user.id or _is_admin(user):
        return True
    if a.visibility == "party":
        return not a.hidden_by_gm or _is_gm(c, user)
    if a.visibility == "gm":
        return _is_gm(c, user)
    return False  # self


def _can_hide(a: WikiAnnotation, c, user: CurrentUser) -> bool:
    return a.visibility == "party" and (_is_gm(c, user) or _is_admin(user))


def annotation_out(a: WikiAnnotation, c, user: CurrentUser, author) -> dict:
    return {
        "id": a.id,
        "page_id": a.page_id,
        "body": a.body or "",
        "visibility": a.visibility,
        "hidden_by_gm": bool(a.hidden_by_gm),
        "author_id": a.user_id,
        "author_name": (author.display_name or author.username) if author else None,
        "is_mine": a.user_id == user.id,
        "can_edit": a.user_id == user.id,
        "can_hide": _can_hide(a, c, user),
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "updated_at": a.updated_at.isoformat() if a.updated_at else None,
    }


def _readable_page(db: Session, campaign_id: str, page_id: str, user: CurrentUser):
    c = get_campaign_or_404(db, campaign_id)
    page = db.query(WikiPage).filter_by(id=page_id, campaign_id=campaign_id).first()
    if page is None or not can_view_page(page, c, user, db):
        raise HTTPException(404, "Page not found")
    return c, page


def _check_visibility(value: str) -> str:
    if value not in ANNOTATION_VISIBILITIES:
        raise HTTPException(400, "Invalid visibility")
    return value


def _clean_body(body: str) -> str:
    body = body.strip()
    if not body:
        raise HTTPException(400, "An annotation needs some text")
    return body


def _annotation_or_404(db: Session, c, page: WikiPage, annotation_id: str, user: CurrentUser):
    a = db.query(WikiAnnotation).filter_by(id=annotation_id, page_id=page.id).first()
    if a is None or not annotation_visible(a, c, user):
        raise HTTPException(404, "Annotation not found")
    return a


def _author(db: Session, a: WikiAnnotation):
    return db.query(User).filter_by(id=a.user_id).first()


def list_annotations(
    campaign_id: str,
    page_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c, page = _readable_page(db, campaign_id, page_id, current_user)
    rows = (
        db.query(WikiAnnotation)
        .filter_by(page_id=page.id)
        .order_by(WikiAnnotation.created_at, WikiAnnotation.id)
        .all()
    )
    visible = [a for a in rows if annotation_visible(a, c, current_user)]
    author_ids = {a.user_id for a in visible}
    authors = (
        {u.id: u for u in db.query(User).filter(User.id.in_(author_ids)).all()}
        if author_ids
        else {}
    )
    return [annotation_out(a, c, current_user, authors.get(a.user_id)) for a in visible]


def create_annotation(
    campaign_id: str,
    page_id: str,
    data: WikiAnnotationCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c, page = _readable_page(db, campaign_id, page_id, current_user)
    a = WikiAnnotation(
        page_id=page.id,
        user_id=current_user.id,
        body=_clean_body(data.body),
        visibility=_check_visibility(data.visibility or "party"),
        hidden_by_gm=False,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return annotation_out(a, c, current_user, _author(db, a))


def update_annotation(
    campaign_id: str,
    page_id: str,
    annotation_id: str,
    data: WikiAnnotationUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c, page = _readable_page(db, campaign_id, page_id, current_user)
    a = _annotation_or_404(db, c, page, annotation_id, current_user)
    is_author = a.user_id == current_user.id

    if (data.body is not None or data.visibility is not None) and not is_author:
        raise HTTPException(403, "Only its author can edit an annotation")
    if data.body is not None:
        a.body = _clean_body(data.body)
    if data.visibility is not None:
        a.visibility = _check_visibility(data.visibility)
    if data.hidden_by_gm is not None and bool(data.hidden_by_gm) != bool(a.hidden_by_gm):
        if not _can_hide(a, c, current_user):
            raise HTTPException(403, "Only the GM can hide a party annotation")
        a.hidden_by_gm = bool(data.hidden_by_gm)

    db.commit()
    db.refresh(a)
    return annotation_out(a, c, current_user, _author(db, a))


def delete_annotation(
    campaign_id: str,
    page_id: str,
    annotation_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c, page = _readable_page(db, campaign_id, page_id, current_user)
    a = _annotation_or_404(db, c, page, annotation_id, current_user)
    if a.user_id != current_user.id:
        raise HTTPException(403, "Only its author can delete an annotation")
    db.delete(a)
    db.commit()
