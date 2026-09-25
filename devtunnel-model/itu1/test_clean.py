import copy
import unittest

import clean
import intake
from clean import (CleanConfig, SourceMutationError, check_immutable, clean as run_clean,
                   fingerprint_text, normalize_terms, segment, sidecar_integrity_errors, spans_cover)
from intake import CorpusIndex
from test_intake import BODY_A, BODY_B, rec

NOW = "2026-09-24T00:00:00Z"
TEMPLATE = "### Steps to reproduce\n\n{}\n\n### Expected behaviour\n\n- [ ] I searched existing issues\n"


def ready(r, stage="READY_FOR_LABELING"):
    r = copy.deepcopy(r)
    r["quality_status"]["collection_stage"] = stage
    return r


def go(r, cfg=None, index=None, stage="READY_FOR_LABELING"):
    return run_clean(ready(r, stage), cfg, index, now=NOW)


def stage_of(out):
    return out["quality_status"]["collection_stage"]


class SegmentTests(unittest.TestCase):
    def test_spans_partition_text(self):
        text = "intro\n```py\nx = 1\n```\nmid\n  at a.b (f.js:1:2)\n  at c.d (g.js:3:4)\nend\n"
        sp = segment(text)
        self.assertTrue(spans_cover(text, sp))
        self.assertEqual([s["type"] for s in sp], ["prose", "fenced_code", "prose", "stack_trace", "prose"])

    def test_unclosed_fence_is_typed_unclosed(self):
        sp = segment("a\n```\ncode")
        self.assertFalse(sp[-1]["closed"])

    def test_python_traceback(self):
        t = 'Traceback (most recent call last):\n  File "a.py", line 3, in f\n    x()\nValueError: boom\nafter\n'
        types = [s["type"] for s in segment(t)]
        self.assertEqual(types, ["stack_trace", "prose"])

    def test_empty_text(self):
        self.assertEqual(segment(""), [])
        self.assertTrue(spans_cover("", []))


class NormalizationTests(unittest.TestCase):
    def terms(self, text, labels=()):
        return normalize_terms([("body", text)], list(labels))

    def test_V1_tagged_fence_is_explicit(self):
        t = self.terms("```python\ndef f(): ...\n```")
        self.assertEqual([(x["canonical"], x["provenance_tag"], x["method"]) for x in t],
                         [("Python", "EXPLICIT", "exact_match")])

    def test_V2_untagged_go_is_inferred(self):
        t = self.terms("```\npackage main\n\nfunc main() {\n  x := 1\n}\n```")
        self.assertEqual((t[0]["canonical"], t[0]["provenance_tag"], t[0]["method"]),
                         ("Go", "MODEL_INFERRED", "syntax_inference"))
        self.assertLess(t[0]["confidence"], 1.0)

    def test_untagged_unclear_fence_is_unknown_not_guessed(self):
        t = self.terms("```\nfoo bar baz\n```")
        self.assertEqual(t[0]["provenance_tag"], "UNKNOWN")
        self.assertEqual(t[0]["canonical"], t[0]["raw"])

    def test_V3_go_the_verb_is_not_normalized(self):
        self.assertEqual(self.terms("just go get started with the guide"), [])

    def test_spec_8_1_examples(self):
        t = {x["raw"]: x for x in self.terms(
            "using pg with node 18 and psql 14.2, upgraded @octokit/rest last week")}
        self.assertEqual(t["pg"]["canonical"], "PostgreSQL")
        self.assertEqual(t["node 18"]["canonical"], "Node.js 18")
        self.assertEqual(t["psql"]["canonical"], "PostgreSQL")
        self.assertEqual(t["@octokit/rest"]["provenance_tag"], "EXPLICIT")

    def test_bare_node_is_not_nodejs(self):
        self.assertEqual(self.terms("the tree node is null"), [])

    def test_exact_name_is_explicit(self):
        t = self.terms("We use PostgreSQL and React here")
        self.assertTrue(all(x["provenance_tag"] == "EXPLICIT" for x in t))
        self.assertEqual({x["canonical"] for x in t}, {"PostgreSQL", "React"})

    def test_unknown_package_kept_as_own_canonical(self):
        t = self.terms("it breaks with `left-pad-ng` installed")
        self.assertEqual((t[0]["canonical"], t[0]["provenance_tag"]), ("left-pad-ng", "UNKNOWN"))

    def test_urls_are_not_scanned(self):
        self.assertEqual(self.terms("see https://example.com/postgres/react/docs"), [])

    def test_labels(self):
        t = self.terms("", ["Bug ", "bugfix", "weird-label"])
        self.assertEqual([(x["canonical"], x["provenance_tag"]) for x in t],
                         [("Bug", "EXPLICIT"), ("Bug", "MODEL_INFERRED")])

    def test_terminology(self):
        t = self.terms("Got an NPE after the OOM")
        self.assertEqual({x["canonical"] for x in t}, {"null pointer exception", "out of memory"})


