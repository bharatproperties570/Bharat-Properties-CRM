import { describe, it, expect, vi } from 'vitest';
import { BRAND_COLORS, brandifyPropertyImage, isAuthoritativelyVerified } from '../brandCanvasEngine';
import { hasAuthoritativeTitleVerification } from '../propertyComplianceValidator';

describe('brandCanvasEngine — Enterprise Visual Engine & Compliance', () => {
  it('exports correct official brand palette colors', () => {
    expect(BRAND_COLORS.navy).toBe('#0B1F3A');
    expect(BRAND_COLORS.gold).toBe('#C9921A');
    expect(BRAND_COLORS.goldLight).toBe('#FAD87A');
    expect(BRAND_COLORS.white).toBe('#FFFFFF');
  });

  it('rejects image generation when image source is missing', async () => {
    await expect(brandifyPropertyImage(null, {})).rejects.toThrow('Image source is required');
  });

  describe('isAuthoritativelyVerified predicate (Canonical Contract)', () => {
    it('returns false for generic boolean fields alone without statutory evidence', () => {
      expect(isAuthoritativelyVerified({ isVerified: true })).toBe(false);
      expect(isAuthoritativelyVerified({ titleVerified: true })).toBe(false);
      expect(isAuthoritativelyVerified({ isTitleVerified: true })).toBe(false);
      expect(isAuthoritativelyVerified({ reraId: 'HRERA-PKL-123' })).toBe(false);
      expect(isAuthoritativelyVerified({ isVerified: true, titleVerified: true })).toBe(false);
      expect(isAuthoritativelyVerified(null)).toBe(false);
      expect(isAuthoritativelyVerified({})).toBe(false);
    });

    it('returns false for missing litigation, active litigation, or unapproved status', () => {
      // Missing litigationStatus
      expect(isAuthoritativelyVerified({
        authorityVerification: {
          authorityCode: 'HSVP',
          status: 'VERIFIED',
          verificationSnapshotId: 'snap-1',
          snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0',
          lastVerifiedAt: new Date()
          // litigationStatus is missing
        }
      })).toBe(false);

      // Active litigation
      expect(isAuthoritativelyVerified({
        authorityVerification: {
          authorityCode: 'HSVP',
          status: 'VERIFIED',
          verificationSnapshotId: 'snap-1',
          snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0',
          lastVerifiedAt: new Date(),
          litigationStatus: 'LITIGATION_REPORTED'
        }
      })).toBe(false);

      // ALLOTTED / TRANSFERRED status without explicit title verification
      expect(isAuthoritativelyVerified({
        authorityVerification: {
          authorityCode: 'GMADA',
          status: 'ALLOTTED',
          verificationSnapshotId: 'snap-2',
          snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0',
          lastVerifiedAt: new Date(),
          litigationStatus: 'CLEAN'
        }
      })).toBe(false);

      expect(isAuthoritativelyVerified({
        authorityVerification: {
          authorityCode: 'HSVP',
          status: 'TRANSFERRED',
          verificationSnapshotId: 'snap-3',
          snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0',
          lastVerifiedAt: new Date(),
          litigationStatus: 'CLEAN'
        }
      })).toBe(false);
    });

    it('returns false for expired (>180 days) or future verification timestamps', () => {
      // Older than 180 days (e.g. 185 days)
      const oldDate = new Date(Date.now() - 185 * 24 * 60 * 60 * 1000);
      expect(isAuthoritativelyVerified({
        authorityVerification: {
          authorityCode: 'HSVP',
          status: 'VERIFIED',
          verificationSnapshotId: 'snap-old',
          snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0',
          lastVerifiedAt: oldDate,
          litigationStatus: 'CLEAN'
        }
      })).toBe(false);

      // Future date (e.g. 2 days ahead)
      const futureDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      expect(isAuthoritativelyVerified({
        authorityVerification: {
          authorityCode: 'HSVP',
          status: 'VERIFIED',
          verificationSnapshotId: 'snap-future',
          snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0',
          lastVerifiedAt: futureDate,
          litigationStatus: 'CLEAN'
        }
      })).toBe(false);
    });

    it('returns false for structurally invalid snapshot ID or content hash', () => {
      // Snapshot ID too short or placeholder
      expect(isAuthoritativelyVerified({
        authorityVerification: {
          authorityCode: 'HSVP',
          status: 'VERIFIED',
          verificationSnapshotId: 'no',
          snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0',
          lastVerifiedAt: new Date(),
          litigationStatus: 'CLEAN'
        }
      })).toBe(false);

      // Hash missing or placeholder
      expect(isAuthoritativelyVerified({
        authorityVerification: {
          authorityCode: 'HSVP',
          status: 'VERIFIED',
          verificationSnapshotId: 'snap-valid',
          snapshotContentHash: 'none',
          lastVerifiedAt: new Date(),
          litigationStatus: 'CLEAN'
        }
      })).toBe(false);
    });

    it('returns true when valid authoritative verification evidence is present', () => {
      const validHsvp = {
        authorityVerification: {
          authorityCode: 'HSVP',
          status: 'VERIFIED',
          verificationSnapshotId: 'snap-hsvp-9988',
          snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0',
          lastVerifiedAt: new Date(),
          litigationStatus: 'CLEAN'
        }
      };
      expect(isAuthoritativelyVerified(validHsvp)).toBe(true);

      const validLink = {
        authorityLink: {
          authorityCode: 'CHD',
          status: 'VERIFIED',
          identityVerified: true,
          identityVerifiedAt: new Date(),
          latestSnapshotId: 'snap-chd-44',
          snapshotContentHash: 'f0e1d2c3b4a59876543210fedcba9876',
          litigationStatus: 'NO_DISPUTE'
        }
      };
      expect(isAuthoritativelyVerified(validLink)).toBe(true);
    });

    // Requirement 19: Consistency between Brand Canvas and backend validator
    it('Requirement 19: Brand Canvas and backend return identical outcomes for identical evidence', () => {
      const testCases = [
        { isVerified: true },
        { titleVerified: true },
        { authorityVerification: { authorityCode: 'HSVP', status: 'VERIFIED' } },
        { authorityVerification: { authorityCode: 'HSVP', status: 'ALLOTTED' } },
        {
          authorityVerification: {
            authorityCode: 'HSVP',
            status: 'VERIFIED',
            verificationSnapshotId: 'snap-1',
            snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0',
            lastVerifiedAt: new Date(),
            litigationStatus: 'CLEAN'
          }
        },
        {
          authorityLink: {
            authorityCode: 'GMADA',
            status: 'VERIFIED',
            latestSnapshotId: 'snap-gmada-1',
            snapshotContentHash: '1234567890abcdef1234567890abcdef',
            identityVerifiedAt: new Date(),
            litigationStatus: 'CLEAN'
          }
        }
      ];

      for (const tc of testCases) {
        expect(isAuthoritativelyVerified(tc)).toBe(hasAuthoritativeTitleVerification(tc));
      }
    });
  });

  describe('Canvas Rendering & Badge Sanitization', () => {
    it('Requirement 18: Malicious or stale badgeText cannot override Brand Canvas verification', async () => {
      const mockContext = {
        drawImage: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        fillRect: vi.fn(),
        strokeRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        arcTo: vi.fn(),
        closePath: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        fillText: vi.fn(),
        measureText: vi.fn().mockReturnValue({ width: 120 }),
        createLinearGradient: vi.fn().mockReturnValue({
          addColorStop: vi.fn()
        })
      };

      const mockCanvas = {
        width: 1080,
        height: 1080,
        getContext: vi.fn().mockReturnValue(mockContext),
        toDataURL: vi.fn().mockReturnValue('data:image/jpeg;base64,mocked_canvas_data'),
        toBlob: vi.fn((cb) => cb(new Blob(['mocked'], { type: 'image/jpeg' })))
      };

      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag) => {
        if (tag === 'canvas') return mockCanvas;
        return originalCreateElement(tag);
      });

      const mockImage = { width: 800, height: 600 };

      // 1. Untrusted generic boolean alone without evidence -> FEATURED PROPERTY
      await brandifyPropertyImage(mockImage, {
        title: 'Unverified Villa',
        location: 'Sector 32, Kurukshetra',
        price: '₹ 2.5 Cr',
        isVerified: true
      });
      expect(mockContext.fillText).toHaveBeenCalledWith('✨ FEATURED PROPERTY', 56, 72);

      // 2. Forged badgeText on unverified record -> Sanitized to FEATURED PROPERTY
      mockContext.fillText.mockClear();
      await brandifyPropertyImage(mockImage, {
        title: 'Unverified Villa',
        location: 'Sector 32, Kurukshetra',
        price: '₹ 2.5 Cr',
        badgeText: '🛡️ VERIFIED PROPERTY'
      });
      expect(mockContext.fillText).toHaveBeenCalledWith('✨ FEATURED PROPERTY', 56, 72);

      // 3. Valid authoritative statutory evidence -> VERIFIED PROPERTY
      mockContext.fillText.mockClear();
      await brandifyPropertyImage(mockImage, {
        title: 'Statutory Verified Villa',
        location: 'Sector 32, Kurukshetra',
        price: '₹ 2.5 Cr',
        authorityVerification: {
          authorityCode: 'HSVP',
          status: 'VERIFIED',
          verificationSnapshotId: 'snap-verified-101',
          snapshotContentHash: 'a1b2c3d4e5f67890123456789abcdef0',
          lastVerifiedAt: new Date(),
          litigationStatus: 'CLEAN'
        }
      });
      expect(mockContext.fillText).toHaveBeenCalledWith('🛡️ VERIFIED PROPERTY', 56, 72);

      vi.restoreAllMocks();
    });
  });
});
