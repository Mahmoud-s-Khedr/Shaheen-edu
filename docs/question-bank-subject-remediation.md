# Question-bank subject remediation

The first rollout leaves `QuestionBank.subjectId` nullable only for legacy empty
and mixed-subject banks. New banks require a subject and learner generation
excludes unresolved banks.

After the transition migration is deployed, inspect the production database:

```bash
tsx scripts/remediate-question-bank-subjects.ts --report
```

Create an explicit mapping file for every empty or mixed bank, then apply it:

```json
{
  "empty": { "empty-bank-id": "chosen-subject-id" },
  "mixed": {
    "mixed-bank-id": {
      "primarySubjectId": "first-subject-id",
      "splitSubjects": { "second-subject-id": "Bank title for the second subject" }
    }
  }
}
```

```bash
tsx scripts/remediate-question-bank-subjects.ts --apply mappings.json
tsx scripts/remediate-question-bank-subjects.ts --check
```

`--check` exits non-zero until every legacy bank has a subject. Only after it
passes should a separately released migration make `subjectId` required.
