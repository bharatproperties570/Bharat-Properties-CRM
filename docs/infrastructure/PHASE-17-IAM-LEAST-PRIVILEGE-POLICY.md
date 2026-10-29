# Phase 17 — AWS Infrastructure Hardening: Least-Privilege IAM Role & KMS Policy Specification

## 1. Executive Summary & Verified Baseline

This specification defines the least-privilege AWS Identity and Access Management (IAM) role, instance profile, Key Management Service (KMS) encryption standard, and safe, staged execution plan for Bharat Properties CRM.

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
| **Tier 2: Verified in Non-Production Environment** | **VERIFIED** | Standalone preflight CLI (`backend/scripts/preflight-aws-check.js`) running zero-leakage dry-runs, isolated backup test harness (`scripts/release/test-backup-pipeline.sh`), and GitHub Actions CI Quality Gate passing green across PR #24, #25, #26, and #27. |
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

### 6.1 Customer-Managed KMS Key Policy Specification (`kms-key-policy.json`)

To ensure mutual compatibility between the IAM role policy, the KMS Customer Managed Key (CMK), and S3 SSE-KMS, the KMS key must be created with a key policy that delegates administrative authority to the account root and authorizes the EC2 instance role for S3 operations:

```json
{
  "Version": "2012-10-17",
  "Id": "BharatCRM-KMS-KeyPolicy",
  "Statement": [
    {
      "Sid": "EnableRootAccountAdministration",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::397633117324:root"
      },
      "Action": "kms:*",
      "Resource": "*"
    },
    {
      "Sid": "AllowCRMInstanceRoleKeyUsage",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::397633117324:role/BharatPropertiesCRMInstanceRole"
      },
      "Action": [
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:ReEncrypt*",
        "kms:GenerateDataKey*",
        "kms:DescribeKey"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "kms:ViaService": "s3.eu-north-1.amazonaws.com",
          "kms:CallerAccount": "397633117324"
        }
      }
    }
  ]
}
```

**Policy Compatibility & Least-Privilege Guarantees**:
1. **Administrative Delegation**: Statement 1 allows IAM policies in account `397633117324` to manage and delegate key permissions.
2. **Scoping**: Statement 2 restricts key usage to the `BharatPropertiesCRMInstanceRole` strictly when requests originate through S3 in `eu-north-1`.
3. **No Key Administration for EC2**: The instance role has zero permissions to modify key policies, disable keys, or schedule key deletion (`kms:Create*`, `kms:Delete*`, `kms:PutKeyPolicy`, `kms:ScheduleKeyDeletion` are excluded).

---

## 7. Staged Administrator Execution Procedure

The procedure is partitioned into six strict stages (A through F). Each step explicitly identifies whether the action is `[READ-ONLY]` or `[MUTATING]`, its expected result, verification command, failure condition, and safe recovery method.

### Universal Safety & Execution Rules
1. **Fail-Closed Execution**: All script blocks must be executed with `set -euo pipefail`. If any command returns a non-zero exit code or encounters an unexpected state, execution halts immediately. Do not use `|| true` to swallow fatal errors.
2. **Reversible Recovery Over Destructive Rollback**: Routine failure recovery must never destroy buckets, delete historical data, or schedule KMS key deletion. Prefer reversible actions such as detaching associations, leaving unreferenced resources idle, or reverting configuration files.
3. **Pre-Change State Capture**: Every mutating step begins with capturing the existing state to enable exact post-change comparison and verified rollback.

---

### STAGE A: Read-Only Discovery and Prerequisite Checks

