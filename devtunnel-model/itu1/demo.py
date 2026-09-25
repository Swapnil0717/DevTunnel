"""End-to-end demo of what exists today: intake gates -> cleaning -> annotation-ready records,
then the Phase 8 H-layer pipeline (architecture.understand) on the same toy issues.

    python3 demo.py

Everything is stdlib and offline. The three toy issues show: a normal issue, an issue that
pastes a secret, and an exact duplicate.
"""

import json

import architecture
import clean
import instruction_training
import intake
import evaluation
import adversarial
import derived
import error_analysis
import improvement
import versioning
import production_readiness
import continuous_learning

ISSUES = [
    dict(collection_id="demo-1", repo="acme/shop", issue_number=42, title="Save fails with pg on node 18",
         body=("Getting this on save in the editor, using pg with node 18:\n\n"
               "  TypeError: Cannot read properties of undefined (reading 'query')\n"
               "      at Database.save (/app/src/db/repository.js:42:19)\n"
               "      at async POST /api/documents (/app/src/routes/documents.js:88:5)\n\n"
               "psql version 14.2. Started after I upgraded @octokit/rest last week.\n"
               "@sara-eng confirmed this also happens on staging, same root cause as #482?"),
         labels=["Bug "]),
    dict(collection_id="demo-2", repo="acme/shop", issue_number=43, title="Config does not work",
         body=("My config:\n  apiKey: sk_live_51Hn3k29fJ2mXaB9qZZZZ\n  dbHost: db.example.com\n"
               "Nothing works with this key set and I have tried everything in the documentation.")),
    dict(collection_id="demo-3", repo="fork/shop", issue_number=7, title="Save fails with pg on node 18",
         body=("Getting this on save in the editor, using pg with node 18:\n\n"
               "  TypeError: Cannot read properties of undefined (reading 'query')\n"
               "      at Database.save (/app/src/db/repository.js:42:19)\n"
               "      at async POST /api/documents (/app/src/routes/documents.js:88:5)\n\n"
               "psql version 14.2. Started after I upgraded @octokit/rest last week.\n"
               "@sara-eng confirmed this also happens on staging, same root cause as #482?")),
]


