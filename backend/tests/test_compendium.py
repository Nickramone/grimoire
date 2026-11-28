"""Tests for the compendium: one schema's readable entries, across content types.

What matters is that it shows exactly what the caller may read (server and
campaign rulesets, never someone else's personal one), that a player without
the character sheet installed can still browse, and that search ranks a name
match above a match in the text.
"""
import datetime

import pytest

from backend.config import SessionLocal
from backend.models import (
    AppSetting,
    Campaign,
    CampaignMember,
    CharacterSchema,
    GameSystem,
    Ruleset,
    RulesetEntry,
)


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
            "compact_display": "{name} — level {level}",
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
        assert {
            "schema_id": "comp-demo",
            "name": "Compendium Demo",
            "entry_count": 4,
            "systems": [],
            "bestiary": False,
        } in body["schemas"]

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

    def test_the_summary_leaves_out_the_name(self, client, admin_headers, server_rules):
        body = _get(client, admin_headers, schema_id="comp-demo", content_type="spell",
                    search="fireball")
        assert body["entries"][0]["display"] == "level 3"

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
        assert hits[0]["display"] == "level 0"
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


@pytest.mark.parametrize("template, expected", [
    ("{name} — {school} {level}", "evocation 3"),
    ("{school} · {name}", "evocation"),
    ("{name}", ""),
    ("{school} {level}", "evocation 3"),
])
def test_render_summary_drops_the_name(template, expected):
    from backend.routers.content._helpers import render_summary
    data = {"name": "Fireball", "school": "evocation", "level": 3}
    assert render_summary(template, data) == expected