#### Step A.1: Verify Administrator Identity & Region
- **Action**: `[READ-ONLY]` Confirm active AWS credentials and region before running any commands.
- **Command**:
  ```bash
  CURRENT_ACCOUNT=$(aws sts get-caller-identity --query 'Account' --output text)
  CURRENT_REGION=$(aws configure get region || echo "${AWS_DEFAULT_REGION:-}")

  echo "Caller Account: $CURRENT_ACCOUNT"
  echo "Active Region:  $CURRENT_REGION"

  if [ "$CURRENT_ACCOUNT" != "397633117324" ]; then
      echo "❌ FATAL: Caller account ($CURRENT_ACCOUNT) does NOT match expected 397633117324!" >&2
      exit 1
  fi

  if [ "$CURRENT_REGION" != "eu-north-1" ]; then
      echo "❌ FATAL: Configured region ($CURRENT_REGION) does NOT match target eu-north-1!" >&2
      exit 1
  fi
  echo "✅ Administrator account and region verified."
  ```
- **Expected Result**: Account is `397633117324` and region is `eu-north-1`.
- **Failure Condition**: Account or region mismatch.
- **Recovery**: Switch AWS profiles (`export AWS_PROFILE=...`) or export `AWS_DEFAULT_REGION=eu-north-1`.

#### Step A.2: Verify EC2 Instance Identity & Zone
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
- **Failure Condition**: Instance not found or not in `running` state.
- **Recovery**: Stop and verify instance lifecycle status before making changes.

#### Step A.3: Verify Current IMDSv2 IAM Profile Status
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
- **Recovery**: Review existing role and associations before proceeding.

#### Step A.4: Verify EBS Volume ID and Encryption at Rest
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
- **Recovery**: None (read-only audit).

#### Step A.5: Check S3 Bucket Name Discovery & Availability Semantics
- **Action**: `[READ-ONLY]` Inspect S3 bucket status.
- **Important Technical Guidance on `HeadBucket` Semantics**:
  An S3 `HeadBucket` check determines whether a bucket exists and whether the caller has permissions to access it. **An error response from `HeadBucket` is ambiguous and MUST NOT be treated as proof that a bucket name is globally available to claim.**
  
  The check outcomes are categorized as follows:
  1. `200 OK`: **Bucket Exists & Accessible**: Bucket is located in `eu-north-1` and is owned/accessible by caller account `397633117324`.
  2. `301 Moved Permanently`: **Bucket Exists Elsewhere**: Bucket exists globally, but resides in a different AWS region. It cannot be created in `eu-north-1`.
  3. `403 Forbidden`: **Access Denied**: The bucket exists globally (either in another AWS account or in your account without permissions). Name is unavailable.
  4. `404 Not Found`: **Not Found in Region (Global Availability Inconclusive)**: The bucket does not exist under this regional endpoint. However, DNS caching, cross-region propagation delays, or pending deletion states can return 404 even if the name is globally claimed. True availability is confirmed only upon successful creation.

- **Diagnostic Command**:
  ```bash
  for BUCKET in bharat-crm-documents-eu-north-1 bharat-crm-backups-eu-north-1; do
      echo "Checking bucket: $BUCKET..."
      HTTP_STATUS=$(aws s3api head-bucket --bucket "$BUCKET" --region eu-north-1 2>&1 || true)
      
      if [ -z "$HTTP_STATUS" ]; then
          echo "  -> [200 OK] Bucket exists and is accessible in eu-north-1."
      elif echo "$HTTP_STATUS" | grep -q "404"; then
          echo "  -> [404 Not Found] Bucket not found in eu-north-1. Global availability not conclusively determined until create attempt."
      elif echo "$HTTP_STATUS" | grep -q "403"; then
          echo "  -> [403 Forbidden] Access denied. Bucket exists in another account or caller lacks permissions. Bucket name unavailable."
      elif echo "$HTTP_STATUS" | grep -q "301"; then
          echo "  -> [301 Redirect] Bucket exists in a different AWS region. Bucket name unavailable in eu-north-1."
      else
          echo "  -> [UNEXPECTED] Output: $HTTP_STATUS"
      fi
  done
  ```
- **Recovery**: If a bucket returns `403` or `301`, choose an alternative enterprise-compliant name (e.g. appending account ID `bharat-crm-backups-397633117324`).

---

### STAGE B: IAM Role & Instance Profile Review / Creation

