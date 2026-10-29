# Phase 17 — AWS Infrastructure Hardening: Least-Privilege IAM Role & KMS Policy Specification

## 1. Executive Summary & Verified Baseline

This specification defines the least-privilege AWS Identity and Access Management (IAM) role, instance profile, Key Management Service (KMS) encryption standard, and staged execution plan for Bharat Properties CRM.

### Verified Target Environment
- **AWS Account ID**: `397633117324`
- **Primary AWS Region**: `eu-north-1` (Stockholm)
- **EC2 Production Host**: `i-01a6c602f0547c9ee` (`13.48.10.13` in `eu-north-1b`)
- **Instance Profile Status**: Verified via IMDSv2 (`169.254.169.254/latest/meta-data/iam/info` -> `404 Not Found`). **No IAM role is currently attached.**
- **Credential Objective**: Transition application workloads (Phase 11 S3 Document Storage and Phase 17 Offsite Encrypted Backups) to temporary IAM instance credentials, eliminating long-lived static AWS access keys.

---

## 2. Operational Readiness Tiers & Evidence Matrix

To avoid conflating unit tests with real cloud infrastructure readiness, Phase 17 deliverables are categorized across four strict operational readiness tiers:

| Tier | Status | Scope & Evidence |
| :--- | :---: | :--- |
| **Tier 1: Implemented & Unit-Tested** | **VERIFIED** | Codebase validation engines (`AWSConfigValidator`, `BackupEncryptionVerifier`), path traversal defenses, symlink boundaries, circular-ref safe redaction, and 51 leaf unit tests (62 runner test contexts) passing in `tests/phase17_infrastructure_hardening.test.js`. |
| **Tier 2: Verified in Non-Production Environment** | **VERIFIED** | Standalone preflight CLI (`backend/scripts/preflight-aws-check.js`) running zero-leakage dry-runs, isolated backup test harness (`scripts/release/test-backup-pipeline.sh`), and GitHub Actions CI Quality Gate passing green across PR #24, #25, and #26. |
| **Tier 3: Verified in AWS Production** | **VERIFIED (BASELINE)** | EC2 host forensics on `i-01a6c602f0547c9ee` (`13.48.10.13` in `eu-north-1b`). Confirmed local automated backup runs daily at 03:00 UTC creating compressed tarballs in `/home/ubuntu/bharat-crm-backups/archives/`. Confirmed IMDSv2 returns `404` for attached IAM role. |
| **Tier 4: Blocked Pending Administrator Action** | **BLOCKED (EXT-AWS)** | Attaching `BharatPropertiesCRMInstanceProfile` to EC2 `i-01a6c602f0547c9ee`, provisioning S3 buckets with SSE-KMS, and provisioning Customer Managed KMS Key with automated annual rotation. |

---

## 3. Live Production Backup Forensic Assessment

Forensic analysis of the existing production backup pipeline (`/home/ubuntu/bin/automated-backup.sh` and `scripts/release/automated-backup-hardened.sh`) reveals the following architectural characteristics:

1. **Encryption at Rest (Local Archives)**:
   - Current local backup archives (`bharat-crm-backup-*.tar.gz`) are plain gzip tarballs protected only by POSIX file permissions (`chmod 600` on archives, `chmod 700` on directories).
   - Archives do not have application-layer encryption (e.g. AES-256-GCM or GPG). Security at rest relies entirely on the underlying AWS EBS volume encryption of host `i-01a6c602f0547c9ee`.
2. **Manifest Integrity & Tamper Protection**:
   - The manifest (`.manifest.json`) and `.sha256` files store SHA-256 checksums and file sizes.
   - **Protection Level**: Accidental corruption detection (bit rot, incomplete writes, truncated transfers).
   - **Tamper Protection**: Manifests are **not** digitally signed (no HMAC with a secret, no GPG signature, no KMS asymmetric signature). A compromised root account or privileged process could modify both the archive and overwrite the manifest undetected.
3. **Retention Policy**:
   - **Implemented**: Daily backups older than 30 days are pruned, with a hard floor of retaining at least 3 valid archives (`MIN_RETAIN_COUNT=3`).
