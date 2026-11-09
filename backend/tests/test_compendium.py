"""Tests for the compendium: one schema's readable entries, across content types.

What matters is that it shows exactly what the caller may read (server and
campaign rulesets, never someone else's personal one), that a player without
the character sheet installed can still browse, and that search ranks a name
match above a match in the text.
"""
import datetime

import pytest

from backend.config import SessionLocal
from backend.models import Campaign, CampaignMember, CharacterSchema, Ruleset, RulesetEntry


SCHEMA = {
    "id": "comp-demo",
    "name": "Compendium Demo",
    "content_types": {
        "spell": {
            "label": "Spell",
            "identity_field": "name",
            "search_fields": ["name", "description"],
            "filter_fields": ["level"],
            "sort_default": ["level", "name"],
            "fields": {
                "name": {"type": "text", "label": "Name"},
                "level": {"type": "number", "label": "Level"},
                "description": {"type": "text", "label": "Description"},
            },
        },
        "item": {
            "label": "Item",
            "identity_field": "name",
            "search_fields": ["name", "description"],
            "fields": {
                "name": {"type": "text", "label": "Name"},
                "description": {"type": "text", "label": "Description"},
            },
        },
        "monster": {
            "label": "Monster",
            "identity_field": "name",
            "fields": {"name": {"type": "text", "label": "Name"}},
        },
    },
    "fields": {},
}


@pytest.fixture(autouse=True)
def _clean():
    yield
    db = SessionLocal()
    try:
        db.query(RulesetEntry).delete()
        db.query(Ruleset).delete()
        db.commit()
    finally:
        db.close()


@pytest.fixture
def schema(client, admin_headers, gm_headers):
    """Installed by the admin and the GM only: the player has no sheet."""
    for headers in (admin_headers, gm_headers):
        client.post("/api/characters/schemas", json={"document": SCHEMA}, headers=headers)
    yield
    for headers in (admin_headers, gm_headers):
        client.delete("/api/characters/schemas/comp-demo", headers=headers)