#### Pre-Mutation Safety Gate for Stage B
```bash
set -euo pipefail
CURRENT_ACCOUNT=$(aws sts get-caller-identity --query 'Account' --output text)
CURRENT_REGION=$(aws configure get region || echo "${AWS_DEFAULT_REGION:-}")
[ "$CURRENT_ACCOUNT" = "397633117324" ] || { echo "Account check failed"; exit 1; }
[ "$CURRENT_REGION" = "eu-north-1" ] || { echo "Region check failed"; exit 1; }
```

#### Step B.1: Create IAM Role `BharatPropertiesCRMInstanceRole`
- **Action**: `[MUTATING]` Create role trusting `ec2.amazonaws.com`.
- **Pre-Change State Capture**:
  ```bash
  ROLE_EXISTS=$(aws iam get-role --role-name BharatPropertiesCRMInstanceRole --query 'Role.RoleName' --output text 2>/dev/null || echo "NOT_FOUND")
  echo "Initial Role State: $ROLE_EXISTS"
  ```
- **Command**:
  ```bash
  if [ "$ROLE_EXISTS" = "NOT_FOUND" ]; then
      aws iam create-role \
          --role-name BharatPropertiesCRMInstanceRole \
          --assume-role-policy-document file://trust-policy.json \
          --description "Least-privilege instance role for Bharat Properties CRM EC2"
  else
      echo "Role already exists. Skipping creation to preserve existing configuration."
  fi
  ```
- **Expected Result**: Role ARN returned: `arn:aws:iam::397633117324:role/BharatPropertiesCRMInstanceRole`.
- **Verification**: `aws iam get-role --role-name BharatPropertiesCRMInstanceRole`
- **Failure Condition**: `AccessDenied` or invalid trust policy JSON.
- **Safe Reversible Recovery**:
  - Do NOT delete the role if it previously existed or if any other process depends on it.
  - If creation fails mid-step on a newly created role, verify attached policies first:
    ```bash
    ATTACHED=$(aws iam list-attached-role-policies --role-name BharatPropertiesCRMInstanceRole --query 'AttachedPolicies' --output text 2>/dev/null || true)
    INLINE=$(aws iam list-role-policies --role-name BharatPropertiesCRMInstanceRole --query 'PolicyNames' --output text 2>/dev/null || true)
    if [ -z "$ATTACHED" ] && [ -z "$INLINE" ] && [ "$ROLE_EXISTS" = "NOT_FOUND" ]; then
        aws iam delete-role --role-name BharatPropertiesCRMInstanceRole
    else
        echo "⚠️ Role has policies attached or existed prior; automatic deletion skipped for safety."
    fi
    ```

#### Step B.2: Attach Scoped Permissions Policy
- **Action**: `[MUTATING]` Put inline policy `BharatPropertiesCRMAppPolicy`.
- **Pre-Change State Capture**:
  ```bash
  aws iam get-role-policy \
      --role-name BharatPropertiesCRMInstanceRole \
      --policy-name BharatPropertiesCRMAppPolicy \
      --query 'PolicyDocument' > /tmp/previous-app-policy.json 2>/dev/null || echo "NO_PREVIOUS_POLICY"
  ```
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
- **Safe Reversible Recovery**:
  - If a previous policy existed in `/tmp/previous-app-policy.json`, restore it:
    ```bash
    aws iam put-role-policy \
        --role-name BharatPropertiesCRMInstanceRole \
        --policy-name BharatPropertiesCRMAppPolicy \
        --policy-document file:///tmp/previous-app-policy.json
    ```
  - If no previous policy existed and the newly applied policy is defective, remove only this inline policy after verifying no live production workload depends on it:
    ```bash
    aws iam delete-role-policy \
        --role-name BharatPropertiesCRMInstanceRole \
        --policy-name BharatPropertiesCRMAppPolicy
    ```

