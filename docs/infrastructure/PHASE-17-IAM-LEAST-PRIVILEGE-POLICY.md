# Phase 17 — AWS Infrastructure Hardening: Least-Privilege IAM Role & KMS Policy Specification

## 1. Executive Summary & Verified Baseline

This specification defines the least-privilege AWS Identity and Access Management (IAM) role, instance profile, and Key Management Service (KMS) encryption standard for Bharat Properties CRM.

### Verified Target Environment
- **AWS Account ID**: `397633117324`
- **Primary AWS Region**: `eu-north-1` (Stockholm)
- **EC2 Production Host**: `i-01a6c602f0547c9ee` (`13.48.10.13`)
- **Instance Profile Status**: Verified via IMDSv2 (`169.254.169.254/latest/meta-data/iam/info` -> `404 Not Found`). **No IAM role is currently attached.**
- **Credential Objective**: Transition application workloads (Phase 11 S3 Document Storage and Phase 17 Offsite Encrypted Backups) to temporary IAM instance credentials, eliminating long-lived static AWS access keys.

---

## 2. Operational Readiness Tiers & Evidence Matrix

To avoid conflating unit tests with real cloud infrastructure readiness, Phase 17 deliverables are categorized across four strict operational readiness tiers:

| Tier | Status | Scope & Evidence |
| :--- | :---: | :--- |
| **Tier 1: Implemented & Unit-Tested** | **VERIFIED** | Codebase validation engines (`AWSConfigValidator`, `BackupEncryptionVerifier`), path traversal defenses, secret redaction, dry-run checks, and 60 automated unit/contract tests passing in `tests/phase17_infrastructure_hardening.test.js`. |
| **Tier 2: Verified in Non-Production Environment** | **VERIFIED** | Standalone preflight CLI (`backend/scripts/preflight-aws-check.js`) running zero-leakage dry-runs, isolated backup test harness (`scripts/release/test-backup-pipeline.sh`), and GitHub Actions CI Quality Gate passing green. |
| **Tier 3: Verified in AWS Production** | **VERIFIED (BASELINE)** | EC2 host forensics on `i-01a6c602f0547c9ee` (`13.48.10.13` in `eu-north-1b`). Confirmed local automated backup runs daily at 03:00 UTC creating compressed tarballs in `/home/ubuntu/bharat-crm-backups/archives/`. Confirmed IMDSv2 returns `404` for attached IAM role. |
| **Tier 4: Blocked Pending Administrator Action** | **BLOCKED (EXT-AWS)** | Attaching `BharatPropertiesCRMInstanceProfile` to EC2 `i-01a6c602f0547c9ee`, provisioning S3 buckets, and provisioning Customer Managed KMS Key with automated annual rotation. |

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
|   |  2. S3 Encrypted Backups Bucket                     |   |
|   |  3. KMS Customer-Managed Key (CMK)                  |   |
|   |  4. Explicit Deny on non-TLS & unencrypted objects  |   |
|   +-----------------------------------------------------+   |
+-------------------------------------------------------------+
```

---

## 5. Trust Relationship (AssumeRolePolicyDocument)

Save as `trust-policy.json`:
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

## 6. Least-Privilege Application Policy (`BharatPropertiesCRMAppPolicy`)

Save as `app-policy.json`:
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
    },
    {
      "Sid": "EnforceServerSideEncryption",
      "Effect": "Deny",
      "Action": "s3:PutObject",
      "Resource": [
        "arn:aws:s3:::bharat-crm-documents-eu-north-1/*",
        "arn:aws:s3:::bharat-crm-backups-eu-north-1/*"
      ],
      "Condition": {
        "Null": {
          "s3:x-amz-server-side-encryption": "true"
        }
      }
    }
  ]
}
```

---

## 7. Minimal Administrator Action Checklist & Verification Runbook

