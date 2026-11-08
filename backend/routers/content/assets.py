"""Compendium images: files under ``<library>/compendium/img`` for entry descriptions.

A ruleset entry's Markdown can show an image (an item's illustration, a
monster's portrait) by linking ``/api/content/assets/<path>``. The folder sits
beside the library's sections rather than inside one, so the scanner leaves it
alone, and only images are served from it - no SVG, which can carry script.
"""
from fastapi import Depends, HTTPException

from ...auth import CurrentUser, get_current_user
from ...services.library_fs.paths import library_root
from .._user_files import serve_user_file

ASSET_DIR = ("compendium", "img")
IMAGE_EXTS = {".webp", ".png", ".jpg", ".jpeg", ".gif", ".avif"}
# Images are fixed once converted; a day's private cache spares re-fetching
# every illustration each time an entry is reopened.
CACHE = {"Cache-Control": "private, max-age=86400"}


def get_asset(asset_path: str, current_user: CurrentUser = Depends(get_current_user)):
    """One compendium image, for any signed-in user."""
    root = library_root().joinpath(*ASSET_DIR).resolve()
    cleaned = asset_path.replace("\\", "/")
    if "\x00" in cleaned or cleaned.startswith("/"):
        raise HTTPException(404, "Not found")
    candidate = (root / cleaned).resolve()
    # Resolved on both sides, so neither ``..`` nor a symlink leads out of the folder.
    if (
        not candidate.is_relative_to(root)
        or candidate.suffix.lower() not in IMAGE_EXTS
        or not candidate.is_file()
    ):
        raise HTTPException(404, "Not found")
    return serve_user_file(str(candidate), headers=CACHE)
