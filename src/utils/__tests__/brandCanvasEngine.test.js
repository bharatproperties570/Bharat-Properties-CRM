import { describe, it, expect, vi } from 'vitest';
import { BRAND_COLORS, brandifyPropertyImage, isAuthoritativelyVerified } from '../brandCanvasEngine';

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

  describe('isAuthoritativelyVerified predicate', () => {
    it('returns false for generic boolean fields alone without statutory evidence', () => {
      expect(isAuthoritativelyVerified({ isVerified: true })).toBe(false);
      expect(isAuthoritativelyVerified({ titleVerified: true })).toBe(false);
      expect(isAuthoritativelyVerified({ isTitleVerified: true })).toBe(false);
      expect(isAuthoritativelyVerified({ reraId: 'HRERA-PKL-123' })).toBe(false);
      expect(isAuthoritativelyVerified({ isVerified: true, titleVerified: true })).toBe(false);
      expect(isAuthoritativelyVerified(null)).toBe(false);
      expect(isAuthoritativelyVerified({})).toBe(false);
    });

    it('returns false for unrecognized authority or unapproved status or missing snapshot', () => {
      // Unrecognized authority
      expect(isAuthoritativelyVerified({
        authorityVerification: {
          authorityCode: 'UNKNOWN_MUNICIPAL',
          status: 'VERIFIED',
          verificationSnapshotId: 'snap-1'
        }
      })).toBe(false);

      // Unapproved status (PENDING)
      expect(isAuthoritativelyVerified({
        authorityVerification: {
          authorityCode: 'HSVP',
          status: 'PENDING',
          verificationSnapshotId: 'snap-1'
        }
      })).toBe(false);

      // Missing snapshot audit trail
      expect(isAuthoritativelyVerified({
        authorityVerification: {
          authorityCode: 'HSVP',
          status: 'VERIFIED'
        }
      })).toBe(false);

      // Active litigation dispute
      expect(isAuthoritativelyVerified({
        authorityVerification: {
          authorityCode: 'HSVP',
          status: 'VERIFIED',
          verificationSnapshotId: 'snap-1',
          litigationStatus: 'ACTIVE_DISPUTE'
        }
      })).toBe(false);
    });

    it('returns true when valid authoritative verification evidence is present', () => {
      expect(isAuthoritativelyVerified({
        authorityVerification: {
          authorityCode: 'HSVP',
          status: 'VERIFIED',
          verificationSnapshotId: 'snap-hsvp-9988',
          litigationStatus: 'CLEAN'
        }
      })).toBe(true);

      expect(isAuthoritativelyVerified({
        inventory: {
          authorityVerification: {
            authorityCode: 'GMADA',
            status: 'ALLOTTED',
            snapshotContentHash: 'hash-abc-123',
            litigationStatus: 'NO_DISPUTE'
          }
        }
      })).toBe(true);

      expect(isAuthoritativelyVerified({
        authorityLink: {
          authorityCode: 'CHD',
          identityVerified: true,
          identityVerifiedAt: new Date(),
          latestSnapshotId: 'snap-chd-44'
        }
      })).toBe(true);
    });
  });

  describe('Canvas Rendering & Badge Sanitization', () => {
    it('sanitizes untrusted generic boolean or forged badgeText to FEATURED PROPERTY', async () => {
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
          litigationStatus: 'CLEAN'
        }
      });
      expect(mockContext.fillText).toHaveBeenCalledWith('🛡️ VERIFIED PROPERTY', 56, 72);

      vi.restoreAllMocks();
    });
  });
});