#### Step B.3: Create Instance Profile & Add Role
- **Action**: `[MUTATING]` Create instance profile and link role.
- **Pre-Change State Capture**:
  ```bash
  PROFILE_EXISTS=$(aws iam get-instance-profile --instance-profile-name BharatPropertiesCRMInstanceProfile --query 'InstanceProfile.InstanceProfileName' --output text 2>/dev/null || echo "NOT_FOUND")
  echo "Initial Profile State: $PROFILE_EXISTS"
  ```
- **Command**:
  ```bash
  if [ "$PROFILE_EXISTS" = "NOT_FOUND" ]; then
      aws iam create-instance-profile \
          --instance-profile-name BharatPropertiesCRMInstanceProfile
  fi

  CURRENT_ROLES=$(aws iam get-instance-profile --instance-profile-name BharatPropertiesCRMInstanceProfile --query 'InstanceProfile.Roles[*].RoleName' --output text 2>/dev/null || true)
  if ! echo "$CURRENT_ROLES" | grep -q "BharatPropertiesCRMInstanceRole"; then
      aws iam add-role-to-instance-profile \
          --instance-profile-name BharatPropertiesCRMInstanceProfile \
          --role-name BharatPropertiesCRMInstanceRole
  fi
  ```
- **Expected Result**: Role linked to instance profile.
- **Verification**:
  ```bash
  aws iam get-instance-profile --instance-profile-name BharatPropertiesCRMInstanceProfile
  ```
- **Failure Condition**: `LimitExceeded` or role already attached to another profile.
- **Safe Reversible Recovery**:
  - Check whether any EC2 instances are associated with this profile:
    ```bash
    ASSOCS=$(aws ec2 describe-iam-instance-profile-associations \
        --region eu-north-1 \
        --filters "Name=iam-instance-profile-arn,Values=arn:aws:iam::397633117324:instance-profile/BharatPropertiesCRMInstanceProfile" \
        --query 'IamInstanceProfileAssociations[*].InstanceId' --output text 2>/dev/null || true)
    if [ -n "$ASSOCS" ]; then
        echo "❌ CANNOT REMOVE PROFILE: Associated with instance(s) $ASSOCS! Disassociate instances before modifying profile." >&2
    elif [ "$PROFILE_EXISTS" = "NOT_FOUND" ]; then
        aws iam remove-role-from-instance-profile \
            --instance-profile-name BharatPropertiesCRMInstanceProfile \
            --role-name BharatPropertiesCRMInstanceRole 2>/dev/null || true
        aws iam delete-instance-profile \
            --instance-profile-name BharatPropertiesCRMInstanceProfile 2>/dev/null || true
    fi
    ```

---

### STAGE C: S3 & KMS Resource Provisioning

#### Pre-Mutation Safety Gate for Stage C
```bash
set -euo pipefail
CURRENT_ACCOUNT=$(aws sts get-caller-identity --query 'Account' --output text)
CURRENT_REGION=$(aws configure get region || echo "${AWS_DEFAULT_REGION:-}")
[ "$CURRENT_ACCOUNT" = "397633117324" ] || { echo "Account check failed"; exit 1; }
[ "$CURRENT_REGION" = "eu-north-1" ] || { echo "Region check failed"; exit 1; }
```

#### Step C.1: Provision Customer Managed KMS Key (CMK)
- **Action**: `[MUTATING]` Create symmetric key in `eu-north-1` with policy.
- **Pre-Change State Capture**:
  ```bash
  EXISTING_ALIAS=$(aws kms list-aliases --region eu-north-1 --query "Aliases[?AliasName=='alias/bharat-crm-s3-key'].TargetKeyId" --output text 2>/dev/null || true)
  echo "Existing Alias Target: $EXISTING_ALIAS"
  ```
