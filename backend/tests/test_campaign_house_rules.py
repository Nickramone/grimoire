"""A campaign's house-rules switch, read by the sheet's ``from_campaign`` field.

The GM account owns the campaign and the player is at the table. The sheet's
``house`` field takes its value from the campaign: whatever the player stores,
the read shows the campaign's switch, and formulas work from it.
"""
import pytest

from backend.config import SessionLocal
from backend.models import AppSetting, Campaign, CampaignMember, Character
from backend.services.characters import house_rules as hr


SCHEMA = {
    "id": "house-rules-demo",
    "name": "House Rules Demo",
    "fields": {
        "house": {"type": "checkbox", "label": "House rules", "from_campaign": "house_rules"},
        "level": {"type": "number", "label": "Level", "default": 3},
    },
    "computed": {
        "bonus": {"label": "Bonus", "formula": "house ? level * 2 : level"},
    },
}


@pytest.fixture(autouse=True)
def _clean():
    yield
    db = SessionLocal()
    try:
        db.query(Character).delete()
        db.query(AppSetting).filter_by(key=hr.SETTING_KEY).delete()
        db.commit()
    finally:
        db.close()


@pytest.fixture
def sheets(client, admin_headers, gm_headers, player_headers):
    everyone = (admin_headers, gm_headers, player_headers)
    for headers in everyone:
        resp = client.post("/api/characters/schemas", json={"document": SCHEMA}, headers=headers)
        assert resp.status_code == 200, resp.text
    yield
    for headers in everyone:
        client.delete("/api/characters/schemas/house-rules-demo", headers=headers)


def _campaign(owner_id, *members, name="House Rules Table"):
    db = SessionLocal()
    try:
        campaign = Campaign(name=name, owner_id=owner_id)
        db.add(campaign)
        db.flush()
        for user_id in members:
            db.add(CampaignMember(campaign_id=campaign.id, user_id=user_id, status="accepted"))
        db.commit()
        return campaign.id
    finally:
        db.close()


@pytest.fixture
def table(gm_id, player_id):
    return _campaign(gm_id, player_id)


def _pc(client, player_headers, campaign_id=None):
    body = {"schema_ref": "house-rules-demo", "name": "Hero"}
    if campaign_id:
        body["campaign_id"] = campaign_id
    resp = client.post("/api/characters", json=body, headers=player_headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _read(client, headers, character_id):
    resp = client.get(f"/api/characters/{character_id}", headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _switch(client, headers, campaign_id, on):
    return client.put(f"/api/campaigns/{campaign_id}/house-rules", json={"on": on}, headers=headers)


def test_a_campaign_starts_without_house_rules(client, sheets, table, player_headers):
    pc = _read(client, player_headers, _pc(client, player_headers, table)["id"])
    assert pc["data"]["house"] is False
    assert pc["house_rules"] is False
    assert pc["computed"]["bonus"] == 3


def test_the_gm_switches_them_on_and_the_sheet_follows(
    client, sheets, table, gm_headers, player_headers
):
    pc_id = _pc(client, player_headers, table)["id"]
    resp = _switch(client, gm_headers, table, True)
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"on": True, "editable": True}

    pc = _read(client, player_headers, pc_id)
    assert pc["data"]["house"] is True
    assert pc["house_rules"] is True
    assert pc["computed"]["bonus"] == 6

    _switch(client, gm_headers, table, False)
    assert _read(client, player_headers, pc_id)["computed"]["bonus"] == 3


def test_players_read_the_switch_but_cannot_flip_it(
    client, sheets, table, gm_headers, player_headers
):
    _switch(client, gm_headers, table, True)
    resp = client.get(f"/api/campaigns/{table}/house-rules", headers=player_headers)
    assert resp.status_code == 200
    assert resp.json() == {"on": True, "editable": False}
    assert _switch(client, player_headers, table, False).status_code == 403


def test_outsiders_cannot_read_it(client, gm_id, gm_headers, admin_headers):
    lonely = _campaign(gm_id)
    from backend.tests.test_wiki_annotations import _user  # noqa: PLC0415

    _, outsider = _user(client, admin_headers)
    resp = client.get(f"/api/campaigns/{lonely}/house-rules", headers=outsider)
    assert resp.status_code in (403, 404)


def test_the_player_cannot_write_the_field(client, sheets, table, gm_headers, player_headers):
    pc_id = _pc(client, player_headers, table)["id"]
    resp = client.put(
        f"/api/characters/{pc_id}", json={"data": {"house": True, "level": 5}}, headers=player_headers
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["house"] is False
    assert resp.json()["data"]["level"] == 5
    db = SessionLocal()
    try:
        assert "house" not in (db.query(Character).filter_by(id=pc_id).first().data or {})
    finally:
        db.close()


def test_without_a_campaign_there_are_no_house_rules(client, sheets, player_headers):
    pc = _read(client, player_headers, _pc(client, player_headers)["id"])
    assert pc["data"]["house"] is False
    assert pc["computed"]["bonus"] == 3


def test_moving_to_another_table_recomputes(
    client, sheets, table, gm_id, gm_headers, player_id, player_headers
):
    other = _campaign(gm_id, player_id, name="Plain Table")
    pc_id = _pc(client, player_headers, table)["id"]
    _switch(client, gm_headers, table, True)
    assert _read(client, player_headers, pc_id)["computed"]["bonus"] == 6
    resp = client.put(f"/api/characters/{pc_id}", json={"campaign_id": other}, headers=player_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["computed"]["bonus"] == 3


@pytest.mark.parametrize(
    "definition, message",
    [
        ({"type": "checkbox", "from_campaign": "weather"}, "must be 'house_rules'"),
        ({"type": "number", "from_campaign": "house_rules"}, "must be a checkbox"),
    ],
)
def test_the_schema_checks_from_campaign(client, player_headers, definition, message):
    document = {"id": "bad-house", "name": "Bad", "fields": {"house": definition}}
    resp = client.post("/api/characters/schemas", json={"document": document}, headers=player_headers)
    assert resp.status_code == 400
    assert message in resp.text
