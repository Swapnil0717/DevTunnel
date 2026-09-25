import copy
import json
import os
import tempfile
import unittest

import export_sft as ex
from derived import validate_all
from test_example import make_example


def example(i, repo, tier="GOLD", flags=()):
    e = make_example()
    gt = e["ground_truth"]
    src = gt["task_identity"]["source_issue"]
    src.update(repo=repo, issue_number=i, issue_url=f"https://github.com/{repo}/issues/{i}")
    lp = e["label_provenance"]
    lp.update(source_repo=repo, source_issue_url=src["issue_url"])
    e["example_id"] = f"ex-{repo}-{i}"
    e["quality_status"]["tier"] = tier
    e["quality_status"]["quality_flags"] = list(flags)
    if tier != "GOLD":
        e["label_provenance"].update(labeling_method="MODEL_ASSISTED_HUMAN_CORRECTED", annotator_ids=["a1"],
                                     inter_annotator_agreement=None)
    return e


class ChatTests(unittest.TestCase):
    def test_target_excludes_derived_fields(self):
        t = ex.target_of(example(1, "a/x"))
        self.assertEqual(set(t), {"task", "provenance", "missing_information"})

    def test_chat_has_no_labels_or_metadata_in_user_turn(self):
        e = example(1, "a/x")
        e["input"]["context_tier"] = 2
        e["input"]["available_context"] = {"readme": "# hi"}
        chat = ex.to_chat(e)
        user = chat["messages"][1]["content"]
        self.assertNotIn("label_provenance", user)
        self.assertNotIn("ground_truth", user)
        self.assertEqual(json.loads(user)["available_context"], {"readme": "# hi"})


class SplitTests(unittest.TestCase):
    def test_split_is_repo_level(self):
        exs = [example(i, f"org/r{r}") for r in range(30) for i in range(3)]
        train, ev, _ = ex.split(exs, eval_fraction=0.3, seed=1)
        tr_repos = {e["label_provenance"]["source_repo"] for e in train}
        ev_repos = {e["label_provenance"]["source_repo"] for e in ev}
        self.assertTrue(tr_repos and ev_repos)
        self.assertEqual(tr_repos & ev_repos, set())

    def test_cluster_links_repos_into_one_split(self):
        exs = [example(1, "org/a", flags=[]), example(1, "fork/a", flags=[])]
        exs[0]["quality_status"]["tier"] = exs[1]["quality_status"]["tier"] = "SILVER"
        for e in exs:
            e["quality_status"]["tier"] = "SILVER"
            e["quality_status"]["quality_flags"] = ["near_dup_cluster:c-1"]
            e["label_provenance"].update(labeling_method="MODEL_ASSISTED_HUMAN_CORRECTED", annotator_ids=["a"],
                                         inter_annotator_agreement=None)
        groups = ex.repo_groups(exs)
        self.assertEqual(groups["org/a"], groups["fork/a"])
        for seed in range(20):
            train, ev, _ = ex.split(exs, 0.5, seed)
            self.assertIn((len(train), len(ev)), {(2, 0), (0, 0)})     # never split across

    def test_eval_is_gold_only_and_bronze_not_trained_by_default(self):
        exs = [example(1, "a/x", "SILVER"), example(2, "a/x", "BRONZE")]
        train, ev, _ = ex.split(exs, eval_fraction=0.0)
        self.assertEqual([e["quality_status"]["tier"] for e in train], ["SILVER"])
        train, ev, _ = ex.split(exs, eval_fraction=1.0)
        self.assertEqual((train, ev), ([], []))                         # silver in an eval repo is dropped

    def test_invalid_examples_reported_and_dropped(self):
        bad = example(1, "a/x")
        bad["label_provenance"]["labeling_method"] = "GUESS"
        train, ev, problems = ex.split([bad, example(2, "b/y")], eval_fraction=0.0)
        self.assertEqual(len(train), 1)
        self.assertEqual(len(problems), 1)

    def test_cli_roundtrip(self):
        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, "in.jsonl")
            with open(src, "w") as fh:
                for r in range(20):
                    fh.write(json.dumps(example(1, f"o/r{r}")) + "\n")
            ex.main([src, os.path.join(d, "out"), "--eval-fraction", "0.25"])
            with open(os.path.join(d, "out", "train.jsonl"), encoding="utf-8") as fh:
                rows = [json.loads(l) for l in fh]
            self.assertTrue(rows and rows[0]["messages"][0]["role"] == "system")
            self.assertTrue(os.path.exists(os.path.join(d, "out", "eval.jsonl")))


class AssembleTests(unittest.TestCase):
    def setUp(self):
        self.e = example(1, "a/x")
        self.pred = ex.target_of(self.e)
        self.src = copy.deepcopy(self.e["ground_truth"]["task_identity"]["source_issue"])

    def test_gold_target_round_trips_to_valid_record(self):
        rec, errs = ex.assemble_record(self.pred, self.src)
        self.assertEqual(errs, [])
        self.assertEqual(validate_all(rec), [])

    def test_derived_fields_are_computed_not_copied(self):
        p = copy.deepcopy(self.pred)
        for e in p["provenance"].values():
            if e["confidence"] is not None:
                e["confidence"] = 0.2
        rec, errs = ex.assemble_record(p, self.src)
        self.assertTrue(rec["review"]["review_required"])

    def test_rule_violations_surface(self):
        p = copy.deepcopy(self.pred)
        del p["provenance"]["role"]
        _, errs = ex.assemble_record(p, self.src)
        self.assertTrue(any("rule 1" in e for e in errs))

    def test_garbage_prediction(self):
        self.assertTrue(ex.assemble_record({"x": 1}, self.src)[1])
        self.assertTrue(ex.assemble_record({"task": 1, "provenance": 2}, self.src)[1])

    def test_parse_model_text(self):
        obj, err = ex.parse_model_text('sure!\n```json\n{"a": 1}\n```')
        self.assertEqual((obj, err), ({"a": 1}, None))
        self.assertIsNotNone(ex.parse_model_text("no json here")[1])
        self.assertIsNotNone(ex.parse_model_text("{bad json}")[1])


if __name__ == "__main__":
    unittest.main()
