from app.rag.chat import answer_question
from app.rag.eval_set import EVAL_CASES
import time

def check(case: dict, answer: str) -> tuple[bool, str]:
    answer_lower = answer.lower()
    for phrase in case.get("must_contain", []):
        if phrase.lower() not in answer_lower:
            return False, f"missing expected phrase: '{phrase}'"
    for phrase in case.get("must_not_contain", []):
        if phrase.lower() in answer_lower:
            return False, f"contains forbidden phrase: '{phrase}'"
    if "any_of" in case:
        if not any(p.lower() in answer_lower for p in case["any_of"]):
            return False, f"none of the expected phrases found: {case['any_of']}"
    return True, ""


def main():
    passed = 0
    for case in EVAL_CASES:
        answer = answer_question(case["question"])
        time.sleep(30)  # Wait 30 seconds between requests to avoid rate limiting
        ok, reason = check(case, answer)
        status = "PASS" if ok else "FAIL"
        print(f"[{status}] {case['question']}")
        if not ok:
            print(f"       reason: {reason}")
            print(f"       answer: {answer}")
        passed += ok

    print(f"\n{passed}/{len(EVAL_CASES)} passed")


if __name__ == "__main__":
    main()
