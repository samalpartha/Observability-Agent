"""
Minimal console: prompt for question and filters; print findings, evidence links, fix recommendations, confidence.
"""
import os
import sys

# Project root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx


def main() -> None:
    base = os.environ.get("COPILOT_URL", "http://127.0.0.1:8000")
    print("Agentic Observability Copilot – minimal console")
    print("(Ensure the API is running: uvicorn app.main:app --reload)\n")
    question = input("Question (e.g. 'Why is checkout slow?'): ").strip()
    if not question:
        print("No question entered. Exiting.")
        return
    service = input("Service filter (optional): ").strip() or None
    env = input("Env filter (optional): ").strip() or None
    body = {"question": question, "service": service, "env": env}
    try:
        r = httpx.post(f"{base}/debug", json=body, timeout=60.0)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        print(f"Request failed: {e}")
        return
    print("\n--- Findings ---")
    for i, f in enumerate((data.get("findings") or [])[:10], 1):
        print(f"  {i}. {f.get('message', f)[:120]}...")
        for link in (f.get("links") or [])[:3]:
            print(f"      -> {link.get('label')}: {link.get('url', '')[:80]}...")
    print("\n--- Root cause candidates ---")
    for c in data.get("root_cause_candidates") or []:
        print(f"  - {c}")
    print("\n--- Proposed fixes ---")
    for fix in data.get("proposed_fixes") or []:
        print(f"  - {fix.get('action', fix)} (risk: {fix.get('risk_level', 'N/A')})")
    print(f"\n--- Confidence: {data.get('confidence', 0):.2f} ---")
    for reason in data.get("confidence_reasons") or []:
        print(f"  - {reason}")
    print("\n--- Evidence links ---")
    for link in (data.get("evidence_links") or [])[:5]:
        print(f"  {link.get('label')}: {link.get('url', '')[:90]}...")


if __name__ == "__main__":
    main()
