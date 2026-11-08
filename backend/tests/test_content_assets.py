"""Compendium images served from <library>/compendium/img."""
import os

import pytest

from backend.services.library_fs.paths import library_root

WEBP = b"RIFF\x1a\x00\x00\x00WEBPVP8 " + b"\x00" * 14


@pytest.fixture
def asset_dir():
    root = library_root() / "compendium" / "img" / "items" / "XDMG"
    root.mkdir(parents=True, exist_ok=True)
    (root / "Bag of Holding.webp").write_bytes(WEBP)
    (root / "evil.svg").write_text("<svg onload='alert(1)'/>")
    (library_root() / "compendium" / "secret.webp").write_bytes(WEBP)
    yield root


def test_serves_an_image_to_a_signed_in_user(client, player_headers, asset_dir):
    r = client.get("/api/content/assets/items/XDMG/Bag of Holding.webp", headers=player_headers)
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/webp"
    assert r.content == WEBP
    assert r.headers["cache-control"].startswith("private")


def test_needs_a_signed_in_user(client, asset_dir):
    r = client.get("/api/content/assets/items/XDMG/Bag of Holding.webp")
    assert r.status_code in (401, 403)


@pytest.mark.parametrize(
    "path",
    [
        "items/XDMG/missing.webp",
        "items/XDMG/evil.svg",
        "%2E%2E/secret.webp",
        "items/%2E%2E/%2E%2E/secret.webp",
        "..%2Fsecret.webp",
    ],
)
def test_refuses_anything_but_an_image_inside_the_folder(client, player_headers, asset_dir, path):
    r = client.get(f"/api/content/assets/{path}", headers=player_headers)
    assert r.status_code == 404


@pytest.mark.skipif(os.name == "nt", reason="symlinks need privileges on Windows")
def test_a_symlink_out_of_the_folder_is_refused(client, player_headers, asset_dir):
    (asset_dir / "link.webp").symlink_to(library_root() / "compendium" / "secret.webp")
    r = client.get("/api/content/assets/items/XDMG/link.webp", headers=player_headers)
    assert r.status_code == 404