- **Command**:
  ```bash
  if [ -n "$EXISTING_ALIAS" ] && [ "$EXISTING_ALIAS" != "None" ]; then
      echo "KMS Key already exists with target ID $EXISTING_ALIAS. Using existing key."
      KEY_ID="$EXISTING_ALIAS"
  else
      KEY_ID=$(aws kms create-key \
          --region eu-north-1 \
          --description "Bharat Properties CRM S3 Storage & Backup Key" \
          --key-usage ENCRYPT_DECRYPT \
          --customer-master-key-spec SYMMETRIC_DEFAULT \
          --policy file://kms-key-policy.json \
          --query 'KeyMetadata.KeyId' --output text)
      echo "Created Key ID: $KEY_ID"
  fi
  ```
- **Expected Result**: Key ID UUID returned (e.g. `12345678-1234-1234-1234-123456789abc`).
- **Verification**: `aws kms describe-key --key-id "$KEY_ID" --region eu-north-1`
- **Failure Condition**: Policy validation failure or insufficient KMS quota.
- **Safe Reversible Recovery (DO NOT SCHEDULE KEY DELETION)**:
  - > [!CAUTION]
    > **NEVER automatically schedule KMS key deletion as a routine failure rollback.**
    > **Impact on Encrypted Data**: Any EBS volume, S3 document, or database backup encrypted with a deleted KMS key is **permanently and irreversibly lost**. AWS has zero ability to recover ciphertexts once a KMS key is destroyed.
  - If a newly created key was provisioned incorrectly or needs to be taken out of service, the safe, non-destructive, and reversible action is to **disable** the key:
    ```bash
    # REVERSIBLE SAFE ROLLBACK: Disable key to prevent usage without destroying cryptographic material
    aws kms disable-key --key-id "$KEY_ID" --region eu-north-1
    echo "KMS Key $KEY_ID has been safely disabled (reversible via enable-key)."
    ```
  - Disabling the key immediately blocks all cryptographic calls while preserving all data. It can be re-enabled at any time via `aws kms enable-key`.
  - Scheduling key deletion is strictly quarantined to the approval-only decommissioning procedure in Section 9.

#### Step C.2: Create Alias & Enable Key Rotation
- **Action**: `[MUTATING]` Create alias and enable annual rotation.
- **Command**:
  ```bash
  CURRENT_ALIAS=$(aws kms list-aliases --region eu-north-1 --query "Aliases[?AliasName=='alias/bharat-crm-s3-key'].TargetKeyId" --output text 2>/dev/null || true)
  if [ -z "$CURRENT_ALIAS" ] || [ "$CURRENT_ALIAS" = "None" ]; then
      aws kms create-alias \
          --region eu-north-1 \
          --alias-name alias/bharat-crm-s3-key \
          --target-key-id "$KEY_ID"
  fi

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
- **Safe Reversible Recovery**:
  - Remove alias pointer (non-destructive):
    ```bash
    aws kms delete-alias --alias-name alias/bharat-crm-s3-key --region eu-north-1 2>/dev/null || true
    ```
  - Disable key rotation if desired:
    ```bash
    aws kms disable-key-rotation --key-id "$KEY_ID" --region eu-north-1 2>/dev/null || true
    ```

#### Step C.3: Provision S3 Buckets with Encryption, Versioning & Public Block
- **Action**: `[MUTATING]` Create buckets, block public access, enable KMS default encryption, and enable versioning on backup bucket.
- **Pre-Change State Capture**:
  ```bash
  for BUCKET in bharat-crm-documents-eu-north-1 bharat-crm-backups-eu-north-1; do
      LOC=$(aws s3api get-bucket-location --bucket "$BUCKET" --query 'LocationConstraint' --output text 2>/dev/null || echo "DOES_NOT_EXIST")
      echo "Bucket $BUCKET Initial State: $LOC"
  done
  ```
- **Command**:
  ```bash
  for BUCKET in bharat-crm-documents-eu-north-1 bharat-crm-backups-eu-north-1; do
      # 1. Create Bucket only if it does not already exist
      if ! aws s3api head-bucket --bucket "$BUCKET" --region eu-north-1 2>/dev/null; then
          aws s3api create-bucket \
              --bucket "$BUCKET" \
              --region eu-north-1 \
              --create-bucket-configuration LocationConstraint=eu-north-1
      fi

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

  # 4. Enable Object Versioning on Backup Bucket (Guarantees Overwrite/Deletion Protection)
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
- **Failure Condition**: Bucket already exists globally in another account or policy rejected.
- **Safe Reversible Recovery (DO NOT USE `aws s3 rb --force`)**:
  - > [!CAUTION]
    > **NEVER use `aws s3 rb --force` as a routine rollback.**
    > **Impact on Production Data**: Running `rb --force` recursively deletes all existing objects, versioned archives, and delete markers. If executed against a bucket containing production backups or document uploads, all data is permanently and irreversibly destroyed.
  - **Safe Reversible Recovery Action**:
    1. If bucket configuration fails, **leave the bucket in place**.
    2. Do **NOT** update the application `.env` file with the bucket name.
    3. The application automatically detects that S3 is not configured and safely continues using local storage (`/home/ubuntu/bharat-crm-backups/archives/`) with zero disruption to active CRM operations.
    4. To block any write access to a defective bucket without deleting it, remove `s3:PutObject` from `BharatPropertiesCRMAppPolicy`.
  - Bucket deletion is strictly quarantined to Section 9 (Explicit Approval-Only Decommissioning).

