import copy
import unittest

import intake
from intake import (Config, CorpusIndex, LineageLog, detect_language, enforce_tier_integrity,
                    model_visible_bundle, new_collected_record, process, qualify_source,
                    validate_collected)

BODY_A = ("When I open the checkout page and submit the discount form with an empty value the whole page "
          "crashes and the console shows a TypeError. This started after we upgraded the payment widget "
          "last week and it only happens in the production build, not in development. I expected the form "
          "to show a validation message instead of throwing an exception in the render loop.")
BODY_B = ("The nightly export job fails silently when the destination bucket is missing and nothing is "
          "written to the log file. We noticed because the finance team did not receive their weekly "
          "report, and the scheduler still shows the job as green. The failure should be surfaced as an "
          "error with the bucket name so that operators can fix the configuration quickly.")


def rec(cid="c1", repo="acme/shop", n=42, title="Discount input crashes on empty value", body=BODY_A,
        license="MIT", **kw):
    return new_collected_record(
        collection_id=cid, repo=repo, issue_number=n, issue_url=f"https://github.com/{repo}/issues/{n}",
        title=title, body=body, snapshot_fetched_at="2026-09-24T00:00:00Z", license=license, **kw)


def run(record, cfg=None, index=None, log=None):
    return process(record, cfg or Config(), index or CorpusIndex(), log or LineageLog(), now="2026-09-24T00:00:00Z")


class StructureTests(unittest.TestCase):
    def test_valid(self):
        self.assertEqual(validate_collected(rec()), [])

    def test_ground_truth_must_be_null(self):
        r = rec(); r["ground_truth"] = {"x": 1}
        self.assertTrue(any("ground_truth" in e for e in validate_collected(r)))

    def test_missing_sections(self):
        for k in ("identity", "input_core", "data_provenance", "quality_status", "context_bundle"):
            r = rec(); del r[k]
            self.assertTrue(validate_collected(r), k)

    def test_bad_comment(self):
        r = rec(comments=[{"body": "x"}])
        self.assertTrue(any("comments[0]" in e for e in validate_collected(r)))

    def test_excluded_needs_reason(self):
        r = rec(); r["quality_status"]["collection_stage"] = "EXCLUDED"
        self.assertTrue(any("exclusion_reason" in e for e in validate_collected(r)))

    def test_process_rejects_invalid_record(self):
        r = rec(); del r["identity"]
        with self.assertRaises(ValueError):
            run(r)


class SourceQualificationTests(unittest.TestCase):
    def test_permissive_ok(self):
        self.assertEqual(qualify_source("a/b", "MIT", Config()), (True, None))

    def test_copyleft_or_unknown_excluded_before_anything_else(self):
        out, _ = run(rec(license="GPL-3.0"))
        self.assertEqual(out["quality_status"]["collection_stage"], "EXCLUDED")
        self.assertIn("license_not_permitted", out["quality_status"]["exclusion_reason"])
        self.assertFalse(qualify_source("a/b", None, Config())[0])

    def test_authorized_repo_overrides_licence(self):
        cfg = Config(authorized_repos=frozenset({"acme/shop"}))
        out, _ = run(rec(license="Proprietary"), cfg)
        self.assertEqual(out["quality_status"]["collection_stage"], "READY_FOR_LABELING")


class HappyPathTests(unittest.TestCase):
    def test_ready_and_input_untouched(self):
        r = rec(); snap = copy.deepcopy(r)
        log = LineageLog()
        out, meta = run(r, log=log)
        self.assertEqual(r, snap)                                   # input not mutated
        self.assertEqual(out["quality_status"]["collection_stage"], "READY_FOR_LABELING")
        self.assertIsNone(out["ground_truth"])
        self.assertEqual(len(out["data_provenance"]["source_sha256"]), 64)
        self.assertEqual(meta["language_tag"], "en")
        self.assertEqual(meta["content_hashes"]["source_sha256"], out["data_provenance"]["source_sha256"])
        stages = [e["stage"] for e in log.for_record("c1")]
        self.assertEqual(stages[0], "0_source_qualification")
        self.assertEqual(stages[-1], "15_routing")
        self.assertIn("vuln_screen_not_run", out["quality_status"]["quality_flags"])

    def test_minimal_issue_is_kept(self):
        out, meta = run(rec(title="Crash", body=""))
        self.assertEqual(out["quality_status"]["collection_stage"], "READY_FOR_LABELING")
        self.assertIn("language_unverified_short_text", out["quality_status"]["quality_flags"])

    def test_closed_or_odd_labels_not_filtered(self):
        out, _ = run(rec(labels=["wontfix", "duplicate"]))
        self.assertEqual(out["quality_status"]["collection_stage"], "READY_FOR_LABELING")