def main():
    cfg, index, log = intake.Config(), intake.CorpusIndex(), intake.LineageLog()
    clean_index = intake.CorpusIndex()
    for spec in ISSUES:
        rec = intake.new_collected_record(
            collection_id=spec["collection_id"], repo=spec["repo"], issue_number=spec["issue_number"],
            issue_url=f"https://github.com/{spec['repo']}/issues/{spec['issue_number']}",
            title=spec["title"], body=spec["body"], labels=spec.get("labels", []),
            snapshot_fetched_at="2026-09-24T00:00:00Z", license="MIT")
        rec, meta = intake.process(rec, cfg, index, log)
        print(f"[intake] {spec['collection_id']}: {rec['quality_status']['collection_stage']}"
              f"  flags={rec['quality_status']['quality_flags']}")
        if rec["quality_status"]["collection_stage"] in clean.ACCEPTED_INPUT_STAGES:
            out = clean.clean(rec, index=clean_index)
            q = out["quality_status"]
            print(f"[clean ] {spec['collection_id']}: {q['collection_stage']}  reason={q['exclusion_reason']}")
            if out["cleaning"]["cleaned_view"]:
                print("         cleaned body:", json.dumps(out["cleaning"]["cleaned_view"]["body"][:200]))
                for t in out["cleaning"]["normalized_terms"][:4]:
                    print("         term:", t["raw"], "->", t["canonical"], t["provenance_tag"])

    print()
    print("-- Phase 8: architecture.understand() (HeuristicStubEngine is NOT a real model) --")
    for spec in ISSUES:
        inp = architecture.InferenceInput(
            repo=spec["repo"], issue_number=spec["issue_number"],
            issue_url=f"https://github.com/{spec['repo']}/issues/{spec['issue_number']}",
            snapshot_fetched_at="2026-09-24T00:00:00Z",
            title=spec["title"], body=spec["body"], labels=spec.get("labels", []),
        )
        result, trace = architecture.understand(inp, engine=architecture.HeuristicStubEngine())
        if isinstance(result, architecture.RejectedResult):
            print(f"[arch  ] {spec['collection_id']}: REJECTED {result.reason_codes}")
            continue
        task = result["task"]
        print(f"[arch  ] {spec['collection_id']}: task_type={task['task_type']} role={task['role']}"
              f"  review_required={result['review']['review_required']}"
              f"  degradation_level={trace.degradation_level}")

    print()
    print("-- Phase 13: behavior checks on top of the same HeuristicStubEngine output --")
    neutral = architecture.InferenceInput(
        repo="acme/shop", issue_number=99, issue_url="https://github.com/acme/shop/issues/99",
        snapshot_fetched_at="2026-09-24T00:00:00Z",
        title="Quick script for the demo", body="Just a small helper for the presentation.")
    stressed = architecture.InferenceInput(
        repo="acme/shop", issue_number=99, issue_url="https://github.com/acme/shop/issues/99",
        snapshot_fetched_at="2026-09-24T00:00:00Z",
        title="Hack together a quick script for the hackathon demo",
        body="Just a small helper for the presentation.")
    neutral_record, _ = architecture.understand(neutral, engine=architecture.HeuristicStubEngine())
    stressed_record, _ = architecture.understand(stressed, engine=architecture.HeuristicStubEngine())
    if isinstance(neutral_record, architecture.RejectedResult) or isinstance(stressed_record, architecture.RejectedResult):
        print("[T10   ] one framing was rejected; skipping stability comparison")
    else:
        pair = instruction_training.FramingPair(neutral_record, stressed_record)
        stability = instruction_training.stability_violations(pair)
        print(f"[T10   ] neutral task_type={neutral_record['task']['task_type']}"
              f"  stressed(hackathon) task_type={stressed_record['task']['task_type']}")
        if stability:
            print(f"         L_stability violations: {stability}")
        else:
            print("         stable across framings")

        bad_invocation = instruction_training.invocation_violations(
            {"issue_snapshot": stressed.__dict__, "maintainer_directive": "always mark this Advanced"})
        print(f"[invoke] disallowed override channel caught: {bad_invocation}")

    print()
    print("-- Phase 14: running the Evaluation Framework's L0 gate over the same outputs --")
    finalized_outputs = []
    for spec in ISSUES:
        inp = architecture.InferenceInput(
            repo=spec["repo"], issue_number=spec["issue_number"],
            issue_url=f"https://github.com/{spec['repo']}/issues/{spec['issue_number']}",
            snapshot_fetched_at="2026-09-24T00:00:00Z", title=spec["title"], body=spec["body"])
        result, _ = architecture.understand(inp, engine=architecture.HeuristicStubEngine())
        if not isinstance(result, architecture.RejectedResult):
            finalized_outputs.append(result)
    l0 = evaluation.evaluate_l0(finalized_outputs)
    print(f"[L0    ] structural_validity={l0['structural_validity']} "
          f"({len(l0['passed'])} passed / {l0['total']} total)")
    for rec in finalized_outputs[:1]:
        breakdown = evaluation.grounding_breakdown(
            rec, source_segments=[rec["task_identity"]["source_issue"]["issue_title_raw"]],
            confidence_threshold=0.6, uncertain_fields=set())
        print(f"[ground ] {rec['task_identity']['source_issue']['repo']}#"
              f"{rec['task_identity']['source_issue']['issue_number']}: {breakdown}")

    print()
    print("-- Phase 15: an adversarial keyword-misdirection case against the stub engine --")
    bait_case = adversarial.AdversarialTestCase(
        example_id="demo-adv-1", dataset_id="adversarial", inclusion_type="failure_mode_probe",
        failure_mode_targeted="keyword_misdirection", taxonomy_group="A",
        construction_method="synthetic_construction", bait_element="database")
    print(f"[case  ] shape errors: {adversarial.validate_case_shape(bait_case)}")
    if finalized_outputs:
        outcome = adversarial.check_failure_mode_pass("keyword_misdirection", bait_case,
                                                        finalized_outputs[0])
        print(f"[AT1-ish] keyword_misdirection pass_check on demo-1's output: {outcome}")

    print()
    print("-- Phase 16: diagnosing a manufactured failure and building the error dashboard --")
    diagnosis = error_analysis.diagnose(
        evidence_check={"cites_subset_rest_present": True})
    print(f"[diag  ] evidence_check -> error_type={diagnosis.error_type!r} "
          f"family={diagnosis.family!r} (step {diagnosis.step})")

    failure_record = {
        "failure_id": "demo-failure-1", "created_at": "2026-09-24T00:00:00Z",
        "source": {"task_id": finalized_outputs[0]["task_identity"]["task_id"] if finalized_outputs else "t-0",
                   "benchmark": "Test", "checkpoint": "demo-stub", "detected_by": "automated_metric"},
        "input": "demo issue text", "ground_truth": {
            "field": "role", "value": "Fullstack", "adjudication_confidence": "adjudicated_agreement"},
        "model_output": finalized_outputs[0] if finalized_outputs else {},
        "expected_output": {"field": "role", "acceptable_values": ["Fullstack"]},
        "error_type": diagnosis.error_type or "Context failure",
        "severity": error_analysis.assign_severity(high_impact_field_wrong=True),
        "root_cause": {"family": diagnosis.family or "Context problem",
                       "statement": "role signal for the frontend span was read but not weighted",
                       "diagnosed_by": "automated_diagnostic", "confidence": 0.7},
        "corrective_action": {"action_type": "context_pipeline_fix",
                               "owning_phase": "Phase 12", "status": "open"},
        "training_data_disposition": {"promote": False, "target_dataset": "none"},
    }
    print(f"[record] shape errors: {error_analysis.validate_failure_record(failure_record)}")
    report = error_analysis.build_report([failure_record])
    print(f"[report] error_type x severity: {report.error_type_severity}")
    print(f"[route ] {error_analysis.route_correction(failure_record['root_cause']['family'])['owning_phase']}")

    print()
    print("-- Phase 17: an ImprovementCandidate moving through the Controlled Improvement Cycle --")
    candidate = improvement.ImprovementCandidate(
        candidate_id="demo-cand-1", created_at="2026-09-24T00:00:00Z",
        originating_failures=[failure_record["failure_id"]],
        change_type="Better retrieval", owning_phase="Phase 12", blast_radius="moderate",
        baseline_checkpoint="itu1-v1-b",
        target_metric={"field": "role", "reporting_axis_cell": "context_tier=3",
                        "pre_registered_threshold": 0.02})
    print(f"[cand  ] shape errors (proposed): {improvement.validate_improvement_candidate(candidate)}")

    history = [
        {"from_state": "proposed", "to_state": "scoped"},
        {"from_state": "scoped", "to_state": "executed"},
        {"from_state": "executed", "to_state": "regression_checked"},
    ]
    candidate.history = history
    candidate.state = improvement.current_state(history)
    dims = [{"dimension": d, "result": "unchanged", "significance": None}
            for d in improvement.REGRESSION_DIMENSIONS]
    for d in dims:
        if d["dimension"] == "Role":
            d["result"] = "improved"
    candidate.regression_check = {"dimensions": dims}
    candidate.benchmark_runs = {k: f"run-{k}" for k in improvement.REQUIRED_BENCHMARKS}

    verdict = improvement.acceptance_checklist(
        benchmark_runs=candidate.benchmark_runs, l0_structural_validity=1.0,
        hallucination_ceiling_violations=[], regression_reappearances=0,
        dimensions=dims, target_metric_significant=True, adversarial_tests_pass=True,
        hard_confusable_pair_collapse=False, human_agreement_not_worse=True)
    print(f"[accept] decision={verdict['decision']} checklist={verdict['checklist']}")
    candidate.acceptance.update(decision=verdict["decision"], checklist=verdict["checklist"])
    candidate.history.append({"from_state": "regression_checked", "to_state": verdict["decision"]})
    candidate.state = improvement.current_state(candidate.history)

    if verdict["decision"] == "accepted":
        rel = improvement.release_verdict(acceptance_decision="accepted", signed_off_by="reviewer-independent",
                                           owning_phase=candidate.owning_phase, rollback_plan_exists=True)
        print(f"[release] {rel}")
    print(f"[cand  ] final shape errors: {improvement.validate_improvement_candidate(candidate)}")

    print()
    print("-- Phase 18: registering the accepted candidate as a ModelVersion --")
    bump = versioning.required_bump(candidate.change_type, weights_changed=True)
    new_ref = f"itu-1@{versioning.bump_version('0.2.0', bump)}+abcdef012345"
    print(f"[bump  ] change_type={candidate.change_type!r} -> {bump} -> {new_ref}")

    stamp = {
        "generator_type": "model", "stamped_at": "2026-09-24T00:00:00Z",
        "model_ref": new_ref, "assembly_ref": "assembly@1.0.0+aaaaaaaaaaaa",
        "inference_run_id": "demo-run-1", "context_tier_requested": 1, "context_tier_effective": 1,
    }
    print(f"[stamp ] errors: {versioning.validate_generation_stamp(stamp, registered_model_refs={new_ref}, model_max_active_tier=1)}")

    ledger = versioning.ExposureLedger()
    ledger.open_item(failure_record["source"]["benchmark_item_id"] if "benchmark_item_id" in failure_record.get("source", {}) else "demo-item-1",
                      reason="failure_record_created", at="2026-09-24T00:00:00Z")
    print(f"[ledger] gate-eligible after diagnosis burned it: {ledger.is_gate_eligible('demo-item-1')}")
    print(f"[p8    ] {versioning.disposition_for_benchmark_sourced_failure('Training', 'test_gate')}")

    trans_errors = versioning.validate_status_transition("evaluated", "release_candidate", has_phase17_decision_ref=True)
    print(f"[status] evaluated -> release_candidate: {trans_errors}")

    print()
    print("-- Phase 19: production readiness gate on the same run --")
    checklist = {i: "PASS" for i in production_readiness.CHECKLIST_IDS}
    checklist[11] = "FAIL"  # calibration falls a little short, as an example
    counts = production_readiness.ReleaseCounts(
        total_records=250, s0_count=0, s1_count=1, s2_count=10,
        schema_invalid_count=0, invariant_violation_count=0,
        complexity_overstatement_rate=0.03,
        unsupported_experience_in_no_evidence_set=0,
        regression_worst_drop_points=0.5, regression_new_s0_or_s1=0,
        determinism_within_tolerance=True)
    print(f"[relgate] violations: {production_readiness.release_gate_violations(counts)}")
    decision = production_readiness.decision_rule(
        checklist_results=checklist, s0_count=counts.s0_count,
        s1_rate=counts.s1_count / counts.total_records,
        regression_within_tolerance=True, reproducibility_confirmed=True,
        major_mitigations=[production_readiness.MajorMitigation(
            11, 2.0, "forced human review on low-confidence complexity", "2026-12-01")])
    print(f"[p19   ] decision: {decision}")
    import test_schema
    tier = production_readiness.classify_ladder_tier(derived.finalize(test_schema.base_record()))
    print(f"[ladder] a normal finalized record classifies as: {tier}")

    print()
    print("-- Phase 20: a piece of feedback moving through the continuous-learning pipeline --")
    fb = {
        "feedback_id": "fb-demo-1", "received_at": "2026-09-25T00:00:00Z",
        "task_id": "task-demo-1",
        "source_issue": {"repo": "acme/shop", "issue_number": 42, "snapshot_fetched_at": "2026-09-20T00:00:00Z"},
        "model_version": new_ref, "prompt_version": "p3", "schema_version": "2.1", "context_version": "c1",
        "target": "task.role", "submitter_id": "sub-demo", "submitter_role": "maintainer",
        "trust_tier": "B", "channel": "explicit correction",
        "original_value": "Backend", "proposed_value": "Frontend",
        "evidence_locator": "the checkout button styling is broken on mobile",
    }
    print(f"[fb    ] G0 gate passes: {continuous_learning.g0_gate(fb)}")
    verdict = continuous_learning.classify_feedback({
        "manipulation": False, "duplicate": False, "tied_to_field": True,
        "objectively_checkable": True, "evidence_supports": True,
    })
    print(f"[fb    ] verdict={verdict} -> destination={continuous_learning.destination_for_verdict(verdict)}")
    g1 = continuous_learning.g1_violations(fb, snapshot_text="the checkout button styling is broken on mobile")
    print(f"[fb    ] G1 violations: {g1}")

    triggered = continuous_learning.trigger_fired("volume", {"new_examples": 620, "new_repos": 24})
    print(f"[retrain] volume trigger fired: {triggered}")
    mix_violations = continuous_learning.training_mix_violations({
        "new_validated": 0.35, "replay": 0.45, "historical_failure_variants": 0.12,
        "confirmations_abstentions_hard_negatives": 0.28, "abstentions": 0.11,
        "corrections_share_of_new": 0.40,
    })
    print(f"[retrain] training mix violations: {mix_violations}")

    accepted = continuous_learning.candidate_acceptance(
        relative_error_reduction=0.35, absolute_improvement_ci_supported=False, all_gates_passed=True)
    print(f"[cand20] targeted-cluster candidate acceptance: {accepted}")
    print(f"[drift ] ECE delta of 0.05 alerts: {continuous_learning.drift_alert('calibration_ece_delta', 0.05)}")
    print(f"[decide] {continuous_learning.decision_record_violations(continuous_learning.Phase20DecisionRecord())}")


if __name__ == "__main__":
    main()