---

### STAGE D: Instance Profile Attachment & Permissions Verification

#### Pre-Mutation Safety Gate for Stage D
```bash
set -euo pipefail
CURRENT_ACCOUNT=$(aws sts get-caller-identity --query 'Account' --output text)
CURRENT_REGION=$(aws configure get region || echo "${AWS_DEFAULT_REGION:-}")
[ "$CURRENT_ACCOUNT" = "397633117324" ] || { echo "Account check failed"; exit 1; }
[ "$CURRENT_REGION" = "eu-north-1" ] || { echo "Region check failed"; exit 1; }
```

#### Step D.1: Attach Instance Profile to EC2 Host
- **Action**: `[MUTATING]` Associate profile with instance `i-01a6c602f0547c9ee`.
- **Pre-Change State Capture**:
  ```bash
  PREV_ASSOC=$(aws ec2 describe-iam-instance-profile-associations \
      --region eu-north-1 \
      --filters "Name=instance-id,Values=i-01a6c602f0547c9ee" \
      --query 'IamInstanceProfileAssociations[0].AssociationId' --output text 2>/dev/null || echo "NONE")
  echo "Pre-Change Association: $PREV_ASSOC"
  ```
- **Command**:
  ```bash
  if [ "$PREV_ASSOC" = "NONE" ] || [ -z "$PREV_ASSOC" ]; then
      aws ec2 associate-iam-instance-profile \
          --region eu-north-1 \
          --instance-id i-01a6c602f0547c9ee \
          --iam-instance-profile Name=BharatPropertiesCRMInstanceProfile
  else
      echo "Instance already has association $PREV_ASSOC. Review association before proceeding."
  fi
  ```
- **Expected Result**: Association ID returned (e.g. `iip-assoc-0123456789abcdef0`), state `associating` or `associated`.
- **Verification**:
  ```bash
  aws ec2 describe-iam-instance-profile-associations \
      --region eu-north-1 \
      --filters "Name=instance-id,Values=i-01a6c602f0547c9ee" \
      --query 'IamInstanceProfileAssociations[0].[AssociationId,State]' \
      --output table
  ```