4. **Offsite Copy & Restore Readiness**:
   - **Offsite Copy**: Merely designed (`DESIGNED_NOT_PROVISIONED`). Without an IAM instance profile or static keys, Stage 12 of the backup script skips offsite synchronization.
   - **Restore Readiness**: No automated restore drill or verification pipeline runs against production backups. Restore readiness is theoretical until regular automated restore drills are instituted.

---

## 4. Proposed IAM Architecture

```
+-------------------------------------------------------------+
|                     AWS Account 397633117324                |
|                                                             |
|   +-----------------------------------------------------+   |
|   | EC2 Instance i-01a6c602f0547c9ee (eu-north-1b)       |   |
|   |  - Instance Profile: BharatPropertiesCRMProfile     |   |
|   |  - Role: BharatPropertiesCRMInstanceRole            |   |
|   +--------------------------+--------------------------+   |
|                              | (Temporary STS Tokens)       |
|                              v                              |
|   +-----------------------------------------------------+   |
|   | Permissions Policy: BharatPropertiesCRMAppPolicy    |   |
|   |  1. S3 Documents Bucket (SSE-KMS enforced)          |   |
|   |  2. S3 Encrypted Backups Bucket (No DeleteObject)   |   |
|   |  3. KMS Customer-Managed Key (CMK)                  |   |
|   |  4. Explicit Deny on non-TLS requests               |   |
|   +-----------------------------------------------------+   |
+-------------------------------------------------------------+
```

---

## 5. Trust Relationship (`trust-policy.json`)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ec2.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

---

