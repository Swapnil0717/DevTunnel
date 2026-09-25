import copy
import json
import os
import tempfile
import unittest

import dataset as ds
from derived import finalize
from example import validate_example
from test_example import make_example

SALT = "salt-1"
CFG = dict(train_cutoff="2026-03-01T00:00:00Z", val_cutoff="2026-06-01T00:00:00Z")
TRAIN_T, VAL_T, TEST_T = "2026-01-15T00:00:00Z", "2026-04-15T00:00:00Z", "2026-07-15T00:00:00Z"


def find_repo(target, salt=SALT, cfg_split=(80, 10, 10), start=0, taken=()):
    i = start
    while True:
        name = f"org/r{i}"
        if name not in taken and ds._target_for(ds._bucket(name, salt), cfg_split) == target:
            return name
        i += 1


def ex(repo, n, snap=TRAIN_T, tier="GOLD", ctx=1, flags=(), method=None, body=None, **extra):
    e = make_example()
    gt = e["ground_truth"]
    src = gt["task_identity"]["source_issue"]
    url = f"https://github.com/{repo}/issues/{n}"
    src.update(repo=repo, issue_number=n, issue_url=url, snapshot_fetched_at=snap)
    lp = e["label_provenance"]
    lp.update(source_repo=repo, source_issue_url=url, snapshot_fetched_at=snap)
    e["example_id"] = f"ex-{repo}-{n}-t{ctx}"
    e["input"]["issue"]["title"] = f"Issue {n} in {repo}"
    e["input"]["issue"]["body"] = body or f"Unique body number {n} for repository {repo} describing a crash."
    e["input"]["context_tier"] = ctx
    e["quality_status"]["tier"] = tier
    e["quality_status"]["quality_flags"] = list(flags)
    if tier != "GOLD":
        lp.update(labeling_method="MODEL_ASSISTED_HUMAN_CORRECTED", annotator_ids=["a1"], inter_annotator_agreement=None)
    if method == "SYNTHETIC":
        lp.update(labeling_method="SYNTHETIC", annotator_ids=[], inter_annotator_agreement=None)
        e["quality_status"]["tier"] = "SILVER" if tier == "GOLD" else tier
    e.update(extra)
    assert not validate_example(e), validate_example(e)
    return e


def cfg(**kw):
    return ds.BuildConfig(split_salt=SALT, **{**CFG, **kw})


def corpus():
    tr = find_repo("training")
    va = find_repo("validation")
    te = find_repo("test")
    return [ex(tr, 1, TRAIN_T), ex(tr, 2, TRAIN_T), ex(va, 1, VAL_T), ex(te, 1, TEST_T), ex(te, 2, TEST_T)]


def where(res, eid):
    return [d for d in ds.DATASET_IDS for r in res.datasets[d] if r["example_id"] == eid]