class ScreenTests(unittest.TestCase):
    def excluded(self, r, reason):
        out, _ = run(r)
        self.assertEqual(out["quality_status"]["collection_stage"], "EXCLUDED")
        self.assertIn(reason, out["quality_status"]["exclusion_reason"])

    def test_link_farm(self):
        self.excluded(rec(title="Best deals", body="http://a.example/x http://b.example/y http://c.example/z buy"),
                      "link_farm")

    def test_template_only(self):
        body = "### Steps to reproduce\n\n- [ ] I searched\n<!-- describe here -->\n### Expected\n"
        self.excluded(rec(body=body), "template_only")

    def test_bot_only(self):
        r = rec(title="", body="", comments=[{"author_role": "bot", "body": "stale", "created_at": "x"}])
        self.excluded(r, "bot_only_content")

    def test_secret_is_held_not_redacted(self):
        body = BODY_A + "\napiKey: sk_live_51Hn3k29fJ2mXaB9qZZZZ"
        r = rec(body=body)
        out, _ = run(r)
        self.assertEqual(out["quality_status"]["collection_stage"], "REDACTION_HELD")
        self.assertIn("pii_suspected", out["quality_status"]["quality_flags"])
        self.assertEqual(out["input_core"]["body"], body)           # phase 4 never redacts

    def test_secret_in_context_is_found(self):
        ctx = {"tier_3": {"config": ["password: Xk29!fjq02mzPq1"], "fetched_at": "t"}, "max_tier_available": 3}
        out, _ = run(rec(context_bundle=ctx))
        self.assertEqual(out["quality_status"]["collection_stage"], "REDACTION_HELD")

    def test_vuln_hook(self):
        out, _ = run(rec(), Config(vuln_check=lambda r: True))
        self.assertEqual(out["quality_status"]["exclusion_reason"], "active_unpatched_vulnerability")
        out, _ = run(rec(), Config(vuln_check=lambda r: False))
        self.assertNotIn("vuln_screen_not_run", out["quality_status"]["quality_flags"])


class LanguageTests(unittest.TestCase):
    def test_detect(self):
        self.assertEqual(detect_language(BODY_A)[0], "en")
        self.assertEqual(detect_language("这个页面在提交空的折扣码时崩溃了并且没有任何提示信息出现请尽快修复")[0], "zh")
        self.assertEqual(detect_language("ok")[1], "too_short")
        self.assertEqual(detect_language("lorem ipsum dolor sit amet consectetur adipiscing elit sed")[1], "unidentified")

    def test_uncovered_language_is_held_not_excluded(self):
        zh = "这个页面在提交空的折扣码时崩溃了并且没有任何提示信息出现请尽快修复"
        out, _ = run(rec(body=zh))
        self.assertEqual(out["quality_status"]["collection_stage"], "GATED")
        self.assertIn("awaiting_annotator_coverage:zh", out["quality_status"]["quality_flags"])
        out, _ = run(rec(body=zh), Config(covered_languages=frozenset({"en", "zh"})))
        self.assertEqual(out["quality_status"]["collection_stage"], "READY_FOR_LABELING")

    def test_unidentified_is_excluded(self):
        out, _ = run(rec(title="x", body="lorem ipsum dolor sit amet consectetur adipiscing elit sed do"))
        self.assertEqual(out["quality_status"]["exclusion_reason"], "unidentified_language")


