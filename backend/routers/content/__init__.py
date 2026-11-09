"""Content catalog package — server-wide packs, browsed through a user's schema."""
from fastapi import APIRouter
from fastapi.responses import FileResponse

from ._schemas import (
    CatalogEntry,
    CatalogResponse,
    CompendiumEntryResponse,
    CompendiumResponse,
    CompendiumSchema,
    ContentTypeListResponse,
    PackListResponse,
    ResolveResponse,
)
from .assets import get_asset
from .compendium import browse_compendium, get_compendium_entry, list_compendium_schemas
from .core import (
    browse_content,
    reload_packs,
    get_entry,
    list_content_types,
    list_packs,
    resolve_entries,
)

router = APIRouter(prefix="/content", tags=["content"])

__all__ = ["router"]

# Literal segments before the /{schema_id} routes, so they are not swallowed.
router.add_api_route(
    "/assets/{asset_path:path}",
    get_asset,
    methods=["GET"],
    summary="A compendium image, for ruleset entry descriptions",
    response_class=FileResponse,
)
router.add_api_route(
    "/compendium",
    browse_compendium,
    methods=["GET"],
    summary="Browse every readable entry of a schema, across content types",
    response_model=CompendiumResponse,
)
# Two segments, like /{schema_id}/{content_type}: registered first for the same reason.
router.add_api_route(
    "/compendium/schemas",
    list_compendium_schemas,
    methods=["GET"],
    summary="The schemas with compendium content, with their linked library systems",
    response_model=list[CompendiumSchema],
)
# Three segments, like /{schema_id}/{content_type}/{entry_id}: registered first
# so "compendium" is never read as a schema id.
router.add_api_route(
    "/compendium/{content_type}/{entry_id}",
    get_compendium_entry,
    methods=["GET"],
    summary="One compendium entry, readable without a character sheet",
    response_model=CompendiumEntryResponse,
)
router.add_api_route(
    "/packs",
    list_packs,
    methods=["GET"],
    summary="List installed content packs",
    response_model=PackListResponse,
)
router.add_api_route(
    "/packs/reload",
    reload_packs,
    methods=["POST"],
    summary="Re-read content packs from disk (admin)",
    response_model=PackListResponse,
)
router.add_api_route(
    "/{schema_id}/types",
    list_content_types,
    methods=["GET"],
    summary="The content types a schema declares",
    response_model=ContentTypeListResponse,
)
router.add_api_route(
    "/{schema_id}/resolve",
    resolve_entries,
    methods=["GET"],
    summary="Resolve many entry references at once",
    response_model=ResolveResponse,
)
router.add_api_route(
    "/{schema_id}/{content_type}",
    browse_content,
    methods=["GET"],
    summary="Browse a content type",
    response_model=CatalogResponse,
)
router.add_api_route(
    "/{schema_id}/{content_type}/{entry_id}",
    get_entry,
    methods=["GET"],
    summary="One catalog entry",
    response_model=CatalogEntry,
)