class AssignmentTests(unittest.TestCase):
    def test_repo_level_split_and_windows(self):
        res = ds.build_datasets(corpus(), cfg())
        self.assertEqual({d: len(v) for d, v in res.datasets.items()},
                         {"training": 2, "validation": 1, "test": 2, "hard_case": 0, "adversarial": 0, "regression": 0})
        self.assertEqual(res.dropped, [])
        self.assertTrue(all(not v for v in ds.check_leakage(res.datasets).values()))

    def test_d8_reproducible(self):
        a, b = ds.build_datasets(corpus(), cfg()), ds.build_datasets(corpus(), cfg())
        self.assertEqual(a.repo_split, b.repo_split)
        self.assertEqual(json.dumps(a.datasets, sort_keys=True), json.dumps(b.datasets, sort_keys=True))

    def test_salt_changes_assignment(self):
        many = [ex(f"org/x{i}", 1, TRAIN_T) for i in range(40)]
        a = ds.build_datasets(many, cfg()).repo_split
        b = ds.build_datasets(many, ds.BuildConfig(split_salt="other", **CFG)).repo_split
        self.assertNotEqual(a, b)

    def test_d4_fork_cluster_forces_same_dataset(self):
        r1, r2 = find_repo("training"), find_repo("test")
        tgt = ds._target_for(ds._bucket(min(r1, r2), SALT), (80, 10, 10))
        snap = {"training": TRAIN_T, "validation": VAL_T, "test": TEST_T}[tgt]
        e1 = ex(r1, 1, snap, corpus_meta={"dedup_cluster_id": "C1"})
        e2 = ex(r2, 1, snap, corpus_meta={"dedup_cluster_id": "C1"})
        res = ds.build_datasets([e1, e2], cfg())
        locs = [where(res, e["example_id"]) for e in (e1, e2)]
        self.assertEqual(locs[0], locs[1])
        self.assertEqual(len(locs[0]), 1)
        self.assertTrue(res.exceptions)                      # override was logged
        self.assertEqual(ds.check_leakage(res.datasets)["L4"], [])

    def test_d5_context_tier_siblings_same_dataset(self):
        te = find_repo("test")
        a, b = ex(te, 5, TEST_T, ctx=1), ex(te, 5, TEST_T, ctx=4)
        b["input"]["available_context"] = {"docs": ["guide"]}
        res = ds.build_datasets([a, b], cfg())
        self.assertEqual(where(res, a["example_id"]), where(res, b["example_id"]))
        self.assertEqual(ds.check_leakage(res.datasets)["L6"], [])

    def test_d6_train_records_after_cutoff_dropped(self):
        tr = find_repo("training")
        late = ex(tr, 9, TEST_T)
        res = ds.build_datasets([ex(tr, 1, TRAIN_T), late], cfg())
        self.assertIn((late["example_id"], "outside training time window"), res.dropped)

    def test_eval_windows_enforced(self):
        te = find_repo("test")
        early = ex(te, 3, TRAIN_T)
        res = ds.build_datasets([early], cfg())
        self.assertIn((early["example_id"], "outside test time window"), res.dropped)

    def test_derived_cutoffs_give_ordered_splits(self):
        many = [ex(f"org/y{i}", 1, f"2026-{1 + i % 9:02d}-{1 + i % 27:02d}T00:00:00Z") for i in range(60)]
        res = ds.build_datasets(many, ds.BuildConfig(split_salt=SALT))
        self.assertTrue(res.cutoffs["derived"])
        self.assertEqual(ds.check_leakage(res.datasets)["L5"], [])

    def test_eval_is_gold_only_and_never_synthetic(self):
        te = find_repo("test")
        silver, syn = ex(te, 1, TEST_T, tier="SILVER"), ex(te, 2, TEST_T, method="SYNTHETIC")
        res = ds.build_datasets([silver, syn], cfg())
        self.assertEqual(res.datasets["test"], [])
        self.assertEqual(len(res.dropped), 2)

    def test_train_tiers_default_excludes_bronze(self):
        tr = find_repo("training")
        res = ds.build_datasets([ex(tr, 1, TRAIN_T, tier="BRONZE"), ex(tr, 2, TRAIN_T, tier="SILVER")], cfg())
        self.assertEqual(len(res.datasets["training"]), 1)
        res = ds.build_datasets([ex(tr, 1, TRAIN_T, tier="BRONZE")], cfg(train_tiers=("GOLD", "SILVER", "BRONZE")))
        self.assertEqual(len(res.datasets["training"]), 1)

    def test_invalid_rejected_and_duplicate_ids_dropped(self):
        tr = find_repo("training")
        good, bad = ex(tr, 1), ex(tr, 2)
        bad["input"]["context_tier"] = 9
        rej = ex(tr, 3, tier="GOLD")
        rej["quality_status"]["tier"] = "REJECTED"
        res = ds.build_datasets([good, bad, rej, copy.deepcopy(good)], cfg())
        reasons = sorted(r.split(":")[0] for _, r in res.dropped)
        self.assertEqual(reasons, ["duplicate example_id", "invalid", "rejected"])

    def test_stratum_override_changes_thresholds(self):
        many = [ex(f"org/z{i}", 1, TRAIN_T) for i in range(30)]
        res = ds.build_datasets(many, cfg(stratum_fn=lambda e: "s", stratum_split={"s": (100, 0, 0)}))
        self.assertEqual(len(res.datasets["training"]), 30)


