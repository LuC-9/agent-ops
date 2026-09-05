from app.tools import classify_intent, retrieve_evidence, scan_code


def test_sql_injection_maps_cwe_89():
    findings = scan_code('db.execute(f"SELECT * FROM users WHERE id={id}")')
    assert any(f["cwe"] == "CWE-89" for f in findings)


def test_billing_intent():
    assert classify_intent("I want a refund on this invoice") == "billing"


def test_retriever_returns_source_ids():
    hits = retrieve_evidence("langgraph checkpointer vs store")
    assert hits
    assert all(h.source_id for h in hits)
