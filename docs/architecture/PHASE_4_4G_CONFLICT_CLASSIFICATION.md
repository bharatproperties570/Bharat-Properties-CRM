# PHASE 4.4G — FINAL CONFLICT CLASSIFICATION AUDIT

## SUMMARY
- Total Blocked Deals: 75
- True Business Conflicts: 74
- Schema/BSON Type Mismatches: 1

## 1. SCHEMA/BSON TYPE MISMATCH
These records have identical underlying identifiers but were blocked due to strict BSON type validation.

- **Deal ID**: `6a3322abd9dc119278626f61`
  - Owner: `69c4be0fd8c5cd0d6c90e999` (Type: string)
  - AssignedTo: `69c4be0fd8c5cd0d6c90e999` (Type: ObjectId)
  - Normalized Comparison: EQUAL

## 2. TRUE BUSINESS CONFLICTS
These 74 records have genuinely conflicting values for `owner` and `assignedTo`.

| Deal ID | Owner | Owner Type | AssignedTo | AssignedTo Type | Normalized Match |
|---|---|---|---|---|---|
| `6a28095f11d0da160fc239bf` | `69b7e514f842365fc5efcc91` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a7dccc2c3a099e957a515b5` | `69b7e514f842365fc5efcc91` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a2eaf67091835e774de4668` | `6a042c0d3a973e7d97ff9aba` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a2eaf3a091835e774de44a0` | `6a04331f4f2dc4d8337b7441` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a05799a9839fe10f1966d93` | `6a0566a73a11cd6fd55f587b` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a057bf99839fe10f1968312` | `6a0566a73a11cd6fd55f587b` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a1c0cfa7110d90e67199bb8` | `6a0868afd24d16b7defaa8f2` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a0aab273dc4e53fd3f6a95d` | `6a0aaa363dc4e53fd3f6a4a4` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a0aabf53dc4e53fd3f6b332` | `6a0aaa363dc4e53fd3f6a4a4` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a0b256f801339fa69fa4d46` | `6a0b24c7801339fa69fa4997` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a0c2ac5f649d37c2257e35a` | `6a0c2717bd91cf63572263d7` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a0ed0755486a81eeab6dfcb` | `6a0ecfbd5486a81eeab6dbc0` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a0fcc228b19d7f8ad7604fb` | `6a0fcb368b19d7f8ad760100` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a72fe96ae82831494365cc7` | `6a1157fd81cafa4b270611c5` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a1309e58c845d5a7e1f9d69` | `6a13091e8c845d5a7e1f99c1` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a1449ba0e65b8faea12d717` | `6a14490a0e65b8faea12d3ac` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a1eb853fa0dbcb534d4e4e8` | `6a1eb793fa0dbcb534d4e082` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a1eb80cfa0dbcb534d4e363` | `6a1eb793fa0dbcb534d4e082` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a4f7547fcc327c68ab59e2d` | `6a24112cdcb161f0fe669301` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a27be0311d0da160fc1e16f` | `6a24525811d0da160fbec117` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a26c03811d0da160fc0dedd` | `6a26bfac11d0da160fc0dbd4` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a26c1a111d0da160fc0e74e` | `6a26c10811d0da160fc0e3ce` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a26c4ad11d0da160fc0f643` | `6a26c34c11d0da160fc0ed71` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a26ca5a11d0da160fc1078f` | `6a26c52e11d0da160fc0fa31` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a26cfae11d0da160fc11883` | `6a26cf3c11d0da160fc115a0` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a26d0c711d0da160fc11fe1` | `6a26d02711d0da160fc11c79` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a27bfa711d0da160fc1f55d` | `6a27beed11d0da160fc1ec8a` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a28074911d0da160fc22e23` | `6a27c01d11d0da160fc1fc28` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a2808d811d0da160fc2363c` | `6a28083b11d0da160fc23317` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a280b8811d0da160fc245ea` | `6a280b1211d0da160fc24319` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a280e0711d0da160fc2556e` | `6a280da411d0da160fc252bc` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a3c81c5494b4de5e9280730` | `6a280da411d0da160fc252bc` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a280fc511d0da160fc25e1b` | `6a280ea011d0da160fc259eb` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a2811c711d0da160fc266f6` | `6a28111c11d0da160fc26336` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a28176011d0da160fc27639` | `6a2816e011d0da160fc27331` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a2822aa11d0da160fc289bd` | `6a28211f11d0da160fc28569` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a2828a311d0da160fc29d23` | `6a28279c11d0da160fc2993e` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a2829a311d0da160fc2a415` | `6a28291b11d0da160fc2a11b` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a29143211d0da160fc32bce` | `6a29118311d0da160fc31f56` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a2915f111d0da160fc334b7` | `6a29118311d0da160fc31f56` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a29157811d0da160fc33184` | `6a29118311d0da160fc31f56` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a29342c11d0da160fc34e60` | `6a2932a9d90f8cddbc1baa9f` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a3d193a494b4de5e9281ddb` | `6a2e2e82f2b91883b1001040` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a54ad7c4489cc8956c68b3f` | `6a35365ffe7d00ac9861d55c` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a72f1ee0a9fdfe9fb6d195e` | `6a3536c3fe7d00ac9861d858` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a72f2600a9fdfe9fb6d1d76` | `6a3536c3fe7d00ac9861d858` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a3bfd26494b4de5e927dd57` | `6a3bfcad494b4de5e927da11` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a433aab494b4de5e9286c30` | `6a433915494b4de5e92862cc` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a4b7319462ce89e42695f04` | `6a4b72a1462ce89e42695d42` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a79859f1cd6f16e32fe6700` | `6a4d1689beaf81625067ab0e` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a4fcf47d9ed3cd9214e49ac` | `6a4fce5dd9ed3cd9214e4653` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a54bf693bcac3586384aec6` | `6a54be713bcac3586384aa6b` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a54bedf3bcac3586384abec` | `6a54be713bcac3586384aa6b` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a54bf273bcac3586384ad66` | `6a54be713bcac3586384aa6b` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a5de2fc68dc49934d1e1051` | `6a5de26668dc49934d1e0e22` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a5e078468dc49934d1e3729` | `6a5e06f260d9a2c57ee73176` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a636b74a3182b752fd9dafc` | `6a636ad0a3182b752fd9d895` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a6c06bdb5cba0a83665c9bf` | `6a69ec99006432defa7b988d` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a797b251cd6f16e32fdc235` | `6a6a165f006432defa7c38e1` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a731e18089d2d1b6508623f` | `6a6abe32006432defa7decbc` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a6b61d7b5cba0a836657e84` | `6a6b6069b5cba0a836656b73` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a72f2b50a9fdfe9fb6d2157` | `6a6cc6bd7a1a51b4a30ee5cf` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a857fc43a5e94539fe78cbe` | `6a6e03959d3de196224a8d40` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a86535e3a5e94539fe94a6a` | `6a857db83a5e94539fe76250` | string | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a4fa65f6980775f51dac364` | `6a24122edcb161f0fe66a849` | ObjectId | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a4fa7886980775f51dac7bf` | `6a2452e611d0da160fbec77e` | ObjectId | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a5dd1bc68dc49934d1df275` | `6a26338811d0da160fc073ca` | ObjectId | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a4b9fbf462ce89e42697396` | `6a2e2df5f2b91883b1000451` | ObjectId | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a394207f1cab2bfb29896cc` | `6a3940e5f1cab2bfb2988dd7` | ObjectId | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a61dd69249a40af34731466` | `6a4d1503beaf81625067999f` | ObjectId | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a4f4b5a56b80aeb2b9eeca1` | `6a4d171ebeaf81625067afd5` | ObjectId | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a7838931cd6f16e32fb2e17` | `6a58adc35c2132f2a33e0934` | ObjectId | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a882e5d0465afe731e7afdf` | `6a6de4639d3de196224988ec` | ObjectId | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
| `6a85229f3a5e94539fe62c08` | `6a6de6d49d3de1962249a87c` | ObjectId | `69c4be0fd8c5cd0d6c90e999` | ObjectId | FALSE |