class CleanPipelineTests(unittest.TestCase):
    def test_source_is_never_mutated_and_output_is_additive(self):
        r = ready(rec(body=BODY_A + "\n<!-- hidden -->\ntoken: Xk29!fjq02mzPq1x"), "REDACTION_HELD")
        snap = copy.deepcopy(r)
        out = run_clean(r, now=NOW)
        self.assertEqual(r, snap)
        self.assertEqual(out["input_core"], snap["input_core"])
        self.assertNotEqual(out["cleaning"]["cleaned_view"]["body"], out["input_core"]["body"])
        self.assertEqual(stage_of(out), "ANNOTATION_READY")

    def test_V4_stack_trace_preserved_verbatim(self):
        trace = ("java.lang.IllegalStateException: boom\n"
                 + "".join(f"\tat com.acme.Svc.m{i}(Svc.java:{10 + i})\n" for i in range(12)))
        out = go(rec(body="It crashes:\n" + trace + "\nAny idea what is happening here in production?"))
        view = out["cleaning"]["cleaned_view"]
        self.assertIn(trace, view["body"])
        self.assertIn("stack_trace", [s["type"] for s in view["spans"]["body"]])

    def test_V7_minimal_issue_kept(self):
        out = go(rec(title="Crash", body=""))
        self.assertEqual(stage_of(out), "ANNOTATION_READY")
        self.assertIn("minimal_content", out["quality_status"]["quality_flags"])

    def test_V8_tombstone_is_invalid(self):
        r = rec(title="", body="")
        r["input_core"]["is_tombstone"] = True
        out = go(r)
        self.assertEqual((stage_of(out), out["quality_status"]["exclusion_reason"]),
                         ("EXCLUDED", "invalid_content"))

    def test_empty_everything_is_invalid_but_title_only_is_not(self):
        self.assertEqual(stage_of(go(rec(title="  ", body=""))), "EXCLUDED")
        self.assertEqual(stage_of(go(rec(title="x", body=""))), "ANNOTATION_READY")

    def test_V9_low_confidence_secret_stays_excluded(self):
        out = go(rec(body=BODY_A + "\npassword: hunter2hunter"), stage="REDACTION_HELD")
        self.assertEqual((stage_of(out), out["quality_status"]["exclusion_reason"]),
                         ("EXCLUDED", "unresolved_redaction"))
        self.assertIsNone(out["cleaning"]["cleaned_view"])          # nothing half-redacted ships

    def test_V10_high_confidence_secret_redacted_in_place(self):
        body = "My config:\n  apiKey: sk_live_51Hn3k29fJ2mXaB9qZZZZ\n  dbHost: db.example.com\nNothing works with this key set."
        r = ready(rec(body=body), "REDACTION_HELD")
        out = run_clean(r, now=NOW)
        view = out["cleaning"]["cleaned_view"]["body"]
        self.assertIn("apiKey: <REDACTED_SECRET>\n  dbHost: db.example.com", view)
        self.assertNotIn("sk_live", view)
        self.assertIn("sk_live", out["input_core"]["body"])          # original untouched
        self.assertTrue(any(e["action"] == "redact_secret" for e in out["cleaning"]["transformation_log"]))

    def test_secrets_in_context_are_redacted_too(self):
        ctx = {"tier_3": {"config": ["db: postgres://admin:s3cretpw@db/x"], "fetched_at": "t"}, "max_tier_available": 3}
        out = go(rec(context_bundle=ctx), stage="REDACTION_HELD")
        cfgtxt = out["cleaning"]["cleaned_view"]["context"]["tier_3"]["config"][0]
        self.assertEqual(cfgtxt, "db: postgres://admin:<REDACTED_SECRET>@db/x")

    def test_url_secret_param_stripped_base_url_kept(self):
        out = go(rec(body=BODY_A + "\nsee https://x.io/api/v1/items?token=abcdef123456&page=2"))
        self.assertIn("https://x.io/api/v1/items?token=<REDACTED_SECRET>&page=2",
                      out["cleaning"]["cleaned_view"]["body"])

    def test_home_dir_username_masked_frames_kept(self):
        trace = "  at Db.save (/home/alice/app/src/db.js:42:19)\n  at run (/home/alice/app/src/run.js:8:1)\n"
        out = go(rec(body="fails:\n" + trace + "\nhappens on every save in my setup lately"))
        v = out["cleaning"]["cleaned_view"]["body"]
        self.assertIn("/home/<REDACTED_USER>/app/src/db.js:42:19", v)
        self.assertNotIn("alice", v)

    def test_mentions_pseudonymized_consistently_structure_preserved(self):
        body = ("@sara-eng confirmed this also happens on staging. @sara-eng, can you check if it's the "
                "same root cause as #482? cc @bob and @octokit/rest maintainers, mail bob@corp.com")
        r = rec(body=body, comments=[{"author_role": "maintainer", "body": "thanks @Sara-Eng and @bob", "created_at": "x"}])
        out = go(r)
        v = out["cleaning"]["cleaned_view"]
        self.assertIn("@user_1 confirmed", v["body"])
        self.assertIn("@user_1, can you check if it's the same root cause as #482?", v["body"])
        self.assertIn("cc @user_2 and @octokit/rest maintainers", v["body"])
        self.assertIn("<REDACTED_EMAIL>", v["body"])
        self.assertEqual(v["comments"][0]["body"], "thanks @user_1 and @user_2")   # stable across fields

    def test_mentions_untouched_in_code(self):
        body = "Fails here:\n```java\n@Override\npublic void run() {}\n```\nand `@Inject` too, thanks @dev"
        v = go(rec(body=body))["cleaning"]["cleaned_view"]["body"]
        self.assertIn("@Override", v)
        self.assertIn("`@Inject`", v)
        self.assertIn("thanks @user_1", v)

    def test_C4_strips_comments_badges_only_in_prose(self):
        body = ("<!-- please describe -->\nReal text about the export failing every night for us.\n"
                "![build](https://img.shields.io/badge/x-y.svg)\n```html\n<!-- keep me -->\n```\n")
        v = go(rec(body=body))["cleaning"]["cleaned_view"]["body"]
        self.assertNotIn("please describe", v)
        self.assertNotIn("shields.io", v)
        self.assertIn("<!-- keep me -->", v)

    def test_unclosed_fence_repaired_and_logged(self):
        out = go(rec(body="Run:\n```bash\nmake test\n"))
        v = out["cleaning"]["cleaned_view"]
        self.assertTrue(v["body"].endswith("```\n"))
        self.assertTrue(spans_cover(v["body"], v["spans"]["body"]))
        self.assertTrue(any(e["action"] == "close_unclosed_fence" for e in out["cleaning"]["transformation_log"]))

    def test_V14_table_pipe_repaired(self):
        body = "| a | b |\n|---|---|\n| 1 | 2\n"
        out = go(rec(body=body))
        self.assertEqual(out["cleaning"]["cleaned_view"]["body"], "| a | b |\n|---|---|\n| 1 | 2 |\n")
        self.assertTrue(any(e["action"] == "add_table_pipe" for e in out["cleaning"]["transformation_log"]))

    def test_V15_ambiguous_formatting_flagged_not_excluded(self):
        body = "Try:\n```\nouter\n~~~\ninner\n"
        out = go(rec(body=body))
        self.assertIn("unrepaired_formatting", out["quality_status"]["quality_flags"])
        self.assertEqual(stage_of(out), "ANNOTATION_READY")
        self.assertEqual(out["cleaning"]["cleaned_view"]["body"], body)

    def test_transformation_log_shape(self):
        out = go(rec(body=BODY_A + "\nmail bob@corp.com"))
        keys = {"collection_id", "stage", "action", "before_span_ref", "after_span_ref",
                "provenance_tag", "timestamp", "tool_version"}
        for e in out["cleaning"]["transformation_log"]:
            self.assertTrue(keys <= set(e), e)

    def test_labels_whitespace_normalized_membership_untouched(self):
        out = go(rec(labels=["Bug ", " needs  triage"]))
        self.assertEqual(out["cleaning"]["cleaned_view"]["labels"], ["Bug", "needs triage"])
        self.assertEqual(out["input_core"]["labels"], ["Bug ", " needs  triage"])

    def test_primary_language_mismatch_flagged_not_corrected(self):
        ctx = {"tier_2": {"repo_metadata": {"primary_language": "Ruby"},
                          "repo_structure": ["a.py", "b.py", "c.py", "x.rb"], "fetched_at": "t"},
               "max_tier_available": 2}
        out = go(rec(context_bundle=ctx))
        self.assertIn("primary_language_mismatch", out["quality_status"]["quality_flags"])
        self.assertEqual(out["context_bundle"]["tier_2"]["repo_metadata"]["primary_language"], "Ruby")

    def test_only_expected_input_stages(self):
        with self.assertRaises(ValueError):
            go(rec(), stage="DEDUP_HELD")

    def test_eval_reserved_stays_reserved(self):
        self.assertEqual(stage_of(go(rec(), stage="EVAL_RESERVED")), "EVAL_RESERVED")

    def test_eval_fingerprint_match_reserves(self):
        first = go(rec())
        cfg = CleanConfig(eval_simhashes=(first["cleaning"]["dedup"]["simhash64"],))
        self.assertEqual(stage_of(go(rec("c2", n=2), cfg)), "EVAL_RESERVED")

    def test_benchmark_overlap_excluded(self):
        first = go(rec())
        cfg = CleanConfig(benchmark_simhashes=(first["cleaning"]["dedup"]["simhash64"],))
        out = go(rec("c2", n=2), cfg)
        self.assertEqual((stage_of(out), out["quality_status"]["exclusion_reason"]),
                         ("EXCLUDED", "benchmark_overlap"))