class DedupTests(unittest.TestCase):
    def test_exact_duplicate_held_representative_kept(self):
        idx, log = CorpusIndex(), LineageLog()
        a, _ = run(rec("c1"), index=idx, log=log)
        b, _ = run(rec("c2", n=43, body="**" + BODY_A.upper() + "**"), index=idx, log=log)
        self.assertEqual(a["quality_status"]["collection_stage"], "READY_FOR_LABELING")
        self.assertEqual(b["quality_status"]["collection_stage"], "DEDUP_HELD")
        self.assertIn("exact_duplicate_of:c1", b["quality_status"]["quality_flags"])

    def test_near_dup_clusters_and_retains_all_members_across_repos(self):
        idx = CorpusIndex()
        a, _ = run(rec("c1"), index=idx)
        near = BODY_A.replace("last week", "yesterday")
        b, _ = run(rec("c2", repo="fork/shop", n=7, body=near), index=idx)
        self.assertEqual(b["quality_status"]["collection_stage"], "READY_FOR_LABELING")
        self.assertIsNotNone(b["quality_status"]["dedup_cluster_id"])
        self.assertTrue(any(e["cluster"] == b["quality_status"]["dedup_cluster_id"] for e in idx.sims if e["id"] == "c1"))

    def test_unrelated_issues_not_clustered(self):
        idx = CorpusIndex()
        run(rec("c1"), index=idx)
        b, _ = run(rec("c2", n=2, title="Export fails", body=BODY_B), index=idx)
        self.assertIsNone(b["quality_status"]["dedup_cluster_id"])

    def test_index_roundtrip(self):
        idx = CorpusIndex()
        run(rec("c1"), index=idx)
        again = CorpusIndex.from_dict(idx.to_dict())
        self.assertEqual(again.to_dict(), idx.to_dict())
        b, _ = run(rec("c2", n=9), index=again)
        self.assertEqual(b["quality_status"]["collection_stage"], "DEDUP_HELD")


class TierAndReservationTests(unittest.TestCase):
    def test_cross_tier_bundle_dropped_record_continues(self):
        ctx = {"tier_2": {"readme": "# hi", "source_excerpts": ["x=1"], "fetched_at": "t"},
               "tier_4": {"docs": ["guide"], "fetched_at": "t"}, "max_tier_available": 4}
        out, _ = run(rec(context_bundle=ctx))
        self.assertIsNone(out["context_bundle"]["tier_2"])
        self.assertEqual(out["context_bundle"]["max_tier_available"], 4)
        self.assertIn("tier_bundle_dropped:tier_2", out["quality_status"]["quality_flags"])
        self.assertEqual(out["quality_status"]["collection_stage"], "READY_FOR_LABELING")

    def test_tier6_never_model_visible_or_counted(self):
        ctx = {"tier_6": {"related_prs": [{"body": "Fixes #42"}], "fetched_at": "t"}, "max_tier_available": 6}
        r = rec(context_bundle=ctx)
        self.assertNotIn("tier_6", model_visible_bundle(r))
        out, _ = run(r)
        self.assertEqual(out["context_bundle"]["max_tier_available"], 1)

    def test_eval_reservation_is_repo_level(self):
        cfg = Config(eval_repos=frozenset({"acme/shop"}))
        out, _ = run(rec(), cfg)
        self.assertEqual(out["quality_status"]["collection_stage"], "EVAL_RESERVED")
        out, _ = run(rec("c2", repo="other/repo"), cfg)
        self.assertEqual(out["quality_status"]["collection_stage"], "READY_FOR_LABELING")

    def test_eval_reserved_outranks_redaction_hold(self):
        cfg = Config(eval_repos=frozenset({"acme/shop"}))
        out, _ = run(rec(body=BODY_A + "\napiKey: sk_live_51Hn3k29fJ2mXaB9qZZZZ"), cfg)
        self.assertEqual(out["quality_status"]["collection_stage"], "EVAL_RESERVED")

    def test_benchmark_overlap_is_flagged(self):
        sim = intake.simhash64("Discount input crashes on empty value\n" + BODY_A)
        out, _ = run(rec(), Config(benchmark_simhashes=(sim,)))
        self.assertIn("benchmark_overlap", out["quality_status"]["quality_flags"])

    def test_repo_ceiling_holds_not_excludes(self):
        idx = CorpusIndex()
        cfg = Config(repo_ceiling=0.5, repo_ceiling_min_total=2)
        run(rec("c1", n=1, title="a1", body=BODY_A), cfg, idx)
        run(rec("c2", n=2, title="b1", body=BODY_B), cfg, idx)   # different repo needed below
        idx.repo_counts["acme/shop"] = 5
        idx.total = 6
        out, _ = run(rec("c3", n=3, title="third", body="The scheduler throws an error when the calendar "
                         "file is missing and the retry counter is not reset after each attempt."), cfg, idx)
        self.assertEqual(out["quality_status"]["collection_stage"], "GATED")
        self.assertIsNone(out["quality_status"]["exclusion_reason"])


class LineageTests(unittest.TestCase):
    def test_excluded_has_reason_in_log(self):
        log = LineageLog()
        run(rec(license="GPL-3.0"), log=log)
        fails = [e for e in log.for_record("c1") if e["result"] == "fail"]
        self.assertEqual(len(fails), 1)
        self.assertIn("license_not_permitted", fails[0]["reason"])


if __name__ == "__main__":
    unittest.main()