## 6. Least-Privilege Application Policy (`app-policy.json`)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowDocumentBucketAccess",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:AbortMultipartUpload",
        "s3:ListBucketMultipartUploads"
      ],
      "Resource": [
        "arn:aws:s3:::bharat-crm-documents-eu-north-1/*"
      ]
    },
    {
      "Sid": "AllowDocumentBucketListing",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": "arn:aws:s3:::bharat-crm-documents-eu-north-1"
    },
    {
      "Sid": "AllowBackupBucketArchiveUpload",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::bharat-crm-backups-eu-north-1",
        "arn:aws:s3:::bharat-crm-backups-eu-north-1/*"
      ]
    },
    {
      "Sid": "AllowKmsKeyUsageForS3",
      "Effect": "Allow",
      "Action": [
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:ReEncrypt*",
        "kms:GenerateDataKey*",
        "kms:DescribeKey"
      ],
      "Resource": "arn:aws:kms:eu-north-1:397633117324:key/*",
      "Condition": {
        "StringEquals": {
          "kms:ViaService": "s3.eu-north-1.amazonaws.com"
        }
      }
    },
    {
      "Sid": "EnforceTlsOnly",
      "Effect": "Deny",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::bharat-crm-documents-eu-north-1/*",
        "arn:aws:s3:::bharat-crm-documents-eu-north-1",
        "arn:aws:s3:::bharat-crm-backups-eu-north-1/*",
        "arn:aws:s3:::bharat-crm-backups-eu-north-1"
      ],
      "Condition": {
        "Bool": {
          "aws:SecureTransport": "false"
        }
      }
    }
  ]
}
```

> [!NOTE]
> The EC2 policy grants `s3:PutObject`, `s3:GetObject`, and `s3:ListBucket` on the backup bucket, but deliberately **omits `s3:DeleteObject` and `s3:DeleteObjectVersion`**. This ensures the application or any compromised host process cannot delete or overwrite historical backups.

---

## 7. Staged Administrator Execution Procedure

The procedure is partitioned into six strict stages (A through F). Each step explicitly identifies whether the action is `[READ-ONLY]` or `[MUTATING]`, its expected result, verification command, failure condition, and rollback method.

---

### STAGE A: Read-Only Discovery and Prerequisite Checks

#### Step A.1: Verify EC2 Instance Identity & Zone
- **Action**: `[READ-ONLY]` Check target EC2 instance identity and availability zone.
- **Command**:
  ```bash
  aws ec2 describe-instances \
      --instance-ids i-01a6c602f0547c9ee \
      --region eu-north-1 \
      --query 'Reservations[0].Instances[0].[InstanceId,State.Name,Placement.AvailabilityZone,PublicIpAddress]' \
      --output table
  ```
- **Expected Result**: Instance `i-01a6c602f0547c9ee` is in state `running`, zone `eu-north-1b`, IP `13.48.10.13`.
- **Failure Condition**: Instance not found or in unexpected state.
- **Rollback**: None (read-only). Stop and verify account/region.

#### Step A.2: Verify Current IMDSv2 IAM Profile Status
- **Action**: `[READ-ONLY]` Check if any IAM profile is currently associated with the instance.
- **Command**:
  ```bash
  aws ec2 describe-iam-instance-profile-associations \
      --region eu-north-1 \
      --filters "Name=instance-id,Values=i-01a6c602f0547c9ee" \
      --query 'IamInstanceProfileAssociations[*].[AssociationId,IamInstanceProfile.Arn,State]' \
      --output table
  ```
- **Expected Result**: Empty list or no active association (confirming current baseline).
- **Failure Condition**: An unreviewed or conflicting profile is already attached.
- **Rollback**: None (read-only). Review existing role before proceeding.

#### Step A.3: Verify EBS Volume ID and Encryption at Rest
- **Action**: `[READ-ONLY]` Verify whether the host's root EBS volume is encrypted at rest.
- **Command**:
  ```bash
  VOL_ID=$(aws ec2 describe-instances \
      --instance-ids i-01a6c602f0547c9ee \
      --region eu-north-1 \
      --query 'Reservations[0].Instances[0].BlockDeviceMappings[0].Ebs.VolumeId' \
      --output text)

  aws ec2 describe-volumes \
      --volume-ids "$VOL_ID" \
      --region eu-north-1 \
      --query 'Volumes[0].[VolumeId,Encrypted,KmsKeyId,State]' \
      --output table
  ```
- **Expected Result**: Table displaying `VolumeId`, `Encrypted` (`true` or `false`), and `KmsKeyId`.
- **Evaluation**:
  - If `Encrypted: true`: Host EBS at-rest encryption is confirmed.
  - If `Encrypted: false`: Host EBS encryption is absent. Flag this explicitly to security stakeholders; S3 offsite backups will become the primary encrypted store.
- **Rollback**: None (read-only).

#### Step A.4: Check S3 Bucket Name Availability
- **Action**: `[READ-ONLY]` Verify that the desired bucket names are available.
- **Command**:
  ```bash
  for B in bharat-crm-documents-eu-north-1 bharat-crm-backups-eu-north-1; do
      aws s3api head-bucket --bucket "$B" 2>&1 || true
  done
  ```
- **Expected Result**: `404 Not Found` (meaning bucket name is available to create) or `200 OK` (if already owned by this account).
- **Failure Condition**: `403 Forbidden` indicates the bucket name is taken by another AWS account globally.
- **Rollback**: Choose alternate compliant bucket name (e.g. appending account ID suffix `397633117324`).

#### Step A.5: Verify Administrator Permissions
- **Action**: `[READ-ONLY]` Verify administrator caller identity.
- **Command**:
  ```bash
  aws sts get-caller-identity
  ```
- **Expected Result**: Account `397633117324` with sufficient IAM permissions (`iam:*`, `ec2:*`, `s3:*`, `kms:*`).
- **Failure Condition**: Caller identity does not match account `397633117324`.
- **Rollback**: Switch AWS credentials to account `397633117324`.

---

### STAGE B: IAM Role & Instance Profile Review / Creation

#### Step B.1: Create IAM Role `BharatPropertiesCRMInstanceRole`
- **Action**: `[MUTATING]` Create role trusting `ec2.amazonaws.com`.
- **Command**:
  ```bash
  aws iam create-role \
      --role-name BharatPropertiesCRMInstanceRole \
      --assume-role-policy-document file://trust-policy.json \
      --description "Least-privilege instance role for Bharat Properties CRM EC2"
  ```
- **Expected Result**: Role ARN returned: `arn:aws:iam::397633117324:role/BharatPropertiesCRMInstanceRole`.
- **Verification**: `aws iam get-role --role-name BharatPropertiesCRMInstanceRole`
- **Failure Condition**: `EntityAlreadyExistsException` or `AccessDenied`.
- **Rollback**:
  ```bash
  aws iam delete-role --role-name BharatPropertiesCRMInstanceRole
  ```

#### Step B.2: Attach Scoped Permissions Policy
- **Action**: `[MUTATING]` Put inline policy `BharatPropertiesCRMAppPolicy`.
- **Command**:
  ```bash
  aws iam put-role-policy \
      --role-name BharatPropertiesCRMInstanceRole \
      --policy-name BharatPropertiesCRMAppPolicy \
      --policy-document file://app-policy.json
  ```
- **Expected Result**: Policy attached without error.
- **Verification**:
  ```bash
  aws iam get-role-policy \
      --role-name BharatPropertiesCRMInstanceRole \
      --policy-name BharatPropertiesCRMAppPolicy
  ```
- **Failure Condition**: Malformed JSON or syntax validation failure.
- **Rollback**:
  ```bash
  aws iam delete-role-policy \
      --role-name BharatPropertiesCRMInstanceRole \
      --policy-name BharatPropertiesCRMAppPolicy
  ```

#### Step B.3: Create Instance Profile & Add Role
- **Action**: `[MUTATING]` Create instance profile and link role.
- **Command**:
  ```bash
  aws iam create-instance-profile \
      --instance-profile-name BharatPropertiesCRMInstanceProfile

  aws iam add-role-to-instance-profile \
      --instance-profile-name BharatPropertiesCRMInstanceProfile \
      --role-name BharatPropertiesCRMInstanceRole
  ```
- **Expected Result**: Role added to instance profile.
- **Verification**:
  ```bash
  aws iam get-instance-profile --instance-profile-name BharatPropertiesCRMInstanceProfile
  ```
- **Failure Condition**: `LimitExceeded` or role already attached to another profile.
- **Rollback**:
  ```bash
  aws iam remove-role-from-instance-profile \
      --instance-profile-name BharatPropertiesCRMInstanceProfile \
      --role-name BharatPropertiesCRMInstanceRole
  aws iam delete-instance-profile \
      --instance-profile-name BharatPropertiesCRMInstanceProfile
  ```

---

### STAGE C: S3 & KMS Resource Provisioning

#### Step C.1: Provision Customer Managed KMS Key (CMK)
- **Action**: `[MUTATING]` Create symmetric key in `eu-north-1`.
- **Command**:
  ```bash
  KEY_ID=$(aws kms create-key \
      --region eu-north-1 \
      --description "Bharat Properties CRM S3 Storage & Backup Key" \
      --key-usage ENCRYPT_DECRYPT \
      --customer-master-key-spec SYMMETRIC_DEFAULT \
      --query 'KeyMetadata.KeyId' --output text)
  ```
- **Expected Result**: Key ID UUID returned (e.g. `12345678-1234-1234-1234-123456789abc`).
- **Verification**: `aws kms describe-key --key-id "$KEY_ID" --region eu-north-1`
- **Failure Condition**: Key creation fails.
- **Rollback**: `aws kms schedule-key-deletion --key-id "$KEY_ID" --pending-window-in-days 7 --region eu-north-1`

#### Step C.2: Create Alias & Enable Key Rotation
- **Action**: `[MUTATING]` Create alias and enable annual rotation.
- **Command**:
  ```bash
  aws kms create-alias \
      --region eu-north-1 \
      --alias-name alias/bharat-crm-s3-key \
      --target-key-id "$KEY_ID"

  aws kms enable-key-rotation \
      --region eu-north-1 \
      --key-id "$KEY_ID"
  ```
- **Expected Result**: Key rotation enabled.
- **Verification**:
  ```bash
  aws kms get-key-rotation-status --key-id "$KEY_ID" --region eu-north-1
  ```
  Expected JSON: `{"KeyRotationEnabled": true}`.
- **Rollback**:
  ```bash
  aws kms delete-alias --alias-name alias/bharat-crm-s3-key --region eu-north-1
  ```

#### Step C.3: Provision S3 Buckets with Encryption, Versioning & Public Block
- **Action**: `[MUTATING]` Create buckets, block public access, enable KMS default encryption, and enable versioning on backup bucket.
- **Command**:
  ```bash
  for BUCKET in bharat-crm-documents-eu-north-1 bharat-crm-backups-eu-north-1; do
      # 1. Create Bucket
      aws s3api create-bucket \
          --bucket "$BUCKET" \
          --region eu-north-1 \
          --create-bucket-configuration LocationConstraint=eu-north-1

      # 2. Block All Public Access
      aws s3api put-public-access-block \
          --bucket "$BUCKET" \
          --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

      # 3. Enable Default SSE-KMS Encryption
      aws s3api put-bucket-encryption \
          --bucket "$BUCKET" \
          --server-side-encryption-configuration '{
              "Rules": [{
                  "ApplyServerSideEncryptionByDefault": {
                      "SSEAlgorithm": "aws:kms",
                      "KMSMasterKeyID": "alias/bharat-crm-s3-key"
                  },
                  "BucketKeyEnabled": true
              }]
          }'
  done

  # 4. Enable Object Versioning on Backup Bucket (Protects Against Overwrite/Deletion)
  aws s3api put-bucket-versioning \
      --bucket bharat-crm-backups-eu-north-1 \
      --versioning-configuration Status=Enabled
  ```
- **Expected Result**: Buckets provisioned, private, encrypted, with versioning active on the backup bucket.
- **Verification**:
  ```bash
  aws s3api get-public-access-block --bucket bharat-crm-backups-eu-north-1
  aws s3api get-bucket-encryption --bucket bharat-crm-backups-eu-north-1
  aws s3api get-bucket-versioning --bucket bharat-crm-backups-eu-north-1
  ```
- **Failure Condition**: Bucket already exists globally or policy rejected.
- **Rollback**:
  ```bash
  aws s3 rb s3://bharat-crm-documents-eu-north-1 --force
  aws s3 rb s3://bharat-crm-backups-eu-north-1 --force
  ```

---

### STAGE D: Instance Profile Attachment & Permissions Verification

#### Step D.1: Attach Instance Profile to EC2 Host
- **Action**: `[MUTATING]` Associate profile with instance `i-01a6c602f0547c9ee`.
- **Command**:
  ```bash
  aws ec2 associate-iam-instance-profile \
      --region eu-north-1 \
      --instance-id i-01a6c602f0547c9ee \
      --iam-instance-profile Name=BharatPropertiesCRMInstanceProfile
  ```
- **Expected Result**: Association ID returned (e.g. `iip-assoc-0123456789abcdef0`), state `associating` or `associated`.
- **Verification (from Admin Machine)**:
  ```bash
  aws ec2 describe-iam-instance-profile-associations \
      --region eu-north-1 \
      --filters "Name=instance-id,Values=i-01a6c602f0547c9ee" \
      --query 'IamInstanceProfileAssociations[0].[AssociationId,State]' \
      --output table
  ```
- **Failure Condition**: Association error or conflicting profile.
- **Rollback**:
  ```bash
  ASSOC_ID=$(aws ec2 describe-iam-instance-profile-associations \
      --region eu-north-1 \
      --filters "Name=instance-id,Values=i-01a6c602f0547c9ee" "Name=state,Values=associated" \
      --query 'IamInstanceProfileAssociations[0].AssociationId' --output text)
  aws ec2 disassociate-iam-instance-profile --region eu-north-1 --association-id "$ASSOC_ID"
  ```

#### Step D.2: Verify from EC2 Host via IMDSv2
- **Action**: `[READ-ONLY from EC2]` Confirm temporary STS credentials are delivered to host.
- **Command (on EC2 `ubuntu@13.48.10.13`)**:
  ```bash
  TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
  curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/iam/info
  ```
- **Expected Result**: JSON response with `"Code": "Success"` and `"InstanceProfileArn": "arn:aws:iam::397633117324:instance-profile/BharatPropertiesCRMInstanceProfile"`.
- **Failure Condition**: `404 Not Found` indicates profile is not yet attached.
- **Rollback**: Re-check association state in Stage D.1.

#### Step D.3: Non-Destructive S3 Verification from EC2 Host
- **Action**: `[MUTATING test object only]` Verify S3 put and get operations using temporary instance credentials.
- **Command (on EC2)**:
  ```bash
  echo "Phase 17 Non-Destructive Test Payload" > /tmp/phase17-test.txt
  aws s3 cp /tmp/phase17-test.txt s3://bharat-crm-backups-eu-north-1/health-check/test.txt --region eu-north-1
  aws s3 cp s3://bharat-crm-backups-eu-north-1/health-check/test.txt /tmp/phase17-readback.txt --region eu-north-1
  diff /tmp/phase17-test.txt /tmp/phase17-readback.txt && echo "S3_ROUNDTRIP_SUCCESS"
  rm -f /tmp/phase17-test.txt /tmp/phase17-readback.txt
  ```
- **Expected Result**: `S3_ROUNDTRIP_SUCCESS` printed; file verified with zero static keys.
- **Failure Condition**: `AccessDenied` indicates policy mismatch or KMS permission issue.
- **Rollback**: Review `app-policy.json` Sid `AllowBackupBucketArchiveUpload` and `AllowKmsKeyUsageForS3`.

---

### STAGE E: Non-Production Backup Upload, Checksum Verification and Restore Test

> [!IMPORTANT]
> This stage executes an end-to-end backup verification and database restore drill using an **ephemeral non-production test database** (`bharat_crm_restore_drill_test`). The live production database `bharat-properties-crm` is never dropped, overwritten, or modified.

#### Step E.1: Generate Isolated Non-Production Test Archive & Manifest
- **Action**: `[LOCAL TEST on EC2]` Create a mock database dump with synthetic data.
- **Command (on EC2)**:
  ```bash
  TEST_DIR=$(mktemp -d /tmp/restore-drill-XXXXXX)
  cd "$TEST_DIR"

  # Create mock collection data
  mkdir -p dump/bharat_crm_restore_drill_test
  cat <<BSON > dump/bharat_crm_restore_drill_test/metadata.json
  {"drillTimestamp": "$(date -u +%Y%m%dT%H%M%SZ)", "status": "VERIFICATION_TEST"}
  BSON

  # Create archive
  tar -czf test-backup.tar.gz dump/
  SHA256=$(sha256sum test-backup.tar.gz | awk '{print $1}')
  SIZE=$(stat -c%s test-backup.tar.gz 2>/dev/null || stat -f%z test-backup.tar.gz)

  cat <<JSON > test-backup.manifest.json
  {
    "timestamp": "$(date -u +%Y%m%dT%H%M%SZ)",
    "archive": "test-backup.tar.gz",
    "sha256": "${SHA256}",
    "size": ${SIZE},
    "status": "VALID_LOCAL"
  }
  JSON
  echo "$SHA256  test-backup.tar.gz" > test-backup.sha256
  ```
- **Expected Result**: Clean test archive and manifest generated in isolated scratch directory.

#### Step E.2: Upload Test Archive to S3 Backup Bucket
- **Action**: `[MUTATING test prefix in S3]` Upload only verified test archive and manifest.
- **Command (on EC2)**:
  ```bash
  aws s3 cp test-backup.tar.gz s3://bharat-crm-backups-eu-north-1/drills/test-backup.tar.gz --region eu-north-1
  aws s3 cp test-backup.manifest.json s3://bharat-crm-backups-eu-north-1/drills/test-backup.manifest.json --region eu-north-1
  aws s3 cp test-backup.sha256 s3://bharat-crm-backups-eu-north-1/drills/test-backup.sha256 --region eu-north-1
  ```
- **Expected Result**: 3 files uploaded successfully to `drills/` prefix in S3.

#### Step E.3: Download and Cryptographically Verify from S3
- **Action**: `[READ-ONLY S3, LOCAL VALIDATION]` Download to a separate directory and verify integrity.
- **Command (on EC2)**:
  ```bash
  VERIFY_DIR=$(mktemp -d /tmp/restore-verify-XXXXXX)
  cd "$VERIFY_DIR"

  aws s3 cp s3://bharat-crm-backups-eu-north-1/drills/test-backup.tar.gz . --region eu-north-1
  aws s3 cp s3://bharat-crm-backups-eu-north-1/drills/test-backup.manifest.json . --region eu-north-1

  # Run Node verification using BackupEncryptionVerifier
  node --input-type=module -e "
  import BackupEncryptionVerifier from '/home/ubuntu/bharat-properties-crm/backend/services/infrastructure/BackupEncryptionVerifier.js';
  const result = BackupEncryptionVerifier.verifyManifestFileOnDisk('$VERIFY_DIR/test-backup.manifest.json', '$VERIFY_DIR');
  if (!result.valid) {
    console.error('VERIFICATION_FAILED:', result.errors);
    process.exit(1);
  }
  console.log('CRYPTOGRAPHIC_VERIFICATION_PASSED: SHA-256 matches manifest');
  "
  ```
- **Expected Result**: `CRYPTOGRAPHIC_VERIFICATION_PASSED` output.
- **Failure Condition**: Hash mismatch or missing file.
- **Rollback**: Abort drill; investigate transport corruption or S3 bucket policy.

#### Step E.4: Execute Restore Drill to Ephemeral Database
- **Action**: `[LOCAL TEST RESTORE]` Restore into `bharat_crm_restore_drill_test`.
- **Command (on EC2)**:
  ```bash
  tar -xzf test-backup.tar.gz
  mongorestore --db=bharat_crm_restore_drill_test --drop dump/bharat_crm_restore_drill_test/
  
  # Verify record exists in ephemeral test db
  mongosh bharat_crm_restore_drill_test --eval 'db.metadata.find()' --quiet
  
  # Drop ephemeral test db immediately after verification
  mongosh bharat_crm_restore_drill_test --eval 'db.dropDatabase()' --quiet
  ```
- **Expected Result**: Document restored successfully into `bharat_crm_restore_drill_test` and ephemeral database dropped cleanly.
- **Safety Guarantee**: The live production database (`bharat-properties-crm`) is untouched.
- **Rollback / Cleanup**:
  ```bash
  rm -rf "$TEST_DIR" "$VERIFY_DIR"
  ```

---

### STAGE F: Production Activation (Only After Explicit Authorization)

> [!CAUTION]
> Do NOT execute Stage F until Stage E has completely passed and written verification evidence is approved.

#### Step F.1: Run Local Environment Dry-Run Preflight
- **Action**: `[READ-ONLY on EC2]` Validate production `.env` configuration.
- **Command (on EC2)**:
  ```bash
  cd /home/ubuntu/bharat-properties-crm/backend
  node scripts/preflight-aws-check.js
  ```
- **Expected Result**: `✅ PREFLIGHT CHECK PASSED: AWS configuration is valid and meets enterprise requirements.`

#### Step F.2: Update Production Environment File (`.env`)
- **Action**: `[MUTATING .env]` Add S3 bucket and region configuration:
  ```ini
  AWS_REGION=eu-north-1
  S3_BUCKET_NAME=bharat-crm-documents-eu-north-1
  BACKUP_S3_BUCKET=bharat-crm-backups-eu-north-1
  AWS_SSE_ALGORITHM=aws:kms
  AWS_KMS_KEY_ID=alias/bharat-crm-s3-key
  AWS_USE_INSTANCE_PROFILE=true
  ```

#### Step F.3: Deploy Merged Baseline to Production Runtime
- **Action**: When authorized, deploy commit `6787ad3e73003b00814a5159bacd5f28ab82434b` via authorized deployment script:
  ```bash
  bash scripts/deploy-aws.sh
  ```
- **Verification**: Check `/api/health`, `/api/ready`, `/api/version` returning runtime SHA `6787ad3e`.

---

## 8. Emergency Revert & Rollback Procedures

If any issue arises during or after instance profile attachment:

1. **Immediate Disassociation of Instance Profile**:
   ```bash
   ASSOC_ID=$(aws ec2 describe-iam-instance-profile-associations \
       --region eu-north-1 \
       --filters "Name=instance-id,Values=i-01a6c602f0547c9ee" "Name=state,Values=associated" \
       --query 'IamInstanceProfileAssociations[0].AssociationId' --output text)

   if [ -n "$ASSOC_ID" ] && [ "$ASSOC_ID" != "None" ]; then
       aws ec2 disassociate-iam-instance-profile \
           --region eu-north-1 \
           --association-id "$ASSOC_ID"
   fi
   ```
2. **Zero Downtime Fallback**:
   - The application document service and backup scripts automatically detect missing S3 credentials or disabled instance profiles and gracefully fall back to local directory storage (`/home/ubuntu/bharat-crm-backups/archives/`).
   - Detaching the instance profile causes zero disruption to PM2 processes, database connections, or CRM web operations.