class CuratedTests(unittest.TestCase):
    def test_disagreement_goes_to_hard_case_with_reason(self):
        tr = find_repo("training")
        e = ex(tr, 1, annotation_summary={"agreement_status": "adjudicated"})
        res = ds.build_datasets([e], cfg())
        rec = res.datasets["hard_case"][0]
        self.assertEqual(rec["dataset_assignment"]["inclusion_reason"]["type"], "disagreement")
        self.assertNotIn("annotation_summary", rec)
        self.assertEqual(res.datasets["training"], [])

    def test_low_confidence_reason(self):
        tr = find_repo("training")
        e = ex(tr, 1)
        e["ground_truth"]["provenance"]["role"]["confidence"] = 0.4
        e["ground_truth"] = finalize(e["ground_truth"])
        self.assertEqual(validate_example(e), [])
        res = ds.build_datasets([e], cfg())
        self.assertEqual(res.datasets["hard_case"][0]["dataset_assignment"]["inclusion_reason"]["type"], "low_confidence")
        res = ds.build_datasets([e], cfg(hard_case_types=("disagreement", "contrast_pair")))
        self.assertEqual(len(res.datasets["training"]), 1)

    def test_contrast_pair_via_curation(self):
        e = ex(find_repo("training"), 1, curation={"inclusion_type": "contrast_pair", "detail": "pair-7"})
        res = ds.build_datasets([e], cfg())
        self.assertEqual(res.datasets["hard_case"][0]["dataset_assignment"]["inclusion_reason"]["detail"], "pair-7")

    def test_sibling_without_reason_dropped_not_leaked(self):
        tr = find_repo("training")
        a = ex(tr, 1, ctx=1, annotation_summary={"agreement_status": "disagreed"})
        b = ex(tr, 1, ctx=2)
        res = ds.build_datasets([a, b], cfg())
        self.assertEqual(where(res, b["example_id"]), [])
        self.assertTrue(any(i == b["example_id"] for i, _ in res.dropped))
        self.assertTrue(all(not v for v in ds.check_leakage(res.datasets).values()))

    def test_adversarial_is_synthetic_tagged(self):
        e = ex(find_repo("training"), 1, method="SYNTHETIC",
               curation={"inclusion_type": "failure_mode_probe", "failure_mode_targeted": "role_collapse"})
        res = ds.build_datasets([e], cfg())
        rec = res.datasets["adversarial"][0]
        self.assertEqual(ds.validate_dataset_record(rec), [])
        self.assertEqual(rec["dataset_assignment"]["inclusion_reason"]["failure_mode_targeted"], "role_collapse")

    def test_d13_adversarial_needs_registry_tag(self):
        e = ex(find_repo("training"), 1, method="SYNTHETIC",
               curation={"inclusion_type": "failure_mode_probe", "failure_mode_targeted": "made_up"})
        rec = ds.build_datasets([e], cfg()).datasets["adversarial"][0]
        self.assertTrue(any("registry" in x for x in ds.validate_dataset_record(rec)))

    def test_adversarial_pulls_cluster_siblings_out_of_training(self):
        tr = find_repo("training")
        real = ex(tr, 1, corpus_meta={"dedup_cluster_id": "K"})
        adv = ex(tr, 2, method="SYNTHETIC", corpus_meta={"dedup_cluster_id": "K"},
                 curation={"inclusion_type": "failure_mode_probe", "failure_mode_targeted": "keyword_misdirection"})
        res = ds.build_datasets([real, adv], cfg())
        self.assertEqual(where(res, real["example_id"]), [])            # dropped, not left in training
        self.assertEqual(len(res.datasets["adversarial"]), 1)
        self.assertTrue(all(not v for v in ds.check_leakage(res.datasets).values()))


