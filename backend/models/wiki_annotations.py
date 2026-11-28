"""Notes members leave on a wiki page without editing it.

A player who can only read a page - the GM's published lore, say - still wants
to jot something down against it: a suspicion, a question for the GM, a clue the
party found. An annotation is that note. It is stored beside the page, never in
its body, so writing one needs no edit right and a later rewrite of the page
(by its author, or by a tool that republishes it) leaves every note in place.

``visibility`` is who else reads it:

* ``self`` - its author only.
* ``gm`` - its author and the campaign's GM.
* ``party`` - everyone who can read the page (the default).

A server admin reads them all. The GM may hide a ``party`` note from the rest of
the party (``hidden_by_gm``); its author and the GM still see it, marked hidden.
An annotation follows its page: it is gone when the page is deleted, and nobody
but its author sees it while the page is not readable to them.

Fork-only: the table is created at startup (``db._ensure_fork_tables``), not by
an Alembic revision, so the migration history stays upstream's.
"""
import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, _utcnow, _uuid

ANNOTATION_VISIBILITIES = ("self", "gm", "party")


class WikiAnnotation(Base):
    """One member's note on a wiki page."""

    __tablename__ = "wiki_annotations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    page_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("wiki_pages.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # The author. Named user_id so the note goes with them when their account
    # is deleted and moves with them when it is merged (services/campaigns/user_data.py).
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    visibility: Mapped[str] = mapped_column(String(20), nullable=False, default="party")
    hidden_by_gm: Mapped[Optional[bool]] = mapped_column(Boolean, default=False)
    created_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)