class DedupRefinementTests(unittest.TestCase):
    def test_V5_shared_template_is_not_a_near_dup(self):
        idx = CorpusIndex()
        a = go(rec("c1", title="Bug A", body=TEMPLATE.format(BODY_A)), index=idx)
        b = go(rec("c2", n=2, title="Bug B", body=TEMPLATE.format(BODY_B)), index=idx)
        self.assertIsNone(b["cleaning"]["dedup"]["cluster_id"])
        self.assertEqual(stage_of(b), "ANNOTATION_READY")

    def test_template_lines_excluded_from_fingerprint(self):
        self.assertEqual(fingerprint_text(TEMPLATE.format("hello there")).strip(), "hello there")

    def test_V6_same_bug_different_formatting_is_caught(self):
        idx = CorpusIndex()
        go(rec("c1", body=BODY_A), index=idx)
        messy = "**" + "  \n".join(BODY_A.split(". ")) + "**"
        b = go(rec("c2", repo="fork/shop", n=9, body=messy), index=idx)
        dd = b["cleaning"]["dedup"]
        self.assertTrue(dd["exact_of"] or dd["cluster_id"])

    def test_volatile_trace_details_do_not_hide_duplicates(self):
        t1 = "Crash on save:\n  at Db.save (/app/db.js:42:19)\n  at run (/app/run.js:8:1)\nafter upgrade"
        t2 = "Crash on save:\n  at Db.save (/app/db.js:57:3)\n  at run (/app/run.js:12:9)\nafter upgrade"
        self.assertEqual(intake.exact_hash("t", fingerprint_text(t1)),
                         intake.exact_hash("t", fingerprint_text(t2)))
        self.assertIn(":42:19", go(rec(body=t1))["cleaning"]["cleaned_view"]["body"])   # cleaned_view stays verbatim

    def test_exact_dup_is_held_not_deleted(self):
        idx = CorpusIndex()
        go(rec("c1"), index=idx)
        b = go(rec("c2", n=2), index=idx)
        self.assertEqual(stage_of(b), "DEDUP_HELD")

    def test_excluded_records_do_not_enter_index(self):
        idx = CorpusIndex()
        go(rec("c1", title="", body=""), index=idx)
        self.assertEqual(idx.total, 0)