@pytest.fixture
def linked_systems():
    """An open and an admin-only system linked to the schema, one unlinked."""
    from backend.tests.conftest import make_game_system

    from backend.services import compendium_links

    made = {
        "open": make_game_system(name="Demo 2024"),
        "hidden": make_game_system(name="Demo Restricted", access_level="admin"),
        "other": make_game_system(name="Other Game"),
    }
    db = SessionLocal()
    try:
        compendium_links.link(db, made["open"].id, "comp-demo")
        compendium_links.link(db, made["hidden"].id, "comp-demo")
        db.commit()
    finally:
        db.close()
    yield {key: system.id for key, system in made.items()}
    db = SessionLocal()
    try:
        db.query(AppSetting).filter_by(key=compendium_links.KEY).delete()
        db.query(GameSystem).filter(GameSystem.id.in_([s.id for s in made.values()])).delete(
            synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


class TestLinkedSystems:
    def test_a_schema_lists_the_systems_the_caller_can_see(
        self, client, player_headers, admin_headers, server_rules, linked_systems
    ):
        player = _get(client, player_headers)["schemas"][0]["systems"]
        assert player == [{"id": linked_systems["open"], "name": "Demo 2024"}]
        admin = _get(client, admin_headers)["schemas"][0]["systems"]
        assert [s["name"] for s in admin] == ["Demo 2024", "Demo Restricted"]

    def test_the_schema_list_carries_them_too(
        self, client, player_headers, server_rules, linked_systems
    ):
        resp = client.get("/api/content/compendium/schemas", headers=player_headers)
        assert resp.status_code == 200, resp.text
        assert resp.json()[0]["schema_id"] == "comp-demo"
        assert resp.json()[0]["systems"][0]["id"] == linked_systems["open"]

    def test_search_hits_carry_the_systems(
        self, client, player_headers, server_rules, linked_systems
    ):
        hits = client.get("/api/search", params={"q": "fire"}, headers=player_headers).json()
        assert hits["compendium"][0]["game_systems"] == [
            {"id": linked_systems["open"], "name": "Demo 2024"}
        ]

    def test_a_system_filter_keeps_only_its_schema(
        self, client, player_headers, server_rules, linked_systems
    ):
        def search(system_id):
            resp = client.get(
                "/api/search", params={"q": "fire", "system_id": system_id}, headers=player_headers
            )
            return resp.json()["compendium"]

        assert len(search(linked_systems["open"])) == 3
        assert search(linked_systems["other"]) == []

    def test_a_gm_links_a_system_to_a_schema(self, client, gm_headers, linked_systems):
        system_id = linked_systems["other"]
        resp = client.patch(
            f"/api/systems/{system_id}", json={"compendium_schema_id": "comp-demo"}, headers=gm_headers
        )
        assert resp.status_code == 200, resp.text
        assert client.get(f"/api/systems/{system_id}", headers=gm_headers).json()[
            "compendium_schema_id"
        ] == "comp-demo"
        client.patch(f"/api/systems/{system_id}", json={"compendium_schema_id": ""}, headers=gm_headers)
        assert client.get(f"/api/systems/{system_id}", headers=gm_headers).json()[
            "compendium_schema_id"
        ] == ""


def test_a_malformed_link_setting_is_ignored():
    from backend.services import compendium_links

    db = SessionLocal()
    try:
        for value in ("not json", "[1, 2]", '{"sys": 3}'):
            compendium_links.set_raw(db, compendium_links.KEY, value)
            assert compendium_links.schema_by_system(db) == {}
        compendium_links.link(db, "sys", "comp-demo")
        assert compendium_links.schema_for(db, "sys") == "comp-demo"
        compendium_links.link(db, "sys", "")
        assert compendium_links.schema_for(db, "sys") == ""
    finally:
        db.rollback()
        db.close()


BESTIARY = {
    "id": "comp-demo-bestiary",
    "name": "Demo Bestiary",
    "content_types": {
        "monster": {
            "label": "Monster",
            "identity_field": "name",
            "search_fields": ["name"],
            "fields": {"name": {"type": "text", "label": "Name"}},
        }
    },
    "fields": {},
}


@pytest.fixture
def gm_bestiary(client, gm_headers, server_rules):
    """The GM's monsters, in a personal ruleset of a monsters-only schema."""
    client.post("/api/characters/schemas", json={"document": BESTIARY}, headers=gm_headers)
    resp = client.post(
        "/api/rulesets",
        json={"schema_id": "comp-demo-bestiary", "name": "Monsters", "personal": True},
        headers=gm_headers,
    )
    assert resp.status_code == 200, resp.text
    _entry(client, gm_headers, resp.json()["id"], "monster", name="Fire Giant")
    _entry(client, gm_headers, resp.json()["id"], "monster", name="Goblin")
    yield
    client.delete("/api/characters/schemas/comp-demo-bestiary", headers=gm_headers)


class TestBestiary:
    def test_the_bestiary_page_lists_only_bestiaries(self, client, gm_headers, gm_bestiary):
        body = _get(client, gm_headers, bestiary="true")
        assert [s["schema_id"] for s in body["schemas"]] == ["comp-demo-bestiary"]
        assert body["schemas"][0]["bestiary"] is True
        assert [e["name"] for e in body["entries"]] == ["Fire Giant", "Goblin"]

    def test_the_compendium_leaves_them_out(self, client, gm_headers, gm_bestiary):
        body = _get(client, gm_headers)
        assert [s["schema_id"] for s in body["schemas"]] == ["comp-demo"]
        assert _get(client, gm_headers, schema_id="comp-demo-bestiary")["schema_id"] == "comp-demo"
        schemas = client.get("/api/content/compendium/schemas", headers=gm_headers).json()
        assert [s["schema_id"] for s in schemas] == ["comp-demo"]

    def test_a_rules_edition_opens_its_bestiary(self, client, gm_headers, gm_bestiary):
        body = _get(client, gm_headers, bestiary="true", schema_id="comp-demo")
        assert body["schema_id"] == "comp-demo-bestiary"

    def test_it_follows_the_systems_of_its_rules_schema(
        self, client, gm_headers, gm_bestiary, linked_systems
    ):
        body = _get(client, gm_headers, bestiary="true")
        assert [s["name"] for s in body["schemas"][0]["systems"]] == ["Demo 2024"]

    def test_players_and_admins_see_no_bestiary(
        self, client, player_headers, admin_headers, gm_bestiary
    ):
        for headers in (player_headers, admin_headers):
            assert _get(client, headers, bestiary="true")["schemas"] == []
            resp = client.get(
                "/api/content/compendium/monster/goblin",
                params={"schema_id": "comp-demo-bestiary"},
                headers=headers,
            )
            assert resp.status_code == 404
            hits = client.get("/api/search", params={"q": "giant"}, headers=headers).json()
            assert hits["compendium"] == []

    def test_the_gm_finds_monsters_in_the_global_search(self, client, gm_headers, gm_bestiary):
        hits = client.get("/api/search", params={"q": "fire"}, headers=gm_headers).json()["compendium"]
        giant = next(h for h in hits if h["name"] == "Fire Giant")
        assert giant["bestiary"] is True
        assert giant["schema_id"] == "comp-demo-bestiary"
        assert all(not h["bestiary"] for h in hits if h["name"] != "Fire Giant")