def _ruleset(client, headers, name, **extra):
    payload = {"schema_id": "comp-demo", "name": name}
    payload.update(extra)
    resp = client.post("/api/rulesets", json=payload, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def _entry(client, headers, ruleset_id, content_type, **data):
    resp = client.post(
        f"/api/rulesets/{ruleset_id}/entries",
        json={"content_type": content_type, "data": data},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text


@pytest.fixture
def server_rules(client, admin_headers, schema):
    rid = _ruleset(client, admin_headers, "Core")
    _entry(client, admin_headers, rid, "spell", name="Fireball", level=3,
           description="A bright streak flashes.")
    _entry(client, admin_headers, rid, "spell", name="Shield", level=1,
           description="An invisible barrier of magical force.")
    _entry(client, admin_headers, rid, "spell", name="Fire Bolt", level=0,
           description="You hurl a mote of fire.")
    _entry(client, admin_headers, rid, "item", name="Flame Tongue",
           description="Fire damage when you speak the command word.")
    return rid


def _get(client, headers, **params):
    resp = client.get("/api/content/compendium", params=params, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


class TestCompendium:
    def test_it_lists_every_type_with_its_count(self, client, admin_headers, server_rules):
        body = _get(client, admin_headers, schema_id="comp-demo")
        assert body["schema_id"] == "comp-demo"
        counts = {t["name"]: t["entry_count"] for t in body["content_types"]}
        # A type with no readable entries gets no chip.
        assert counts == {"spell": 3, "item": 1}
        assert body["total"] == 4
        # Without a type the list is alphabetical across types.
        assert [e["name"] for e in body["entries"]] == [
            "Fire Bolt", "Fireball", "Flame Tongue", "Shield"
        ]
        assert body["filters_available"] == {}

    def test_it_defaults_to_the_schema_with_content(self, client, admin_headers, server_rules):
        body = _get(client, admin_headers)
        assert body["schema_id"] == "comp-demo"
        assert {"schema_id": "comp-demo", "name": "Compendium Demo", "entry_count": 4} in body[
            "schemas"
        ]

    def test_one_type_sorts_by_its_default_and_offers_facets(
        self, client, admin_headers, server_rules
    ):
        body = _get(client, admin_headers, schema_id="comp-demo", content_type="spell")
        assert [e["name"] for e in body["entries"]] == ["Fire Bolt", "Shield", "Fireball"]
        assert {f["value"] for f in body["filters_available"]["level"]} == {"0", "1", "3"}

        filtered = client.get(
            "/api/content/compendium",
            params={"schema_id": "comp-demo", "content_type": "spell", "filter[level]": "3"},
            headers=admin_headers,
        ).json()
        assert [e["name"] for e in filtered["entries"]] == ["Fireball"]

    def test_search_ranks_name_matches_first(self, client, admin_headers, server_rules):
        body = _get(client, admin_headers, schema_id="comp-demo", search="fire")
        # Names starting with "fire" first, then the item that mentions fire.
        assert [e["name"] for e in body["entries"]] == ["Fire Bolt", "Fireball", "Flame Tongue"]

    def test_it_pages(self, client, admin_headers, server_rules):
        body = _get(client, admin_headers, schema_id="comp-demo", page=2, page_size=3)
        assert body["total"] == 4
        assert [e["name"] for e in body["entries"]] == ["Shield"]

    def test_a_player_without_the_sheet_still_reads_it(
        self, client, player_headers, server_rules
    ):
        body = _get(client, player_headers, schema_id="comp-demo")
        assert body["total"] == 4
        assert {t["name"] for t in body["content_types"]} == {"spell", "item"}

    def test_someone_elses_personal_ruleset_stays_out(
        self, client, gm_headers, player_headers, gm_id, server_rules
    ):
        # Personal rulesets are not created through the API any more, only
        # carried over from older versions, so this one goes in directly.
        db = SessionLocal()
        try:
            mine = Ruleset(owner_id=gm_id, schema_id="comp-demo", name="GM's notes")
            db.add(mine)
            db.flush()
            db.add(RulesetEntry(ruleset_id=mine.id, schema_id="comp-demo", content_type="monster",
                                entry_id="secret-dragon", name="Secret Dragon",
                                data={"name": "Secret Dragon"}))
            db.commit()
        finally:
            db.close()
        gm_body = _get(client, gm_headers, schema_id="comp-demo")
        player_body = _get(client, player_headers, schema_id="comp-demo")
        assert "Secret Dragon" in [e["name"] for e in gm_body["entries"]]
        assert "Secret Dragon" not in [e["name"] for e in player_body["entries"]]

    def test_a_campaign_ruleset_reaches_its_table_only(
        self, client, admin_headers, gm_headers, player_headers, gm_id, player_id, server_rules
    ):
        db = SessionLocal()
        try:
            campaign = Campaign(name="Table", owner_id=gm_id)
            db.add(campaign)
            db.flush()
            db.add(CampaignMember(campaign_id=campaign.id, user_id=player_id, status="accepted"))
            db.commit()
            campaign_id = campaign.id
        finally:
            db.close()
        rid = _ruleset(client, gm_headers, "Table rules", campaign_id=campaign_id)
        _entry(client, gm_headers, rid, "item", name="Table Relic")
        assert "Table Relic" in [
            e["name"] for e in _get(client, player_headers, search="relic")["entries"]
        ]
        assert "Table Relic" not in [
            e["name"] for e in _get(client, admin_headers, search="relic")["entries"]
        ]

    def test_nothing_readable_is_an_empty_compendium(self, client, player_headers):
        body = _get(client, player_headers, schema_id="nope")
        assert body["entries"] == []
        assert body["total"] == 0


class TestCompendiumEntry:
    def test_a_player_without_the_sheet_opens_an_entry(
        self, client, player_headers, server_rules
    ):
        resp = client.get(
            "/api/content/compendium/spell/fireball",
            params={"schema_id": "comp-demo"},
            headers=player_headers,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["entry"]["name"] == "Fireball"
        assert body["content_type"]["name"] == "spell"
        assert "level" in body["content_type"]["fields"]

    def test_an_unknown_entry_or_type_is_404(self, client, player_headers, server_rules):
        for path in ("/api/content/compendium/spell/nope", "/api/content/compendium/nope/fireball"):
            resp = client.get(path, params={"schema_id": "comp-demo"}, headers=player_headers)
            assert resp.status_code == 404


class TestCompendiumSchemaFallback:
    def test_a_broken_copy_is_skipped_for_a_valid_one(
        self, client, player_headers, player_id, server_rules
    ):
        """The player's own copy is unreadable, so the newest valid one stands in."""
        db = SessionLocal()
        try:
            db.add(CharacterSchema(user_id=player_id, schema_id="comp-demo", name="Broken",
                                   document={"broken": True},
                                   updated_at=datetime.datetime(2999, 1, 1)))
            db.commit()
        finally:
            db.close()
        try:
            body = _get(client, player_headers, schema_id="comp-demo", content_type="spell")
            assert body["total"] == 3
        finally:
            db = SessionLocal()
            try:
                db.query(CharacterSchema).filter_by(user_id=player_id, schema_id="comp-demo").delete()
                db.commit()
            finally:
                db.close()

    def test_a_schema_nobody_installed_has_no_entries(self, client, player_headers):
        resp = client.get(
            "/api/content/compendium/spell/fireball",
            params={"schema_id": "nobody-has-it"},
            headers=player_headers,
        )
        assert resp.status_code == 404


class TestGlobalSearch:
    def test_the_search_page_lists_compendium_entries(
        self, client, player_headers, server_rules
    ):
        resp = client.get("/api/search", params={"q": "fire"}, headers=player_headers)
        assert resp.status_code == 200, resp.text
        hits = resp.json()["compendium"]
        assert [h["name"] for h in hits] == ["Fire Bolt", "Fireball", "Flame Tongue"]
        assert hits[0]["content_type"] == "spell"
        assert hits[0]["type_label"] == "Spell"
        assert hits[0]["schema_id"] == "comp-demo"
        assert hits[0]["schema_name"] == "Compendium Demo"
        assert resp.json()["total"] >= 3

    def test_it_honours_the_limit(self, client, player_headers, server_rules):
        resp = client.get("/api/search", params={"q": "fire", "limit": 2}, headers=player_headers)
        assert len(resp.json()["compendium"]) == 2

    def test_a_metadata_search_leaves_it_out(self, client, player_headers, server_rules):
        resp = client.get("/api/search", params={"q": "title:fire"}, headers=player_headers)
        assert resp.json()["compendium"] == []

    def test_a_book_scoped_search_leaves_it_out(self, client, player_headers, server_rules):
        resp = client.get(
            "/api/search", params={"q": "fire", "book_id": "any"}, headers=player_headers
        )
        assert resp.json()["compendium"] == []
