# Reviewer Authority R1

## Why this exists

Pronunciation Lab now distinguishes three separate questions:

```text
What was reviewed?
  -> exact artifact ID + SHA-256 binding

What did the reviewer decide?
  -> structured review evidence

Was that reviewer authorized for this role/scope at review time?
  -> ReviewerAuthorityRecord
```

A role string such as `native_linguistic` or `clinical` is no longer sufficient by itself for governed review/release.

## Authority record

A `ReviewerAuthorityRecord` contains:

- reviewer ID;
- role: `native_linguistic` or `clinical`;
- locale scopes;
- optional target-class scopes;
- qualification/evidence references;
- authorization time;
- optional expiry;
- active/retired state;
- retirement timestamp/reason when applicable;
- deterministic grant and record fingerprints.

Pronunciation Lab does not decide what professional credential is legally or clinically sufficient. The application or organization that issues the authority record is responsible for verifying the referenced qualifications.

## Time-aware validation

Authorization is evaluated at the **review timestamp**.

A reviewer whose authority is retired later can retain valid historical evidence created while the authorization was active. Reviews created after retirement or expiry fail.

## Artifact review

The blind audio-review submission APIs now require a scoped reviewer-authority record.

The resulting evidence stores `reviewerAuthorityId`, and release requires the corresponding authority record to be supplied and valid for:

- reviewer identity;
- review role;
- target locale;
- target class;
- review timestamp.

## Target authoring review

The `nl-BE /s/ initial` experiment now exposes a 12-item native-review packet.

Each item requires explicit review of:

- lexical/child suitability;
- canonical nl-BE IPA;
- initial /s/ identity;
- singleton onset;
- following phone;
- syllable count;
- stress;
- ambiguity;
- concept/image suitability.

A passing target-authoring review must come from a reviewer authorized for:

```text
role = native_linguistic
locale = nl-BE
targetClass = s_initial_singleton
```

Only that passing evidence can create a `native_reviewed` target-registry record.

## Boundary

Reviewer authority records are governance metadata, not identity verification, credential issuance, or cryptographic signatures. A trusted deployment must control who can issue/update these records and preserve their provenance.