class LeakageTests(unittest.TestCase):
    DIFF = ("diff --git a/src/discount.ts b/src/discount.ts\n--- a/src/discount.ts\n+++ b/src/discount.ts\n"
            "@@ -10,7 +10,9 @@ export function applyDiscount(code: string) {\n"
            "-  return codes[code].percent;\n+  if (!code) { return 0; }\n+  const entry = codes[code];\n"
            "+  return entry ? entry.percent : 0;\n }\n")

    def ctx(self):
        return {"tier_6": {"related_prs": [{"title": "Handle empty code", "body": self.DIFF}], "fetched_at": "t"},
                "max_tier_available": 1}

    def test_V11_pr_diff_pasted_in_comment(self):
        r = rec(context_bundle=self.ctx(),
                comments=[{"author_role": "maintainer", "body": "Here is what I did:\n" + self.DIFF, "created_at": "x"}])
        out = go(r)
        self.assertEqual((stage_of(out), out["quality_status"]["exclusion_reason"]),
                         ("EXCLUDED", "leakage_detected"))

    def test_leak_detected_against_external_quarantine_store(self):
        r = rec(comments=[{"author_role": "maintainer", "body": self.DIFF, "created_at": "x"}])
        out = go(r, CleanConfig(quarantine_texts=(self.DIFF,)))
        self.assertEqual(out["quality_status"]["exclusion_reason"], "leakage_detected")

    def test_ordinary_comment_is_not_a_leak(self):
        r = rec(context_bundle=self.ctx(),
                comments=[{"author_role": "user", "body": "Same thing happens for me on Safari, any workaround?", "created_at": "x"}])
        self.assertEqual(stage_of(go(r)), "ANNOTATION_READY")

    def test_tier6_never_in_cleaned_context(self):
        out = go(rec(context_bundle=self.ctx()))
        self.assertNotIn("tier_6", out["cleaning"]["cleaned_view"]["context"])