- **Safe Reversible Recovery**:
  - To immediately roll back instance profile attachment without deleting any IAM resources:
    ```bash
    ASSOC_ID=$(aws ec2 describe-iam-instance-profile-associations \
        --region eu-north-1 \
        --filters "Name=instance-id,Values=i-01a6c602f0547c9ee" "Name=state,Values=associated" \
        --query 'IamInstanceProfileAssociations[0].AssociationId' --output text)
    if [ -n "$ASSOC_ID" ] && [ "$ASSOC_ID" != "None" ]; then
        aws ec2 disassociate-iam-instance-profile --region eu-north-1 --association-id "$ASSOC_ID"
        echo "Disassociated instance profile $ASSOC_ID. Host returned to credential-free state."
    fi
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
- **Recovery**: Re-check association state in Step D.1.

#### Step D.3: Non-Destructive S3 Verification from EC2 Host
- **Action**: `[MUTATING test object only]` Verify S3 put and get operations using temporary instance credentials.
- **Command (on EC2)**:
  ```bash
  echo "Phase 17 Non-Destructive Test Payload $(date -u)" > /tmp/phase17-test.txt
  aws s3 cp /tmp/phase17-test.txt s3://bharat-crm-backups-eu-north-1/health-check/test.txt --region eu-north-1
  aws s3 cp s3://bharat-crm-backups-eu-north-1/health-check/test.txt /tmp/phase17-readback.txt --region eu-north-1
  diff /tmp/phase17-test.txt /tmp/phase17-readback.txt && echo "S3_ROUNDTRIP_SUCCESS"
  
  # Clean up test files only
  rm -f /tmp/phase17-test.txt /tmp/phase17-readback.txt
  aws s3 rm s3://bharat-crm-backups-eu-north-1/health-check/test.txt --region eu-north-1
  ```
- **Expected Result**: `S3_ROUNDTRIP_SUCCESS` printed; test file written and read back using temporary STS credentials with zero static keys.
- **Failure Condition**: `AccessDenied` indicates policy mismatch or KMS permission issue.
- **Safe Recovery**: Review `app-policy.json` Sid `AllowBackupBucketArchiveUpload` and `AllowKmsKeyUsageForS3`. Do not alter production resources.

---

### STAGE E: Non-Production Backup Upload, Checksum Verification and Restore Test

> [!IMPORTANT]
> This stage executes an end-to-end backup verification and database restore drill using an **ephemeral non-production test database** (`bharat_crm_restore_drill_test`).
> **Strict Safety Guarantee**:
> - The live production database `bharat-properties-crm` is never dropped, touched, or modified.
> - The local production backup directory `/home/ubuntu/bharat-crm-backups/archives/` remains untouched.
> - All drill files reside strictly in isolated temporary directories (`/tmp/restore-drill-XXXXXX`) and an isolated S3 test prefix (`s3://bharat-crm-backups-eu-north-1/drills/`).

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
- **Recovery**: Abort drill; investigate transport corruption or S3 bucket policy.

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
  
  # Cleanup drill objects from S3
  aws s3 rm s3://bharat-crm-backups-eu-north-1/drills/test-backup.tar.gz --region eu-north-1
  aws s3 rm s3://bharat-crm-backups-eu-north-1/drills/test-backup.manifest.json --region eu-north-1
  aws s3 rm s3://bharat-crm-backups-eu-north-1/drills/test-backup.sha256 --region eu-north-1

  # Cleanup local scratch directories
  rm -rf "$TEST_DIR" "$VERIFY_DIR"
  echo "✅ Stage E Restore Drill completed and all ephemeral test assets cleaned up."
  ```
- **Expected Result**: Document restored successfully into `bharat_crm_restore_drill_test`, database dropped cleanly, and S3 drill objects removed.
- **Safety Guarantee**: The live production database (`bharat-properties-crm`) and local archives remain 100% untouched.

---

### STAGE F: Production Activation (Only After Explicit Authorization)

> [!CAUTION]
> Do NOT execute Stage F until Stage E has completely passed and written verification evidence is signed off by the engineering lead.

#### Step F.1: Run Local Environment Dry-Run Preflight
- **Action**: `[READ-ONLY on EC2]` Validate production `.env` configuration.
- **Command (on EC2)**:
  ```bash
  cd /home/ubuntu/bharat-properties-crm/backend
  node scripts/preflight-aws-check.js
  ```
- **Expected Result**: `✅ PREFLIGHT CHECK PASSED: AWS configuration is valid and meets enterprise requirements.`

#### Step F.2: Update Production Environment File (`.env`)
- **Action**: `[MUTATING .env]` Backup and append S3 bucket and KMS configuration:
- **Pre-Change State Capture**:
  ```bash
  cp /home/ubuntu/bharat-properties-crm/backend/.env /home/ubuntu/bharat-properties-crm/backend/.env.pre-phase17-$(date +%Y%m%d%H%M%S)
  ```
- **Command**:
  ```bash
  cat <<'ENV' >> /home/ubuntu/bharat-properties-crm/backend/.env

  # Phase 17 Enterprise AWS Infrastructure Configuration
  AWS_REGION=eu-north-1
  S3_BUCKET_NAME=bharat-crm-documents-eu-north-1
  BACKUP_S3_BUCKET=bharat-crm-backups-eu-north-1
  AWS_SSE_ALGORITHM=aws:kms
  AWS_KMS_KEY_ID=alias/bharat-crm-s3-key
  AWS_USE_INSTANCE_PROFILE=true
  ENV
  ```
- **Safe Reversible Recovery**:
  If production activation requires rollback:
  ```bash
  cp /home/ubuntu/bharat-properties-crm/backend/.env.pre-phase17-* /home/ubuntu/bharat-properties-crm/backend/.env
  pm2 reload all
  ```

#### Step F.3: Deploy Verified Baseline to Production Runtime
- **Action**: When explicitly authorized, deploy the latest verified commit from `main` via the repository deployment workflow:
  ```bash
  bash scripts/deploy-aws.sh
  ```
- **Verification**: Check `/api/health`, `/api/ready`, `/api/version` returning expected runtime SHA.

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
       echo "✅ Instance profile disassociated safely. No resources destroyed."
   fi
   ```