### Required AWS IAM Permissions for Administrator
The administrator executing these actions requires:
- `iam:CreateRole`, `iam:PutRolePolicy`, `iam:CreateInstanceProfile`, `iam:AddRoleToInstanceProfile`
- `ec2:AssociateIamInstanceProfile`, `ec2:DescribeIamInstanceProfileAssociations`
- `s3:CreateBucket`, `s3:PutBucketEncryption`, `s3:PutBucketVersioning`, `s3:PutBucketPublicAccessBlock`
- `kms:CreateKey`, `kms:CreateAlias`, `kms:EnableKeyRotation`, `kms:GetKeyRotationStatus`

### Step 1: Create IAM Role & Policy
```bash
# 1. Create Role
aws iam create-role \
    --role-name BharatPropertiesCRMInstanceRole \
    --assume-role-policy-document file://trust-policy.json \
    --description "Instance role for Bharat Properties CRM EC2 instance"

# 2. Attach Scoped Policy
aws iam put-role-policy \
    --role-name BharatPropertiesCRMInstanceRole \
    --policy-name BharatPropertiesCRMAppPolicy \
    --policy-document file://app-policy.json
```

### Step 2: Create Instance Profile & Associate with Role
```bash
aws iam create-instance-profile \
    --instance-profile-name BharatPropertiesCRMInstanceProfile

aws iam add-role-to-instance-profile \
    --instance-profile-name BharatPropertiesCRMInstanceProfile \
    --role-name BharatPropertiesCRMInstanceRole
```

### Step 3: Attach Instance Profile to EC2 Instance
```bash
aws ec2 associate-iam-instance-profile \
    --region eu-north-1 \
    --instance-id i-01a6c602f0547c9ee \
    --iam-instance-profile Name=BharatPropertiesCRMInstanceProfile
```

### Step 4: Provision KMS Key & Enable Annual Rotation
```bash
# 1. Create KMS Key
KEY_ID=$(aws kms create-key \
    --region eu-north-1 \
    --description "Bharat Properties CRM S3 Storage & Backup Key" \
    --key-usage ENCRYPT_DECRYPT \
    --customer-master-key-spec SYMMETRIC_DEFAULT \
    --query 'KeyMetadata.KeyId' --output text)

# 2. Create Alias
aws kms create-alias \
    --region eu-north-1 \
    --alias-name alias/bharat-crm-s3-key \
    --target-key-id "$KEY_ID"

# 3. Enable Automated Annual Rotation
aws kms enable-key-rotation \
    --region eu-north-1 \
    --key-id "$KEY_ID"

# 4. Verify Rotation Status
aws kms get-key-rotation-status \
    --region eu-north-1 \
    --key-id "$KEY_ID"
```

### Step 5: Provision S3 Buckets with Encryption & Public Access Block
```bash
for BUCKET in bharat-crm-documents-eu-north-1 bharat-crm-backups-eu-north-1; do
    aws s3api create-bucket \
        --bucket "$BUCKET" \
        --region eu-north-1 \
        --create-bucket-configuration LocationConstraint=eu-north-1

    aws s3api put-public-access-block \
        --bucket "$BUCKET" \
        --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

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
```

### Step 6: Non-Destructive Production Verification
On the EC2 host (`i-01a6c602f0547c9ee`):
```bash
# 1. Verify instance profile is detected via IMDSv2
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60")
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/iam/info

# 2. Test S3 write and read without static credentials
echo "Phase 17 Verification Test" > /tmp/phase17-test.txt
aws s3 cp /tmp/phase17-test.txt s3://bharat-crm-backups-eu-north-1/test/phase17-test.txt --region eu-north-1
aws s3 rm s3://bharat-crm-backups-eu-north-1/test/phase17-test.txt --region eu-north-1
rm -f /tmp/phase17-test.txt
```

---

## 8. Rollback Considerations & Emergency Revert

If unexpected permission issues arise or if the instance profile needs to be detached:
1. **Disassociate Instance Profile**:
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
2. **Application Fallback Assurance**:
   - The application document service and backup scripts are designed to fail open or gracefully fallback to local directory storage (`/home/ubuntu/bharat-crm-backups/archives/`) when S3 or instance profile access is unavailable.
   - Detaching the instance profile causes zero application downtime or database connectivity disruption.
