import { describe, it, expect } from 'vitest';
import {
  hasAuthoritativeTitleVerification,
  hasAuthoritativeReraApproval,
  extractVerificationFacts,
  validateAndSanitizeCopy,
  generateCompliantFallback,
  isAuthoritativelyVerified
} from '../propertyComplianceValidator';

describe('propertyComplianceValidator — Frontend Enforcement & Adversarial Protection', () => {
  const unverifiedDeal = {
    unitNo: 'Unit 404',
    projectName: 'Skyline Palms',
    location: 'Sector 5, Kurukshetra',
    price: '₹ 75 Lakhs',
    isVerified: true,
    titleVerified: true,
    isTitleVerified: true,
    reraId: 'HRERA-PKL-999-2024'
  };

  // ─────────────────────────────────────────────────────────────
  // REQUIREMENT 17: Frontend cannot elevate generic booleans to verified status
  // ─────────────────────────────────────────────────────────────
  it('Requirement 17: Frontend cannot elevate generic booleans to verified status', () => {
    expect(hasAuthoritativeTitleVerification(unverifiedDeal)).toBe(false);
    expect(isAuthoritativelyVerified(unverifiedDeal)).toBe(false);
    expect(hasAuthoritativeReraApproval(unverifiedDeal)).toBe(false);

    const facts = extractVerificationFacts(unverifiedDeal);
    expect(facts.isTitleVerified).toBe(false);
    expect(facts.isReraApproved).toBe(false);
    expect(facts.titleEvidenceCode).toBe(null);
    expect(facts.reraNumber).toBe(null);
  });

  // ─────────────────────────────────────────────────────────────
  // REQUIREMENT 14: Each local tone must not produce unsupported legal claims
  // ─────────────────────────────────────────────────────────────
  it('Requirement 14: Each local tone must not produce unsupported legal claims on unverified data', () => {
    const tones = ['urgent', 'luxury', 'investor', 'short_hook'];
    const unsupportedPhrases = [
      /verified title/i,
      /rera compliant/i,
      /rera approved/i,
      /clear registry/i,
      /clear documentation/i,
      /bank loan approved/i,
      /ready possession/i,
      /guaranteed return/i,
      /high-yield investment/i,
      /proven capital appreciation/i,
      /strong rental yield/i
    ];

    for (const tone of tones) {
      const fallback = generateCompliantFallback(unverifiedDeal, 'facebook', { tone, format: 'post' });
      for (const phrase of unsupportedPhrases) {
        expect(phrase.test(fallback)).toBe(false);
      }
      // Must contain safe neutral text
      expect(
        fallback.includes('Property details') || fallback.includes('Documentation status')
      ).toBe(true);
    }
  });

  // ─────────────────────────────────────────────────────────────
  // REQUIREMENT 15: AI error fallback must not produce unsupported legal claims
  // ─────────────────────────────────────────────────────────────
  it('Requirement 15: AI error fallback must not produce unsupported legal claims', () => {
    // When AI fails or throws, validateAndSanitizeCopy on null/error text falls back to safe compliant copy
    const facts = extractVerificationFacts(unverifiedDeal);
    const safeOutput = validateAndSanitizeCopy(null, facts, {
      deal: unverifiedDeal,
      platform: 'facebook',
      tone: 'urgent',
      format: 'post'
    });

    expect(/verified title/i.test(safeOutput)).toBe(false);
    expect(/rera/i.test(safeOutput)).toBe(false);
    expect(/clear registry/i.test(safeOutput)).toBe(false);
    expect(/guaranteed/i.test(safeOutput)).toBe(false);
    expect(/high-yield/i.test(safeOutput)).toBe(false);
    expect(safeOutput).toContain('Documentation status can be checked during due diligence');
  });

  // ─────────────────────────────────────────────────────────────
  // REQUIREMENT 16: AI success output must pass the compliance validator
  // ─────────────────────────────────────────────────────────────
  it('Requirement 16: AI success output with hallucinations is sanitized before display', () => {
    const facts = extractVerificationFacts(unverifiedDeal);
    const hallucinatoryAiText = `🔥 PRIME DEAL: Unit 404 at Skyline Palms!
Kurukshetra prime location! 100% Verified Title & Clear Registry, RERA Approved!
Bank Loan Approved! High-Yield Investment Opportunity with Guaranteed Returns!
Call +91 99913 33570 today!`;

    const sanitized = validateAndSanitizeCopy(hallucinatoryAiText, facts, {
      deal: unverifiedDeal,
      platform: 'facebook',
      tone: 'urgent',
      format: 'post'
    });

    expect(/verified title/i.test(sanitized)).toBe(false);
    expect(/clear registry/i.test(sanitized)).toBe(false);
    expect(/rera/i.test(sanitized)).toBe(false);
    expect(/guaranteed return/i.test(sanitized)).toBe(false);
    expect(/high-yield/i.test(sanitized)).toBe(false);
  });
});