class RecordValidationTests(unittest.TestCase):
    def rec(self, **kw):
        return ds.build_datasets([ex(find_repo("training"), 1, **kw)], cfg()).datasets["training"][0]

    def test_valid_pool_record(self):
        self.assertEqual(ds.validate_dataset_record(self.rec()), [])

    def test_pool_record_must_not_have_reason(self):
        r = self.rec()
        r["dataset_assignment"]["inclusion_reason"] = {"type": "disagreement"}
        self.assertTrue(any("null" in x for x in ds.validate_dataset_record(r)))

    def test_missing_assignment(self):
        r = self.rec()
        del r["dataset_assignment"]
        self.assertTrue(ds.validate_dataset_record(r))

    def test_d7_synthetic_in_test_invalid(self):
        r = self.rec(method="SYNTHETIC")
        r["dataset_assignment"]["dataset_id"] = "test"
        self.assertTrue(any("SYNTHETIC" in x for x in ds.validate_dataset_record(r)))


class LeakageTests(unittest.TestCase):
    def build(self):
        return {d: list(v) for d, v in ds.build_datasets(corpus(), cfg()).datasets.items()}

    def mv(self, d, rec, dataset_id):
        r = copy.deepcopy(rec)
        r["dataset_assignment"]["dataset_id"] = dataset_id
        d[dataset_id].append(r)

    def test_clean_build_passes(self):
        self.assertTrue(all(not v for v in ds.check_leakage(self.build()).values()))

    def test_l1_repo(self):
        d = self.build()
        r = copy.deepcopy(d["training"][0])
        r["example_id"] += "-x"
        r["input"]["issue"]["title"] = "other"
        d["validation"].append(r)
        self.assertTrue(ds.check_leakage(d)["L1"])

    def test_l2_l3_issue_and_text_duplicates(self):
        d = self.build()
        d["hard_case"].append(copy.deepcopy(d["training"][0]))
        f = ds.check_leakage(d)
        self.assertTrue(f["L2"] and f["L3"])

    def test_l3_exact_text_different_url(self):
        d = self.build()
        r = copy.deepcopy(d["training"][0])
        r["example_id"] += "-dup"
        r["label_provenance"]["source_issue_url"] += "0"
        d["hard_case"].append(r)
        f = ds.check_leakage(d)
        self.assertTrue(f["L3"])

    def test_l4_cluster(self):
        d = self.build()
        d["training"][0]["corpus_meta"] = {"dedup_cluster_id": "Q"}
        d["test"][0]["quality_status"]["quality_flags"] = ["near_dup_cluster:Q"]
        self.assertTrue(ds.check_leakage(d)["L4"])

    def test_l5_temporal(self):
        d = self.build()
        d["test"][0]["label_provenance"]["snapshot_fetched_at"] = "2026-01-01T00:00:00Z"
        self.assertTrue(ds.check_leakage(d)["L5"])

    def test_l6_split_siblings(self):
        d = self.build()
        r = copy.deepcopy(d["test"][0])
        r["example_id"] += "-t2"
        r["input"]["context_tier"] = 2
        d["hard_case"].append(r)
        self.assertTrue(any("split across" in x for x in ds.check_leakage(d)["L6"]))

    def test_l6_tier_boundary_recheck(self):
        d = self.build()
        d["training"][0]["input"]["available_context"] = {"source_excerpts": ["x = 1"]}
        self.assertTrue(any("source_excerpts" in x for x in ds.check_leakage(d)["L6"]))

    def test_l7_benchmark(self):
        text = "Issue 1 in " + d_repo() + "\nUnique body number 1 for repository " + d_repo() + " describing a crash. " + "extra words " * 12
        b = ex(find_repo("test"), 1, TEST_T, body=text.split("\n", 1)[1])
        b["input"]["issue"]["title"] = text.split("\n", 1)[0]
        res = ds.build_datasets([b], cfg(benchmark_texts=(text,)))
        self.assertIn((b["example_id"], "benchmark_overlap"), res.dropped)
        # in Training it is kept only when the benchmark licence permits (PS-4)
        tb = ex(find_repo("training"), 1, TRAIN_T, body=text.split("\n", 1)[1])
        tb["input"]["issue"]["title"] = text.split("\n", 1)[0]
        kept = ds.build_datasets([tb], cfg(benchmark_texts=(text,), benchmark_train_ok=True))
        self.assertEqual(len(kept.datasets["training"]), 1)
        self.assertEqual(ds.check_leakage(kept.datasets, (text,), True)["L7"], [])
        self.assertTrue(ds.check_leakage(kept.datasets, (text,), False)["L7"])