2. **Zero Downtime Fallback**:
   - The application document service and backup scripts automatically detect missing S3 credentials or disabled instance profiles and gracefully fall back to local directory storage (`/home/ubuntu/bharat-crm-backups/archives/`).
   - Detaching the instance profile causes zero disruption to PM2 processes, database connections, or CRM web operations.

---

## 9. Destructive Resource Decommissioning (Explicit Approval-Only)

> [!CAUTION]
> **STRICT ADMINISTRATIVE QUARANTINE**:
> This section must **NEVER** be executed during routine deployments, troubleshooting, or standard rollbacks. It is exclusively reserved for permanent, end-of-life cloud resource decommissioning after all production workloads have been sunsetted and data retention compliance periods have elapsed.
>
> Execution requires **written multi-party authorization** from the System Administrator and Security Lead.

### 9.1 Decommissioning S3 Buckets
Before any bucket deletion is contemplated, verify that:
1. Bucket is empty of all current objects:
   ```bash
   aws s3api list-objects-v2 --bucket "$BUCKET" --max-items 1
   ```
2. Bucket has zero versions and zero delete markers:
   ```bash
   aws s3api list-object-versions --bucket "$BUCKET" --max-items 1
   ```
3. Only after confirming 0 objects, 0 versions, and 0 delete markers:
   ```bash
   # APPROVAL-ONLY: Empty bucket deletion (requires explicit confirmation)
   aws s3api delete-bucket --bucket "$BUCKET" --region eu-north-1
   ```

### 9.2 Decommissioning KMS Customer Managed Key
- **Irreversible Cryptographic Destruction**: Scheduling a KMS key for deletion renders all associated encrypted data permanently lost once the waiting period expires.
- Before scheduling deletion, the administrator must confirm:
  1. No active EBS volumes or AMIs use this key.
  2. No active S3 buckets or objects use this key.
  3. The key has been disabled for at least 30 continuous days without any access requests (`aws kms get-key-rotation-status`, CloudTrail logs).
- Execution:
  ```bash
  # APPROVAL-ONLY: Schedule key deletion with maximum safety window (30 days)
  aws kms schedule-key-deletion --key-id "$KEY_ID" --pending-window-in-days 30 --region eu-north-1
  ```