class IntegrityTests(unittest.TestCase):
    def test_V13_mutation_fails_the_run(self):
        a = rec(); b = copy.deepcopy(a)
        b["input_core"]["body"] += " edited"
        with self.assertRaises(SourceMutationError):
            check_immutable(a, b)

    def test_record_edited_after_intake_fails_the_run(self):
        r, _ = intake.process(rec(), intake.Config(), CorpusIndex(), intake.LineageLog(), now=NOW)
        self.assertEqual(r["quality_status"]["collection_stage"], "READY_FOR_LABELING")
        r["input_core"]["body"] += " tampered"
        with self.assertRaises(SourceMutationError):
            run_clean(r, now=NOW)

    def test_intake_then_clean_end_to_end(self):
        r, _ = intake.process(rec(), intake.Config(), CorpusIndex(), intake.LineageLog(), now=NOW)
        self.assertEqual(stage_of(run_clean(r, now=NOW)), "ANNOTATION_READY")

    def test_sidecar_integrity_detects_orphans(self):
        r = rec(body="use psql here")
        terms = normalize_terms([("title", r["input_core"]["title"]), ("body", r["input_core"]["body"])], [])
        self.assertEqual(sidecar_integrity_errors(r, terms), [])
        bad = copy.deepcopy(terms)
        bad[0]["span_ref"] = "body:0-4"
        self.assertTrue(sidecar_integrity_errors(r, bad))
        bad[0]["span_ref"] = "body:999-1003"
        self.assertTrue(sidecar_integrity_errors(r, bad))
        bad[0]["span_ref"] = "nonsense"
        self.assertTrue(sidecar_integrity_errors(r, bad))

    def test_unknown_entries_must_keep_raw(self):
        r = rec(body="x `foo-bar-baz` y")
        terms = normalize_terms([("body", r["input_core"]["body"])], [])
        terms[0]["canonical"] = "Something"
        self.assertTrue(any("UNKNOWN" in e for e in sidecar_integrity_errors(r, terms)))


if __name__ == "__main__":
    unittest.main()