def d_repo():
    return find_repo("test")


class RegressionTests(unittest.TestCase):
    def setUp(self):
        te = find_repo("test")
        self.a, self.b = ex(te, 1, TEST_T, ctx=1), ex(te, 1, TEST_T, ctx=2)
        self.c = ex(te, 2, TEST_T)
        self.built = ds.build_datasets([self.a, self.b, self.c], cfg()).datasets

    def test_move_not_copy_and_siblings_follow(self):
        new, moved = ds.relocate_to_regression(self.built, self.a["example_id"], "itu1-0.3", "failed calibration")
        self.assertEqual(sorted(moved), sorted([self.a["example_id"], self.b["example_id"]]))
        self.assertEqual([r["example_id"] for r in new["test"]], [self.c["example_id"]])
        reg = new["regression"][0]
        self.assertEqual(reg["dataset_assignment"]["relocation_history"][0]["from_dataset_id"], "test")
        self.assertEqual(reg["dataset_assignment"]["split_assignment_method"], "relocated")
        self.assertEqual(ds.validate_dataset_record(reg), [])
        self.assertTrue(all(not v for v in ds.check_leakage(new).values()))       # D9 / D14
        self.assertEqual(len(self.built["test"]), 3)                              # input not mutated

    def test_only_from_eval_or_curated(self):
        tr = ds.build_datasets([ex(find_repo("training"), 1)], cfg()).datasets
        with self.assertRaises(ValueError):
            ds.relocate_to_regression(tr, tr["training"][0]["example_id"], "v1", "x")


class VersioningTests(unittest.TestCase):
    def test_semver_rules(self):
        prev = {"version": "1.2.0"}
        self.assertEqual(ds.next_version("training", None, set(), {"a"}), ("1.0.0", "initial"))
        self.assertEqual(ds.next_version("training", prev, {"a"}, {"a", "b"}), ("1.3.0", "minor"))
        self.assertEqual(ds.next_version("training", prev, {"a", "b"}, {"a"}), ("2.0.0", "major"))
        self.assertEqual(ds.next_version("training", prev, {"a"}, {"a"}, major_reasons=("split_salt changed",)), ("2.0.0", "major"))
        self.assertEqual(ds.next_version("training", prev, {"a"}, {"a"}, content_changed=True), ("2.0.0", "major"))
        self.assertEqual(ds.next_version("adversarial", prev, {"a"}, {"a"}, content_changed=True), ("1.3.0", "minor"))
        self.assertEqual(ds.next_version("test", prev, {"a"}, {"a"}, metadata_changed=True), ("1.2.1", "patch"))
        self.assertEqual(ds.next_version("test", prev, {"a"}, {"a"}), ("1.2.0", "none"))

    def test_regression_is_append_only(self):
        with self.assertRaises(ValueError):
            ds.next_version("regression", {"version": "1.0.0"}, {"a", "b"}, {"a"})


class StatisticsTests(unittest.TestCase):
    def recs(self):
        return ds.build_datasets(corpus(), cfg()).datasets["test"] + ds.build_datasets(corpus(), cfg()).datasets["training"]

    def test_shape(self):
        s = ds.dataset_statistics(self.recs())
        self.assertEqual(s["volume"]["total"], 4)
        self.assertIn("role", s["label_distribution"])
        self.assertEqual(s["label_distribution"]["languages"]["distinct_count"], 1)
        self.assertEqual(s["provenance"]["quality_tier"], {"GOLD": 4})
        self.assertEqual(s["provenance"]["inter_annotator_agreement"]["mean"], 0.9)

    def test_verdict_never_omits_axes_and_reports_fail(self):
        targets = {"task_type": {"floor": 0.05, "categories": ["Bug", "Security"]}, "repo_share": {"ceiling": 0.4}}
        v = {b["axis"]: b for b in ds.dataset_statistics(self.recs(), targets)["balance_verdict"]}
        self.assertEqual(set(ds.BALANCE_AXES), set(v))
        self.assertEqual(v["task_type"]["status"], "fail")            # no Security records
        self.assertEqual(v["repo_share"]["status"], "fail")
        self.assertEqual(v["role"]["status"], "no_target_defined")

    def test_quality_metrics(self):
        m = ds.quality_metrics(self.recs())
        self.assertEqual(m["schema_validity_rate"], 1.0)
        self.assertEqual(m["duplicate_rate"], 0.0)


class ReleaseTests(unittest.TestCase):
    def build(self, examples=None, prev=None, **kw):
        return ds.build_release(examples or corpus(), cfg(**kw), "rel-1", previous=prev)

    def test_release_shape_and_gate(self):
        datasets, rel, _ = self.build()
        self.assertEqual(ds.release_gate(rel), [])
        self.assertEqual(set(rel["datasets"]), set(ds.DATASET_IDS))
        e = rel["datasets"]["training"]
        for k in ("version", "source_version", "annotation_version", "schema_version", "split_salt", "record_count",
                  "statistics", "quality_metrics", "provenance"):
            self.assertIn(k, e)
        self.assertEqual(e["schema_version"], "2.0.0")
        v = rel["cross_dataset_checks"]["validation_tests"]
        self.assertEqual(set(v), set(ds.VALIDATION_TESTS))
        self.assertEqual(v["D8"], "pass")
        self.assertEqual(v["D9"], "not_applicable")

    def test_gate_blocks_failing_release(self):
        _, rel, _ = self.build()
        rel["cross_dataset_checks"]["leakage_tests"]["L4"] = "fail"
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ds.PublishError):
                ds.publish_release({d: [] for d in ds.DATASET_IDS}, rel, tmp)
            self.assertEqual(os.listdir(tmp), [])

    def test_publish_load_verify_roundtrip(self):
        datasets, rel, _ = self.build()
        with tempfile.TemporaryDirectory() as tmp:
            ds.publish_release(datasets, rel, tmp)
            self.assertEqual(ds.verify_release(tmp), [])
            loaded_rel, loaded = ds.load_release(tmp)
            self.assertEqual(loaded_rel["release_id"], "rel-1")
            self.assertEqual(len(loaded["test"]), 2)
            # tamper with a file -> hash mismatch is reported
            path = os.path.join(tmp, rel["datasets"]["test"]["file"])
            with open(path, "a") as f:
                f.write("\n")
            self.assertTrue(any("sha256" in p for p in ds.verify_release(tmp)))

    def test_d12_published_version_is_immutable(self):
        datasets, rel, _ = self.build()
        with tempfile.TemporaryDirectory() as tmp:
            ds.publish_release(datasets, rel, tmp)
            tampered = {d: list(v) for d, v in datasets.items()}
            tampered["test"] = tampered["test"][:1]
            rel2 = copy.deepcopy(rel)
            with self.assertRaises(ds.PublishError) as cm:
                ds.publish_release(tampered, rel2, tmp)
            self.assertIn("D12", str(cm.exception))
            self.assertEqual(rel2["cross_dataset_checks"]["validation_tests"]["D12"], "fail")

    def test_next_release_versions_from_previous(self):
        datasets, rel, _ = self.build()
        with tempfile.TemporaryDirectory() as tmp:
            ds.publish_release(datasets, rel, tmp)
            prev = ds.load_release(tmp)
            # unchanged corpus -> no version changes, identical files
            _, rel_same, _ = ds.build_release(corpus(), cfg(), "rel-2", previous=prev)
            self.assertTrue(all(e["version"] == "1.0.0" and e["version_change"] == "none" for e in rel_same["datasets"].values()))
            # add a training repo record -> training MINOR only
            more = corpus() + [ex(find_repo("training", start=100), 1, TRAIN_T)]
            _, rel_more, _ = ds.build_release(more, cfg(), "rel-3", previous=prev)
            self.assertEqual(rel_more["datasets"]["training"]["version"], "1.1.0")
            self.assertEqual(rel_more["datasets"]["test"]["version"], "1.0.0")
            # dropping a training example -> MAJOR
            fewer = corpus()[1:]
            _, rel_less, _ = ds.build_release(fewer, cfg(), "rel-4", previous=prev)
            self.assertEqual(rel_less["datasets"]["training"]["version"], "2.0.0")
            # salt change -> MAJOR everywhere that has a previous entry
            _, rel_salt, _ = ds.build_release(corpus(), ds.BuildConfig(split_salt="new", **CFG), "rel-5", previous=prev)
            self.assertTrue(all(e["version"].startswith("2.") for e in rel_salt["datasets"].values()))

    def test_regression_carries_forward_and_gets_minor(self):
        datasets, rel, _ = self.build()
        with tempfile.TemporaryDirectory() as tmp:
            ds.publish_release(datasets, rel, tmp)
            prev = ds.load_release(tmp)
            target = prev[1]["test"][0]["example_id"]
            new, moved = ds.relocate_to_regression(prev[1], target, "itu1-0.1", "wrong role")
            # rebuild: the test example is now known-failed; feed it in as regression, exclude from corpus
            remaining = [e for e in corpus() if e["example_id"] not in moved]
            d2, rel2, _ = ds.build_release(remaining, cfg(), "rel-2", previous=prev, regression=new["regression"])
            self.assertEqual(rel2["datasets"]["regression"]["record_count"], len(moved))
            self.assertEqual(ds.release_gate(rel2), [])
            self.assertEqual(rel2["datasets"]["regression"]["version"], "1.1.0")
            # test lost records -> MAJOR (removal from Test)
            self.assertEqual(rel2["datasets"]["test"]["version"], "2.0.0")
            self.assertEqual(rel2["cross_dataset_checks"]["validation_tests"]["D9"], "pass")

    def test_copy_instead_of_move_blocks_release(self):
        datasets, _, _ = self.build()
        reg_rec = ds.make_record({k: v for k, v in datasets["test"][0].items() if k != "dataset_assignment"}, "regression", "1.0.0",
                                 "relocated", {"type": "prior_model_failure", "source_model_version": "v1"},
                                 [{"from_dataset_id": "test", "to_dataset_id": "regression", "relocated_at": "x", "reason": "r"}])
        _, rel, _ = ds.build_release(corpus(), cfg(), "rel-x", regression=[reg_rec])   # test copy still present
        self.assertTrue(ds.release_gate(rel))

    def test_known_issues_lists_derived_cutoffs_and_balance_failures(self):
        _, rel, _ = ds.build_release(corpus(), ds.BuildConfig(split_salt=SALT,
                                     targets={"task_type": {"floor": 0.5, "categories": ["Security"]}}), "r")
        joined = " ".join(rel["known_issues"])
        self.assertIn("derived from data quantiles", joined)
        self.assertIn("task_type", joined)


class CliTests(unittest.TestCase):
    def test_build_and_verify(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = os.path.join(tmp, "ex.jsonl")
            with open(src, "w") as f:
                for e in corpus():
                    f.write(json.dumps(e) + "\n")
            out = os.path.join(tmp, "out")
            rc = ds.main(["build", src, out, "--salt", SALT, "--release-id", "r1",
                          "--train-cutoff", CFG["train_cutoff"], "--val-cutoff", CFG["val_cutoff"]])
            self.assertEqual(rc, 0)
            self.assertEqual(ds.main(["verify", out]), 0)
            self.assertTrue(os.path.exists(os.path.join(out, "manifest.json")))
            # rebuilding the same inputs is idempotent (no version change, no D12 failure)
            self.assertEqual(ds.main(["build", src, out, "--salt", SALT, "--release-id", "r2",
                                      "--train-cutoff", CFG["train_cutoff"], "--val-cutoff", CFG["val_cutoff"]]), 0)


if __name__ == "__main__":
    unittest.main()
